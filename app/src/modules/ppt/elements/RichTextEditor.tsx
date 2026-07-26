import { useLayoutEffect, useRef } from 'react'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { generateHTML } from '@tiptap/html'
import { usePptStore } from '../store'

const extensions = [
  StarterKit.configure({
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    heading: { levels: [1, 2, 3] },
    trailingNode: { notAfter: ['paragraph', 'bulletList', 'orderedList', 'listItem'] },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  FontFamily.configure({ types: ['textStyle'] }),
  Color,
  Highlight,
]

interface RichTextEditorProps {
  content: any
  fontSize: number
  fontColor: string
  fontFamily: string
  fontWeight?: string
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  lineHeight: number
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  onBlur: (json: any) => void
  onCancel: () => void
  onComplete: (json: any) => void
  onHeightChange?: (h: number) => void
}

export function RichTextEditor({
  content,
  fontSize, fontColor, fontFamily,
  fontWeight, fontStyle, textDecoration,
  lineHeight, textAlign, letterSpacing,
  onBlur, onCancel, onComplete, onHeightChange,
}: RichTextEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const initialContentRef = useRef(content)
  const completingRef = useRef(false)
  const onHeightChangeRef = useRef(onHeightChange)
  onHeightChangeRef.current = onHeightChange

  useLayoutEffect(() => {
    if (!mountRef.current) return

    const styleStr = [
      `font-size:${fontSize}px`,
      `color:${fontColor}`,
      `font-family:${fontFamily === 'inherit' ? 'inherit' : fontFamily}`,
      `font-weight:${fontWeight || 'normal'}`,
      `font-style:${fontStyle || 'normal'}`,
      `text-decoration:${textDecoration || 'none'}`,
      `line-height:${lineHeight}`,
      `text-align:${textAlign}`,
      `letter-spacing:${letterSpacing}px`,
      `outline:none`,
      `padding:0`,
      `margin:0`,
      `overflow-wrap:break-word`,
      `word-break:break-word`,
      `white-space:pre-wrap`,
      `list-style-position:${textAlign === 'left' ? 'outside' : 'inside'}`,
    ].join(';')

    const ed = new Editor({
      element: mountRef.current,
      extensions,
      content: initialContentRef.current,
      autofocus: true,
      editable: true,
      editorProps: {
        attributes: {
          style: styleStr,
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            completingRef.current = true
            onCancel()
            return true
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            completingRef.current = true
            onComplete(editorRef.current?.getJSON() || initialContentRef.current)
            return true
          }
          if (event.key === 'Tab') {
            event.preventDefault()
            const ed = editorRef.current
            if (!ed) return true
            const { $from } = ed.state.selection
            const inList = $from.node(-1)?.type.name === 'listItem'
            if (event.shiftKey) {
              if (inList) {
                ed.chain().focus().liftListItem('listItem').run()
              }
            } else {
              if (inList) {
                ed.chain().focus().sinkListItem('listItem').run()
              } else {
                ed.chain().focus().insertContent('\t').run()
              }
            }
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        initialContentRef.current = editor.getJSON()
        if (onHeightChangeRef.current) {
          const dom = editor.view.dom
          if (dom) {
            const contentH = dom.scrollHeight
            onHeightChangeRef.current(contentH + 4)
          }
        }
      },
      onBlur: ({ editor }) => {
        if (completingRef.current) return
        onBlur(editor.getJSON())
      },
    })

    editorRef.current = ed
    usePptStore.getState().setActiveEditor(ed)

    const timeout = setTimeout(() => {
      ed.commands.focus('end')
    }, 50)

    return () => {
      clearTimeout(timeout)
      usePptStore.getState().setActiveEditor(null)
      editorRef.current = null
      ed.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      className="tl-rich-text"
      style={{ position: 'absolute', top: 2, left: 4, right: 4, bottom: 2, zIndex: 1 }}
    />
  )
}

// ─── useRichText hook (for PropsPanel) ───

export function useRichText() {
  const editor = usePptStore((s) => s.activeEditor)
  return {
    editor,
    isBold: editor?.isActive('bold') ?? false,
    isItalic: editor?.isActive('italic') ?? false,
    isUnderline: editor?.isActive('underline') ?? false,
    isStrike: editor?.isActive('strike') ?? false,
    isBulletList: editor?.isActive('bulletList') ?? false,
    isOrderedList: editor?.isActive('orderedList') ?? false,
    textAlign: (['left', 'center', 'right'] as const).find((a) =>
      editor?.isActive({ textAlign: a })
    ),
    fontFamily: (editor?.getAttributes('textStyle').fontFamily as string) ?? null,
    fontSize: (editor?.getAttributes('textStyle').fontSize as string) ?? null,
    color: (editor?.getAttributes('textStyle').color as string) ?? null,
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
    toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    setTextAlign: (a: string) =>
      editor?.chain().focus().setTextAlign(a as any).run(),
    setFontFamily: (f: string) =>
      editor?.chain().focus().setFontFamily(f === 'inherit' ? '' : f).run(),
    setFontSize: (s: string) =>
      editor?.chain().focus().setFontSize(s).run(),
    setColor: (c: string) =>
      editor?.chain().focus().setColor(c).run(),
  }
}

// ─── Read-only HTML rendering ───

const htmlCache = new WeakMap<any, string>()

export function renderRichTextHTML(content: any): string {
  if (!content || typeof content !== 'object') return ''
  const cached = htmlCache.get(content)
  if (cached) return cached
  try {
    const html = generateHTML(content, extensions)
    const fixed = html.replaceAll('<p></p>', '<p><br /></p>')
    htmlCache.set(content, fixed)
    return fixed
  } catch {
    return ''
  }
}
