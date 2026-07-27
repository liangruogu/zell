import { Node } from '@tiptap/core'

export const MathInlineNode = Node.create({
  name: 'math_inline',
  group: 'inline math',
  content: 'text*',
  inline: true,
  atom: true,

  parseHTML() {
    return [{ tag: 'math-inline' }]
  },
  renderHTML() {
    return ['math-inline', { class: 'math-node' }, 0]
  },
})

export const MathDisplayNode = Node.create({
  name: 'math_display',
  group: 'block math',
  content: 'text*',
  atom: true,
  code: true,

  parseHTML() {
    return [{ tag: 'math-display' }]
  },
  renderHTML() {
    return ['math-display', { class: 'math-node' }, 0]
  },
})
