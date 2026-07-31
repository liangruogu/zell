import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type * as Y from 'yjs'

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
            const update = () => {
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
                span.className = 'collab-cursor'
                span.style.borderLeft = `2px solid ${color}`

                const label = document.createElement('span')
                label.textContent = name
                label.style.cssText = `
                  position:absolute;top:-1.2em;left:-1px;font-size:10px;line-height:1;
                  padding:1px 4px;border-radius:3px 3px 3px 0;white-space:nowrap;
                  background:${color};color:#fff;pointer-events:none;
                `
                span.appendChild(label)

                decos.push(Decoration.widget(pos, () => span, {
                  key: `cursor-${remoteId}`,
                }))
              })

              editorView.dispatch(
                editorView.state.tr.setMeta(pluginKey, DecorationSet.create(editorView.state.doc, decos))
              )
            }

            const awareness = getAwareness()
            if (awareness) {
              awareness.on('change', update)
              update()
            }

            return {
              destroy: () => {
                if (awareness) awareness.off('change', update)
              },
            }
          },
        }),
      ]
    },
  })
}
