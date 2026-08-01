import { useRef } from 'react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

interface UseEditorPluginsParams {
  editorRef: React.MutableRefObject<Editor | null>
  handleSave: () => void
}

export function useEditorPlugins({ editorRef, handleSave }: UseEditorPluginsParams) {
  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  function isInCodeBlock(ed: Editor) {
    const { $from } = ed.state.selection
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'codeBlock') return true
    }
    return false
  }

  const trimCodeBlockPlugin = new Plugin({
    key: new PluginKey('trimCodeBlockTrailingNewline'),
    appendTransaction: (_transactions, oldState, newState) => {
      if (oldState.doc.eq(newState.doc)) return null
      let tr = newState.tr
      let changed = false
      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'codeBlock') {
          const text = node.textContent
          const newlines = text.match(/\n+$/)
          if (newlines && newlines[0].length > 0) {
            tr.delete(pos + text.length - newlines[0].length + 1, pos + text.length + 1)
            changed = true
          }
        }
      })
      return changed ? tr : null
    },
  })

  const markdownLinkPlugin = new Plugin({
    key: new PluginKey('markdownLink'),
    props: {
      handleTextInput: (view, from, to, text) => {
        if (text !== ')') return false
        const { state } = view
        const startPos = Math.max(0, from - 500)
        const before = state.doc.textBetween(startPos, from)
        const match = before.match(/\[([^\]]+)\]\((\S+)$/)
        if (!match) return false
        const href = match[2]
        const matchStart = startPos + (match.index || 0)
        const { tr } = state
        const linkMark = state.schema.marks.link.create({ href })
        tr.delete(matchStart, from)
        tr.insertText(match[1], matchStart)
        tr.addMark(matchStart, matchStart + match[1].length, linkMark)
        view.dispatch(tr)
        return true
      },
    },
  })

  const keyboardPlugin = new Plugin({
    key: new PluginKey('editorKeyboard'),
    props: {
      handleKeyDown: (_view, event) => {
        const ed = editorRef.current

        // Smart bracket skip — only in code blocks
        const closeBrackets: Record<string, string> = { '}': '{', ']': '[', ')': '(' }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key in closeBrackets) {
          if (ed && isInCodeBlock(ed)) {
            const { from } = ed.state.selection
            if (from < ed.state.doc.content.size) {
              const nextChar = ed.state.doc.textBetween(from, from + 1)
              if (nextChar === event.key) {
                event.preventDefault()
                ed.chain().focus().setTextSelection(from + 1).run()
                return true
              }
            }
          }
        }

        // Bracket auto-pairing: {} () [] — only in code blocks
        const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key in pairs) {
          if (ed && isInCodeBlock(ed)) {
            const { from, to, empty } = ed.state.selection
            event.preventDefault()
            const open = event.key
            const close = pairs[open]
            if (!empty) {
              ed.chain().focus().insertContentAt(from, open, { updateSelection: false })
                .insertContentAt(to + 1, close, { updateSelection: false })
                .setTextSelection({ from: from + 1, to: to + 1 }).run()
            } else {
              ed.chain().focus().insertContent(open + close).run()
              ed.commands.setTextSelection(from + 1)
              return true
            }
            return true
          }
        }

        // Quote auto-pairing — only in code blocks
        if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === '"' || event.key === "'")) {
          if (ed && isInCodeBlock(ed)) {
            const { from, to, empty } = ed.state.selection
            if (empty && from < ed.state.doc.content.size) {
              const nextChar = ed.state.doc.textBetween(from, from + 1)
              if (nextChar === event.key) {
                event.preventDefault()
                ed.chain().focus().setTextSelection(from + 1).run()
                return true
              }
            }
            event.preventDefault()
            const ch = event.key
            if (!empty) {
              ed.chain().focus().insertContentAt(from, ch, { updateSelection: false })
                .insertContentAt(to + 1, ch, { updateSelection: false })
                .setTextSelection({ from: from + 1, to: to + 1 }).run()
            } else {
              ed.chain().focus().insertContent(ch + ch).run()
              ed.commands.setTextSelection(from + 1)
              return true
            }
            return true
          }
        }

        // Auto-indent in code blocks
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
          if (!ed) return false
          const { $from } = ed.state.selection
          const codeBlock = $from.node($from.depth)
          if (codeBlock && codeBlock.type.name === 'codeBlock') {
            event.preventDefault()
            const fullText = $from.parent.textContent || ''
            const textBefore = fullText.slice(0, $from.parentOffset)
            const textAfter = fullText.slice($from.parentOffset)
            const lastNewline = textBefore.lastIndexOf('\n')
            const currentLine = textBefore.slice(lastNewline + 1)
            const indent = currentLine.match(/^(\s*)/)?.[1] || ''

            const afterTrimmed = textAfter.trimStart()
            if (afterTrimmed.startsWith('}')) {
              const spaces = '    '
              const tr = ed.state.tr
              const closePos = $from.pos + textAfter.indexOf('}')
              tr.replaceWith($from.pos, closePos + 1,
                ed.state.schema.text('\n' + indent + spaces + '\n' + indent + '}'))
              tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1 + indent.length + spaces.length))
              ed.view.dispatch(tr)
              return true
            }

            const trimmed = currentLine.trimEnd()
            const extraIndent = (trimmed.endsWith(':') && !trimmed.startsWith('http')) ? '    ' : ''
            ed.chain().focus().insertContent('\n' + indent + extraIndent).run()
            return true
          }
          return false
        }

        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (ed && isInCodeBlock(ed)) {
            event.preventDefault()
            editorRef.current?.chain().focus().insertContent('\t').run()
            return true
          }
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'X' || event.key === 'x')) {
          event.preventDefault()
          editorRef.current?.chain().focus().toggleTaskList().run()
          return true
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault()
          handleSaveRef.current()
          return true
        }

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'T' || event.key === 't')) {
          event.preventDefault()
          editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          return true
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'a' || event.key === 'A')) {
          if (!ed) return false
          const { $from } = ed.state.selection
          const cell = $from.node(-1)
          if (cell && (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader')) {
            event.preventDefault()
            const cellStart = $from.start(-1)
            const cellEnd = $from.end(-1)
            ed.chain().focus().setTextSelection({ from: cellStart, to: cellEnd }).run()
            return true
          }
          let codeBlockNode = null
          let codeBlockDepth = 0
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'codeBlock') {
              codeBlockNode = $from.node(d)
              codeBlockDepth = d
              break
            }
          }
          if (codeBlockNode) {
            event.preventDefault()
            const start = $from.start(codeBlockDepth)
            const end = $from.end(codeBlockDepth)
            ed.chain().focus().setTextSelection({ from: start, to: end }).run()
            return true
          }
          return false
        }

        return false
      },
    },
  })

  return {
    trimCodeBlockExt: Extension.create({ name: 'trimCodeBlock', addProseMirrorPlugins() { return [trimCodeBlockPlugin] } }),
    markdownLinkExt: Extension.create({ name: 'markdownLink', addProseMirrorPlugins() { return [markdownLinkPlugin] } }),
    keyboardExt: Extension.create({ name: 'editorKeyboard', addProseMirrorPlugins() { return [keyboardPlugin] } }),
  }
}
