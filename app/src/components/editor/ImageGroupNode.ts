import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'

export interface ImageGroupOptions {
  HTMLAttributes: Record<string, unknown>
}

export const ImageGroupNode = Node.create<ImageGroupOptions>({
  name: 'imageGroup',

  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      captions: {
        default: '[]',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-captions') || '[]',
        renderHTML: (attrs: Record<string, unknown>) => {
          const captions = attrs.captions as string
          if (!captions || captions === '[]') return {}
          return { 'data-captions': captions }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-image-group]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-image-group': '', class: 'image-group' }, HTMLAttributes), 0]
  },

  addCommands(): any {
    return {
      groupImages:
        (imagePositions: number[]) =>
        ({ tr, state, dispatch }: any) => {
          if (imagePositions.length < 2) return false
          const sorted = [...imagePositions].sort((a: number, b: number) => a - b)
          for (const pos of sorted) {
            const node = state.doc.nodeAt(pos)
            if (node?.type.name !== 'image') return false
          }
          const imageNodes: { node: any; pos: number }[] = []
          for (const pos of sorted) {
            const node = state.doc.nodeAt(pos)
            if (node) imageNodes.push({ node, pos })
          }
          const groupNode = state.schema.nodes.imageGroup.create(
            { captions: JSON.stringify(imageNodes.map(() => '')) },
            imageNodes.map((n) => n.node),
          )
          const firstPos = sorted[0]
          const lastEntry = imageNodes[imageNodes.length - 1]
          const endPos = lastEntry.pos + lastEntry.node.nodeSize
          tr.replaceWith(firstPos, endPos, groupNode)
          dispatch?.(tr)
          return true
        },

      ungroupImages:
        () =>
        ({ tr, state, dispatch }: any) => {
          const { from } = state.selection
          const node = state.doc.nodeAt(from)
          if (node?.type.name !== 'imageGroup') return false
          const children: ProseNode[] = []
          node.content.forEach((child: ProseNode) => children.push(child.copy()))
          const fragment = state.schema.nodes.doc.create(null, children).content
          tr.replaceWith(from, from + node.nodeSize, fragment)
          dispatch?.(tr)
          return true
        },
    }
  },
})
