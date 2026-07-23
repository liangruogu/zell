import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { Link } from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import hljs from 'highlight.js'
import { EditorToolbar } from './EditorToolbar'
import { FloatingImageMenu } from './FloatingImageMenu'
import { cn } from '@/lib/utils'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'
import { useSettingsStore } from '@/stores/settingsStore'
import { format } from '@/lib/format'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { readFile } from '@tauri-apps/plugin-fs'

const lowlight = createLowlight(common)

type EditorMode = 'wysiwyg' | 'split'

interface MarkdownEditorProps {
  content?: string
  editable?: boolean
  placeholder?: string
  onChange?: (html: string, markdown: string) => void
  onSave?: (html: string, markdown: string) => void
  className?: string
  autofocus?: boolean
  editorMode?: EditorMode
  onModeChange?: (mode: EditorMode) => void
  updatedAt?: string
}

export function MarkdownEditor({
  content = '',
  editable = true,
  placeholder = '开始写作...',
  onChange,
  onSave,
  className,
  autofocus = false,
  editorMode: externalMode,
  onModeChange,
  updatedAt,
}: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Load settings on mount to get toolbar preference
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useEffect(() => { loadSettings() }, [loadSettings])

  // Read toolbar visibility from settings
  const appearance = useSettingsStore((s) => s.settings['appearance'])
  let showToolbar = true
  try {
    if (appearance) {
      const parsed = JSON.parse(appearance)
      if (typeof parsed.showToolbar === 'boolean') showToolbar = parsed.showToolbar
    }
  } catch { /* use default */ }

  const [justSaved, setJustSaved] = useState(false)

  const [internalMode, setInternalMode] = useState<EditorMode>('wysiwyg')
  const mode = externalMode ?? internalMode

  const initialHtml = useMemo(() => markdownToHtml(content || ''), [])

  const handleModeToggle = useCallback(() => {
    const next = mode === 'wysiwyg' ? 'split' : 'wysiwyg'
    if (onModeChange) {
      onModeChange(next)
    } else {
      setInternalMode(next)
    }
  }, [mode, onModeChange])

  const ignoreNextSync = useRef(false)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const handleUpdate = useCallback(
    ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
      if (!editor) return
      ignoreNextSync.current = true
      const html = editor.getHTML()
      const md = htmlToMarkdown(html)
      onChangeRef.current?.(html, md)
    },
    []
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Image.configure({ allowBase64: true, inline: false }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: 'text-bindle-600 underline cursor-pointer' },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content: initialHtml,
    editable: editable,
    autofocus: autofocus ? 'end' : false,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'prose bindle-prose focus:outline-none min-h-[300px] px-6 py-4',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault()
          editorRef.current?.chain().focus().insertContent('\t').run()
          return true
        }
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'X' || event.key === 'x')) {
          event.preventDefault()
          editorRef.current?.chain().focus().toggleTaskList().run()
          return true
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 's' || event.key === 'S')) {
          event.preventDefault()
          handleSave()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              const reader = new FileReader()
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string
                editorRef.current?.chain().focus().setImage({ src: dataUrl }).run()
              }
              reader.readAsDataURL(file)
              return true
            }
          }
        }
        return false
      },
      handleDrop: (_view, event, _moved, _supported) => {
        const files = event.dataTransfer?.files
        if (!files) return false
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string
              editorRef.current?.chain().focus().setImage({ src: dataUrl }).run()
            }
            reader.readAsDataURL(file)
            return true
          }
        }
        return false
      },
    },
  })

  editorRef.current = editor

  const prevContentRef = useRef(content)
  useEffect(() => {
    if (!editor || mode !== 'wysiwyg') return
    if (ignoreNextSync.current) {
      ignoreNextSync.current = false
      prevContentRef.current = content
      return
    }
    if (content !== prevContentRef.current) {
      prevContentRef.current = content
      editor.commands.setContent(markdownToHtml(content || ''))
    }
  }, [content, editor, mode])

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable && mode === 'wysiwyg')
    }
  }, [editor, editable, mode])

  // Tauri native drag-and-drop: insert images from OS file manager
  useEffect(() => {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
    const unlisten = getCurrentWindow().onDragDropEvent(async (event) => {
      if (event.payload.type !== 'drop') return
      for (const filePath of event.payload.paths) {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        if (!imageExts.includes(ext)) continue
        try {
          const bytes = await readFile(filePath)
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
          const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))
          const dataUrl = `data:${mime};base64,${base64}`
          editorRef.current?.chain().focus().setImage({ src: dataUrl }).run()
        } catch { /* file read failed, skip */ }
      }
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  const handleSave = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const html = ed.getHTML()
    const md = htmlToMarkdown(html)
    onSave?.(html, md)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }, [onSave])

  // Typora-style: show # markers on active heading
  useEffect(() => {
    if (!editor) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const heading = target.closest?.('h1,h2,h3') as HTMLElement | null
      if (!heading || !editor.view.dom.contains(heading)) return
      const rect = heading.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      if (clickX > 36) return
      e.preventDefault()
      e.stopPropagation()
      const level = heading.tagName === 'H1' ? 1 : heading.tagName === 'H2' ? 2 : 3
      const nextLevel = level >= 3 ? 0 : level + 1
      if (nextLevel === 0) {
        editor.chain().focus().setParagraph().run()
      } else {
        editor.chain().focus().toggleHeading({ level: nextLevel as 1 | 2 | 3 }).run()
      }
    }

    // Keyboard: edit # markers at heading start
    const keyHandler = (e: KeyboardEvent) => {
      if (!editor.isEditable) return
      if (!editor.isActive('heading')) return
      const { $from } = editor.state.selection
      if ($from.parentOffset !== 0) return // only at position 0

      if (e.key === '#') {
        e.preventDefault()
        const attrs = editor.getAttributes('heading')
        const current = (attrs.level as number) || 1
        if (current < 3) {
          editor.chain().focus().toggleHeading({ level: (current + 1) as 1 | 2 | 3 }).run()
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        const attrs = editor.getAttributes('heading')
        const current = (attrs.level as number) || 1
        if (current > 1) {
          editor.chain().focus().toggleHeading({ level: (current - 1) as 1 | 2 | 3 }).run()
        } else {
          editor.chain().focus().setParagraph().run()
        }
      }
    }

    const dom = editor.view.dom
    dom.addEventListener('click', handler, true)
    dom.addEventListener('keydown', keyHandler, true)
    return () => {
      dom.removeEventListener('click', handler, true)
      dom.removeEventListener('keydown', keyHandler, true)
    }
  }, [editor])

  // ------ Split mode ------
  const [splitSource, setSplitSource] = useState('')
  const [splitRatio, setSplitRatio] = useState(50) // percentage for left panel
  const [splitDragging, setSplitDragging] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)
  const splitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSplitResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setSplitDragging(true)
  }, [])

  useEffect(() => {
    if (!splitDragging) return
    const onMouseMove = (e: MouseEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitRatio(Math.min(80, Math.max(20, pct)))
    }
    const onMouseUp = () => setSplitDragging(false)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [splitDragging])

  useEffect(() => {
    if (mode === 'split') {
      if (editor) {
        const latestMd = htmlToMarkdown(editor.getHTML())
        setSplitSource(latestMd || content || '')
      } else {
        setSplitSource(content || '')
      }
    }
  }, [mode])

  const handleSplitChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const md = e.target.value
      setSplitSource(md)
      const html = markdownToHtml(md)
      if (splitTimerRef.current) clearTimeout(splitTimerRef.current)
      splitTimerRef.current = setTimeout(() => {
        onChangeRef.current?.(html, md)
      }, 500)
    },
    []
  )

  const previewRef = useRef<HTMLDivElement>(null)
  const previewHtml = useMemo(() => {
    if (mode === 'split' && splitSource) {
      const raw = markdownToHtml(splitSource)
      const div = document.createElement('div')
      div.innerHTML = raw
      div.querySelectorAll('pre code[class*="language-"]').forEach((code) => {
        const pre = code.parentElement!
        const match = code.className.match(/language-(\w+)/)
        if (match) {
          const lang = match[1]
          pre.setAttribute('data-language', lang)
          if (hljs.getLanguage(lang)) {
            try {
              const text = code.textContent || ''
              code.innerHTML = hljs.highlight(text, { language: lang }).value
              code.classList.add('hljs')
            } catch { /* fallback */ }
          }
        }
      })
      return div.innerHTML
    }
    return ''
  }, [mode, splitSource])

  // Current code block language for status bar (Typora style)
  const codeBlockLang = useMemo(() => {
    if (!editor || mode !== 'wysiwyg') return null
    if (editor.isActive('codeBlock')) {
      const attrs = editor.getAttributes('codeBlock')
      return attrs.language || null
    }
    return null
  }, [mode, editor, editor?.state.selection])

  if (!editor) {
    return <div className="p-6 text-gray-400">加载编辑器中...</div>
  }

  return (
    <div className={cn('flex flex-col h-full border border-gray-200 rounded-lg overflow-hidden bg-white', className)}>
      {editable && showToolbar && (
        <EditorToolbar editor={editor} editorMode={mode} onToggleMode={handleModeToggle} />
      )}

      {mode === 'wysiwyg' ? (
        <>
          <div className="flex-1 overflow-auto">
            <EditorContent editor={editor} />
          </div>
          <FloatingImageMenu editor={editor} />
        </>
      ) : (
        <div ref={splitContainerRef} className="flex-1 flex min-h-0">
          <div className="flex flex-col border-r border-gray-200" style={{ width: `${splitRatio}%` }}>
            <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-b border-gray-100 shrink-0">
              Markdown 源码
            </div>
            <textarea
              value={splitSource}
              onChange={handleSplitChange}
              placeholder={placeholder}
              className="flex-1 w-full resize-none p-4 text-sm font-mono focus:outline-none bg-white leading-relaxed"
              spellCheck={false}
            />
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={handleSplitResizeStart}
            className={cn(
              'w-1.5 shrink-0 cursor-col-resize transition-colors z-10',
              splitDragging ? 'bg-bindle-400' : 'hover:bg-bindle-300'
            )}
          />

          <div className="flex-1 flex flex-col">
            <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-b border-gray-100 shrink-0">
              预览
            </div>
            <div
              ref={previewRef}
              className="flex-1 overflow-auto p-4 prose bindle-prose"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      )}

      <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex justify-between shrink-0">
        <span>
          {mode === 'wysiwyg'
            ? `${editor.storage.characterCount?.characters?.() ?? 0} 字符`
            : `${splitSource.length} 字符`}
          {codeBlockLang && (
            <span className="ml-3 text-bindle-500 font-medium">{codeBlockLang}</span>
          )}
          {justSaved && (
            <span className="ml-3 text-green-500">✓ 已保存</span>
          )}
          {updatedAt && !justSaved && (
            <span className="ml-3">· 更新于 {format.relativeTime(updatedAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleModeToggle}
            className="hover:text-gray-600 transition-colors cursor-pointer"
            title="点击切换视图"
          >
            {mode === 'wysiwyg' ? '所见即所得' : '分屏模式'}
          </button>
        </span>
      </div>
    </div>
  )
}
