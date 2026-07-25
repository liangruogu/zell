import type { Editor } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'

export class ImageGroupView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private node: ProseNode
  private getPos: () => number
  private editor: Editor

  constructor(node: ProseNode, getPos: () => number, editor: Editor) {
    this.node = node
    this.getPos = getPos
    this.editor = editor

    this.dom = document.createElement('div')
    this.dom.classList.add('image-group')
    this.dom.setAttribute('data-image-group', '')

    // contentDOM is where ProseMirror renders <img> children
    this.contentDOM = document.createElement('div')
    this.contentDOM.classList.add('image-group-content')
    this.dom.appendChild(this.contentDOM)

    // Initial caption setup after DOM renders
    requestAnimationFrame(() => this.injectCaptions())
  }

  private injectCaptions() {
    const imgs = this.contentDOM.querySelectorAll(':scope > img')
    if (imgs.length === 0) return

    let captions: string[] = []
    try {
      captions = JSON.parse(this.node.attrs.captions || '[]')
    } catch { captions = [] }

    // Count existing wrapped images
    const existingItems = this.contentDOM.querySelectorAll(':scope > .image-item')
    const existingCount = existingItems.length

    // If counts match, just update caption values
    if (existingCount === imgs.length) {
      this.contentDOM.querySelectorAll('.image-caption').forEach((inp, i) => {
        ;(inp as HTMLInputElement).value = captions[i] || ''
      })
      return
    }

    // Wrap each img in an .image-item div with caption input
    imgs.forEach((img, i) => {
      // Skip if already wrapped
      if (img.parentElement?.classList.contains('image-item')) return

      const item = document.createElement('div')
      item.classList.add('image-item')
      img.parentNode?.insertBefore(item, img)
      item.appendChild(img)

      const input = document.createElement('input')
      input.type = 'text'
      input.classList.add('image-caption')
      input.placeholder = '标题'
      input.value = captions[i] || ''
      input.addEventListener('input', () => this.collectAndSave())
      input.addEventListener('mousedown', (e) => e.stopPropagation())
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
          const pos = this.getPos()
          const endPos = pos + this.node.nodeSize
          this.editor.chain().focus().setTextSelection(endPos).run()
        }
        e.stopPropagation()
      })
      item.appendChild(input)
    })
  }

  private collectAndSave() {
    const inputs = this.contentDOM.querySelectorAll('.image-caption')
    const values = Array.from(inputs).map((inp) => (inp as HTMLInputElement).value)
    const pos = this.getPos()
    const tr = this.editor.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      captions: JSON.stringify(values),
    })
    this.editor.view.dispatch(tr)
  }

  update(newNode: ProseNode): boolean {
    if (newNode.type.name !== 'imageGroup') return false
    this.node = newNode
    requestAnimationFrame(() => this.injectCaptions())
    return true
  }

  ignoreMutation(mutation: MutationRecord): boolean {
    // Ignore mutations to our caption inputs and wrappers
    const target = mutation.target as HTMLElement
    if (target.classList?.contains('image-caption')) return true
    if (target.classList?.contains('image-item')) return true
    if (target.classList?.contains('image-group-content')) return true
    return false
  }

  stopEvent(event: Event): boolean {
    // Don't let ProseMirror handle events on caption inputs
    const target = event.target as HTMLElement
    if (target.classList?.contains('image-caption')) return true
    return false
  }

  destroy() {}
}
