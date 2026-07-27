import { Extension } from '@tiptap/core'
import {
  mathPlugin,
  mathBackspaceCmd,
  insertMathCmd,
  makeInlineMathInputRule,
  makeBlockMathInputRule,
  REGEX_INLINE_MATH_DOLLARS,
  REGEX_BLOCK_MATH_DOLLARS,
} from '@benrbray/prosemirror-math'
import { inputRules } from '@tiptap/pm/inputrules'
import { keymap } from '@tiptap/pm/keymap'
import { chainCommands, deleteSelection, selectNodeBackward, joinBackward } from '@tiptap/pm/commands'
import { NodeSelection } from '@tiptap/pm/state'
import 'katex/dist/katex.min.css'
import '@benrbray/prosemirror-math/dist/prosemirror-math.css'

export const MathExtension = Extension.create({
  name: 'mathExt',

  addProseMirrorPlugins() {
    const schema = this.editor.schema
    const inlineRule = makeInlineMathInputRule(REGEX_INLINE_MATH_DOLLARS, schema.nodes.math_inline)
    const blockRule = makeBlockMathInputRule(REGEX_BLOCK_MATH_DOLLARS, schema.nodes.math_display)
    return [
      inputRules({ rules: [inlineRule, blockRule] }),
      keymap({
        Backspace: chainCommands(deleteSelection, mathBackspaceCmd, joinBackward, selectNodeBackward),
        'Mod-Space': insertMathCmd(schema.nodes.math_inline),
        Enter: (state, dispatch) => {
          // If current paragraph has only "$$", replace with math_display node
          const { $from } = state.selection
          const parent = $from.parent
          if (parent.type.name !== 'paragraph') return false
          if (parent.textContent !== '$$') return false
          if (!dispatch) return true
          const pos = $from.before($from.depth)
          const node = schema.nodes.math_display.create({}, schema.text(''))
          const tr = state.tr.replaceWith(pos, pos + parent.nodeSize, node)
          tr.setSelection(NodeSelection.create(tr.doc, pos))
          dispatch(tr)
          return true
        },
      }),
      mathPlugin,
    ]
  },
})
