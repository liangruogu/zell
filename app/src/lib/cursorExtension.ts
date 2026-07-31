import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

interface CursorUser { name: string; color: string }

export function createCursorExtension(getAwareness: () => any, getClientId: () => number) {
  return Extension.create({
    name: 'cursorAwareness',

    addProseMirrorPlugins() {
      const pluginKey = new PluginKey('cursorAwareness')

      return [
        new Plugin({
          key: pluginKey,
          state: {
            init: () => DecorationSet.empty,
            apply: (tr, old) => {
              const meta = tr.getMeta(pluginKey) as DecorationSet | undefined
              if (meta) return meta
              return old.map(tr.mapping, tr.doc)
            },
          },
          props: {
            decorations(state) {
              return pluginKey.getState(state) as DecorationSet
            },
          },
          view(editorView) {
            const buildDecorations = () => {
              const awareness = getAwareness()
              const clientId = getClientId()
              if (!awareness) return

              const decos: Decoration[] = []
              awareness.getStates().forEach((state: any, remoteId: number) => {
                if (remoteId === clientId) return
                const user: CursorUser | undefined = state.user
                if (!user?.name) return
                const cursor = state.cursor
                if (cursor == null || cursor.anchor == null) return

                const pos = cursor.anchor
                const name = user.name
                const color = user.color || '#999'

                const span = document.createElement('span')
                span.className = 'collaboration-cursor__caret'
                span.style.cssText = `
                  border-left: 1.5px solid ${color};
                  border-right: 1.5px solid ${color};
                  margin-left: -1px;
                  margin-right: -1px;
                  position: relative;
                  word-break: normal;
                  pointer-events: none;
                  display: inline;
                `

                const label = document.createElement('span')
                label.className = 'collaboration-cursor__label'
                label.textContent = name
                label.style.cssText = `
                  position: absolute;
                  top: -1.4em;
                  left: -1px;
                  font-size: 11px;
                  font-weight: 600;
                  line-height: 1;
                  padding: 1px 4px;
                  border-radius: 3px 3px 3px 0;
                  white-space: nowrap;
                  background: ${color};
                  color: #fff;
                  user-select: none;
                  pointer-events: none;
                `
                span.appendChild(label)

                const size = editorView.state.doc.content.size
                const safePos = Math.max(0, Math.min(pos, size))
                decos.push(Decoration.widget(safePos, () => span, {
                  key: `cursor-${remoteId}`,
                  side: -1,
                }))
              })

              editorView.dispatch(
                editorView.state.tr.setMeta(pluginKey, DecorationSet.create(editorView.state.doc, decos))
              )
            }

            const onBlur = () => {
              const aw = getAwareness()
              if (aw) aw.setLocalStateField('cursor', null)
            }
            editorView.dom.addEventListener('blur', onBlur)

            const awareness = getAwareness()
            if (awareness) {
              awareness.on('change', buildDecorations)
              buildDecorations()
            }

            return {
              update(view, prevState) {
                const sel = view.state.selection
                if (!prevState.selection.eq(sel)) {
                  const aw = getAwareness()
                  if (aw) {
                    aw.setLocalStateField('cursor', {
                      anchor: sel.anchor,
                      head: sel.head,
                    })
                  }
                }
              },
              destroy: () => {
                editorView.dom.removeEventListener('blur', onBlur)
                const aw = getAwareness()
                if (aw) {
                  aw.setLocalStateField('cursor', null)
                  aw.off('change', buildDecorations)
                }
              },
            }
          },
        }),
      ]
    },
  })
}
