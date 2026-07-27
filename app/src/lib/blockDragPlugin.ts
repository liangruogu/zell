import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'

const key = new PluginKey('blockDrag')

const BLOCK_TYPES = new Set([
  'paragraph', 'heading',
  'bulletList', 'orderedList', 'taskList',
  'blockquote', 'codeBlock', 'image',
])

const CONTAINER_TYPES = new Set(['bulletList', 'orderedList', 'taskList', 'blockquote'])

interface DragState {
  startPos: number
  nodeSize: number
  cloneEl: HTMLElement | null
  indicatorEl: HTMLElement | null
}

let drag: DragState | null = null

function cleanup() {
  drag?.cloneEl?.remove()
  drag?.indicatorEl?.remove()
  drag = null
}

function buildDecorationsForDoc(doc: any): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node: any, pos: number) => {
    if (!BLOCK_TYPES.has(node.type.name)) return
    const resolved = doc.resolve(pos)
    for (let d = resolved.depth - 1; d > 0; d--) {
      if (CONTAINER_TYPES.has(resolved.node(d).type.name)) return
    }
    decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'block-draggable' }))
  })
  return DecorationSet.create(doc, decos)
}

function findDropPos(view: EditorView, clientY: number): number | null {
  if (!drag) return null
  const editorRect = view.dom.getBoundingClientRect()
  const y = clientY - editorRect.top + (view.dom.parentElement?.scrollTop || 0)

  let targetPos: number | null = null
  let bestDist = Infinity

  view.state.doc.descendants((node, pos) => {
    if (!BLOCK_TYPES.has(node.type.name)) return
    if (pos === drag!.startPos) return
    const coords = view.coordsAtPos(pos)
    if (!coords) return
    const dist = Math.abs(coords.top - (editorRect.top + y))
    if (dist < bestDist && dist < 60) {
      bestDist = dist
      targetPos = y < coords.top - editorRect.top ? pos : pos + node.nodeSize
    }
  })

  if (targetPos !== null) {
    const resolved = view.state.doc.resolve(targetPos)
    for (let d = resolved.depth; d > 0; d--) {
      if (CONTAINER_TYPES.has(resolved.node(d).type.name)) {
        targetPos = drag.startPos < targetPos ? resolved.after(d) : resolved.before(d)
        break
      }
    }
  }

  return targetPos
}

const blockDragPlugin = new Plugin({
  key,
  state: {
    init(_, { doc }) { return buildDecorationsForDoc(doc) },
    apply(tr, oldSet) {
      if (tr.docChanged || tr.selectionSet) return buildDecorationsForDoc(tr.doc)
      return oldSet.map(tr.mapping, tr.doc)
    },
  },
  props: {
    decorations(state) { return key.getState(state) },
    handleDOMEvents: {
      mousedown(view, event) {
        const target = event.target as HTMLElement
        const block = target.closest('.block-draggable') as HTMLElement | null
        if (!block) return false
        const rect = block.getBoundingClientRect()
        if (event.clientX > rect.left || event.clientX < rect.left - 40) return false

        const pos = view.posAtDOM(block, 0)
        const node = pos !== null ? view.state.doc.nodeAt(pos) : null
        if (pos === null || !node) return false

        // Start native drag via temporary element
        const handle = document.createElement('div')
        handle.draggable = true
        Object.assign(handle.style, { position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px' })
        document.body.appendChild(handle)

        handle.addEventListener('dragstart', (e) => {
          e.dataTransfer!.effectAllowed = 'move'
          e.dataTransfer!.setData('text/plain', '')
          drag = { startPos: pos, nodeSize: node.nodeSize, cloneEl: null, indicatorEl: null }
          const clone = document.createElement('div')
          clone.textContent = block.textContent?.slice(0, 80) || '(empty)'
          Object.assign(clone.style, { position: 'fixed', left: '-9999px', top: '-9999px' })
          document.body.appendChild(clone)
          drag.cloneEl = clone
          e.dataTransfer!.setDragImage(new Image(), 0, 0)
          setTimeout(() => handle.remove(), 0)
        })

        handle.addEventListener('dragend', () => { cleanup(); setTimeout(() => handle.remove(), 0) })

        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: event.clientX, clientY: event.clientY, bubbles: true }))
        handle.dispatchEvent(new MouseEvent('mousemove', { clientX: event.clientX + 3, clientY: event.clientY + 3, bubbles: true }))

        event.preventDefault()
        return true
      },
      dragover(view, event) {
        if (!drag) return false
        event.preventDefault()
        event.dataTransfer!.dropEffect = 'move'
        if (drag.cloneEl) {
          Object.assign(drag.cloneEl.style, {
            position: 'fixed', left: (event.clientX - 20) + 'px', top: (event.clientY - 10) + 'px',
            opacity: '0.85', pointerEvents: 'none', zIndex: '9999',
            padding: '8px 12px', background: '#fff', borderRadius: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', fontSize: '13px', color: '#333',
            maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          })
        }
        const targetPos = findDropPos(view, event.clientY)
        if (targetPos !== null) {
          if (!drag.indicatorEl) {
            drag.indicatorEl = document.createElement('div')
            drag.indicatorEl.className = 'block-drag-indicator'
            view.dom.parentElement?.appendChild(drag.indicatorEl)
          }
          const coords = view.coordsAtPos(targetPos)
          if (coords) {
            const editorRect = view.dom.getBoundingClientRect()
            const containerRect = view.dom.parentElement!.getBoundingClientRect()
            drag.indicatorEl.style.left = (editorRect.left - containerRect.left) + 'px'
            drag.indicatorEl.style.top = (coords.top - containerRect.top - 2) + 'px'
            drag.indicatorEl.style.width = editorRect.width + 'px'
          }
        }
        return true
      },
      drop(view, event) {
        if (!drag) return false
        event.preventDefault()
        const targetPos = findDropPos(view, event.clientY)
        if (targetPos !== null && targetPos !== drag.startPos) {
          const tr = view.state.tr
          const slice = view.state.doc.slice(drag.startPos, drag.startPos + drag.nodeSize)
          const adjustedPos = targetPos > drag.startPos ? targetPos - drag.nodeSize : targetPos
          tr.delete(drag.startPos, drag.startPos + drag.nodeSize)
          tr.insert(Math.max(0, Math.min(adjustedPos, tr.doc.content.size)), slice.content)
          view.dispatch(tr)
        }
        cleanup()
        return true
      },
    },
  },
})

export const BlockDrag = Extension.create({
  name: 'blockDrag',
  addProseMirrorPlugins() { return [blockDragPlugin] },
})
