import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Highlight from '@tiptap/extension-highlight'
import { Link } from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Collaboration } from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { common, createLowlight } from 'lowlight'
import hljs from 'highlight.js'
import { EditorToolbar } from './EditorToolbar'
import { FloatingImageMenu } from './FloatingImageMenu'
import { TableToolbar } from './TableToolbar'
import { cn } from '@/lib/utils'
import { htmlToMarkdown, markdownToHtml, markdownToPreviewHtml } from '@/lib/markdown'
import { MathExtension } from '@/lib/mathExtension'
import { MathInlineNode, MathDisplayNode } from '@/lib/mathNodes'
import { useAIStore } from '@/stores/aiStore'
import { Sparkles, Download } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useSyncStore } from '@/stores/syncStore'
import { format } from '@/lib/format'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { readFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

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
  const isAIOpen = useAIStore((s) => s.isOpen)
  const openPanel = useAIStore((s) => s.openPanel)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Load settings on mount to get toolbar preference
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  useEffect(() => { loadSettings() }, [loadSettings])

  // Inject custom CSS (now handled by theme system)
  // Legacy custom_css setting support removed — use custom themes instead

  // Apply theme (default + custom)
  const appearanceSettings = useSettingsStore((s) => s.settings['appearance'])
  useEffect(() => {
    const apply = async () => {
      try {
        if (!appearanceSettings) {
          document.documentElement.removeAttribute('data-zell-theme')
          return
        }
        const parsed = JSON.parse(appearanceSettings)
        const theme = parsed.theme || ''
        const DEFAULT_THEME_KEYS = ['zell', 'github', 'report']
        if (DEFAULT_THEME_KEYS.includes(theme) || !theme) {
          document.documentElement.removeAttribute('data-zell-custom-theme')
          if (theme) {
            document.documentElement.setAttribute('data-zell-theme', theme)
          } else {
            document.documentElement.removeAttribute('data-zell-theme')
          }
          return
        }
        // Custom theme: load CSS file
        document.documentElement.removeAttribute('data-zell-theme')
        const { appDataDir, join } = await import('@tauri-apps/api/path')
        const { readTextFile } = await import('@tauri-apps/plugin-fs')
        const dir = await appDataDir()
        const filePath = await join(dir, 'themes', `${theme}.css`)
        const css = await readTextFile(filePath)
        document.documentElement.setAttribute('data-zell-custom-theme', theme)
        let styleEl = document.getElementById('zell-custom-theme') as HTMLStyleElement | null
        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.id = 'zell-custom-theme'
          document.head.appendChild(styleEl)
        }
        styleEl.textContent = css
      } catch {
        document.documentElement.removeAttribute('data-zell-theme')
        document.documentElement.removeAttribute('data-zell-custom-theme')
      }
    }
    apply()
  }, [appearanceSettings])

  // Collaboration mode
  const collabConnected = useSyncStore((s) => s.connected)
  const collabServerUrl = useSyncStore((s) => s.serverUrl)
  const collabToken = useSyncStore((s) => s.token)
  const collabYDocRef = useRef<Y.Doc | null>(null)
  const collabProviderRef = useRef<WebsocketProvider | null>(null)
  const collabEnabled = collabConnected && !!collabToken

  useEffect(() => {
    const article = useKnowledgeStore.getState().currentArticle
    if (!collabEnabled || !collabServerUrl || !article) return

    const ydoc = new Y.Doc()
    collabYDocRef.current = ydoc

    const wsBase = collabServerUrl.replace(/^http/, 'ws')
    const projectId = useProjectStore.getState().currentProject?.id
    if (!projectId) return

    const provider = new WebsocketProvider(`${wsBase}/ws`, `${projectId}/${article.id}`, ydoc, {
      params: { token: collabToken },
    })
    collabProviderRef.current = provider

    return () => {
      provider.disconnect()
      ydoc.destroy()
      collabYDocRef.current = null
      collabProviderRef.current = null
    }
  }, [collabEnabled, collabServerUrl, collabToken])

  // Re-create when current article changes
  const currentArticleId = useKnowledgeStore((s) => s.currentArticle?.id)
  const [collabKey, setCollabKey] = useState(0)

  useEffect(() => {
    if (!collabYDocRef.current || !collabProviderRef.current) return

    const article = useKnowledgeStore.getState().currentArticle
    const projectId = useProjectStore.getState().currentProject?.id
    if (!article || !projectId || !collabToken) return

    // Disconnect old provider
    collabProviderRef.current.disconnect()
    collabYDocRef.current.destroy()

    const ydoc = new Y.Doc()
    collabYDocRef.current = ydoc

    const wsBase = collabServerUrl.replace(/^http/, 'ws')
    const provider = new WebsocketProvider(`${wsBase}/ws`, `${projectId}/${article.id}`, ydoc, {
      params: { token: collabToken },
    })
    collabProviderRef.current = provider

    // Force editor re-creation with new ydoc
    setCollabKey((k) => k + 1)
  }, [currentArticleId])

  // Also trigger when collab toggles
  useEffect(() => {
    if (collabEnabled) {
      setCollabKey((k) => k + 1)
    }
  }, [collabEnabled])

  // Read toolbar visibility from settings
  const appearance = useSettingsStore((s) => s.settings['appearance'])
  let showToolbar = true
  try {
    if (appearance) {
      const parsed = JSON.parse(appearance)
      if (typeof parsed.showToolbar === 'boolean') showToolbar = parsed.showToolbar
    }
  } catch { /* use default */ }

  // Read image storage preference
  const editorPrefs = useSettingsStore((s) => s.settings['editor_prefs'])
  let imageStorage: 'base64' | 'file' = 'base64'
  try {
    if (editorPrefs) {
      const parsed = JSON.parse(editorPrefs)
      if (parsed.imageStorage === 'base64' || parsed.imageStorage === 'file') {
        imageStorage = parsed.imageStorage
      }
    }
  } catch { /* use default */ }

  let typewriterMode = false
  try {
    if (editorPrefs) {
      const parsed = JSON.parse(editorPrefs)
      typewriterMode = parsed.typewriterMode === 'on'
    }
  } catch { /* use default */ }

  const [justSaved, setJustSaved] = useState(false)
  const [saveMessage, setSaveMessage] = useState('✓ 已保存')
  const [showExport, setShowExport] = useState(false)

  const handleExport = useCallback(async (format: 'pdf' | 'docx') => {
    setShowExport(false)
    const article = useKnowledgeStore.getState().currentArticle
    const fileName = article?.title || 'document'
    const ext = format === 'pdf' ? 'pdf' : 'docx'

    const outputPath = await save({
      defaultPath: `${fileName}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    })
    if (!outputPath) return

    const markdown = htmlToMarkdown(editorRef.current?.getHTML() || content)
    try {
      await invoke('export_article', { markdown, outputPath, format })
      setSaveMessage('✓ 导出成功')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (e: any) {
      alert(`导出失败: ${e}`)
    }
  }, [content])

  // Helper: insert image based on storage mode
  const insertImage = useCallback(async (dataUrl: string, sourcePath?: string) => {
    const ed = editorRef.current
    if (!ed) return
    const projectId = useProjectStore.getState().currentProject?.id

    if (imageStorage === 'file' && projectId) {
      try {
        if (sourcePath) {
          const saved = await invoke<{ file_name: string }>('save_project_image', { projectId, sourcePath })
          ed.chain().focus().setImage({ src: `zell-img:${projectId}/${saved.file_name}` }).run()
        } else {
          const resp = await fetch(dataUrl)
          const blob = await resp.blob()
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
          const ext = blob.type.split('/')[1] || 'png'
          const saved = await invoke<{ file_name: string }>('save_project_image_bytes', { projectId, bytes, extension: ext })
          ed.chain().focus().setImage({ src: `zell-img:${projectId}/${saved.file_name}` }).run()
        }
        return
      } catch { /* fall through to base64 */ }
    }
    ed.chain().focus().setImage({ src: dataUrl }).run()
  }, [imageStorage])

  const insertImageRef = useRef(insertImage)
  insertImageRef.current = insertImage

  const [internalMode, setInternalMode] = useState<EditorMode>('wysiwyg')
  const mode = externalMode ?? internalMode

  const initialHtml = useMemo(() => {
    const html = markdownToHtml(content || '')
    return html.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/gi, (_, open, body, close) => {
      return open + body.replace(/\n+$/, '') + close
    })
  }, [])

  const handleModeToggle = useCallback(() => {
    const next = mode === 'wysiwyg' ? 'split' : 'wysiwyg'
    if (mode === 'split' && next === 'wysiwyg' && splitSourceRef.current) {
      const md = splitSourceRef.current
      const html = markdownToHtml(md)
      // Save to DB and update editor content directly
      const article = useKnowledgeStore.getState().currentArticle
      if (article) {
        invoke('update_knowledge_article', {
          id: article.id,
          title: article.title,
          content: md,
          contentJson: '{}',
        }).then((updated: { content: string }) => {
          useKnowledgeStore.getState().updateArticle(article.id, article.title, updated.content)
        }).catch(e => console.error('save failed:', e))
      }
      // When wysiwyg editor appears, set its content from split source
      const cleanHtml = html.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/gi, (_, open, body, close) => {
        return open + body.replace(/\n+$/, '') + close
      })
      ignoreNextSync.current = true
      prevContentRef.current = md
      setTimeout(() => {
        if (editorRef.current && !editorRef.current.isDestroyed) {
          editorRef.current.commands.setContent(cleanHtml)
        }
      }, 0)
      onChangeRef.current?.(html, md)
    }
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
      ...(collabYDocRef.current
        ? [Collaboration.configure({ document: collabYDocRef.current, field: 'content' })]
        : []),
      Image.configure({ allowBase64: true, inline: false }),
      Table.configure({ resizable: true }),
      TableRow, TableCell, TableHeader,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: 'text-zell-600 underline cursor-pointer' },
      }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
      CodeBlockLowlight.configure({ lowlight }),
      MathInlineNode,
      MathDisplayNode,
      MathExtension,
      // ProseMirror plugin: auto-trim trailing newlines from code blocks
      new Plugin({
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
      }),
      // ProseMirror plugin: convert [text](url) to markdown link
      new Plugin({
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
            tr.insertText(match[1], matchStart, [linkMark])
            view.dispatch(tr)
            return true
          },
        },
      }),
    ],
    content: collabYDocRef.current ? undefined : initialHtml,
    editable: editable,
    autofocus: autofocus ? 'end' : false,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'prose zell-prose focus:outline-none min-h-[300px]',
      },
      handleKeyDown: (_view, event) => {
        // Smart bracket skip: when typing closing bracket and next char matches, just move cursor
        const closeBrackets: Record<string, string> = { '}': '{', ']': '[', ')': '(' }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key in closeBrackets) {
          const ed = editorRef.current
          if (ed) {
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
        // Bracket auto-pairing: {} () []
        const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key in pairs) {
          const ed = editorRef.current
          if (ed) {
            const { from, to, empty } = ed.state.selection
            event.preventDefault()
            const open = event.key
            const close = pairs[open]
            if (!empty) {
              // Wrap selection
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
        // Quote auto-pairing: " '
        if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key === '"' || event.key === "'")) {
          const ed = editorRef.current
          if (ed) {
            const { from, to, empty } = ed.state.selection
            // If next character is same quote, just skip over it
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
        // Auto-indent in code blocks (Enter key)
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
          const ed = editorRef.current
          if (!ed) return false
          const { $from } = ed.state.selection
          // Check if inside a code block
          const codeBlock = $from.node($from.depth)
          if (codeBlock && codeBlock.type.name === 'codeBlock') {
            event.preventDefault()
            const fullText = $from.parent.textContent || ''
            const textBefore = fullText.slice(0, $from.parentOffset)
            const textAfter = fullText.slice($from.parentOffset)
            const lastNewline = textBefore.lastIndexOf('\n')
            const currentLine = textBefore.slice(lastNewline + 1)
            const indent = currentLine.match(/^(\s*)/)?.[1] || ''

            // Expand {} block: typing Enter after { with } right after
            const afterTrimmed = textAfter.trimStart()
            if (afterTrimmed.startsWith('}')) {
              const spaces = '    '
              const tr = ed.state.tr
              // Replace cursor-to-} range with expanded block
              const closePos = $from.pos + textAfter.indexOf('}')
              tr.replaceWith($from.pos, closePos + 1,
                ed.state.schema.text('\n' + indent + spaces + '\n' + indent + '}'))
              tr.setSelection(TextSelection.create(tr.doc, $from.pos + 1 + indent.length + spaces.length))
              ed.view.dispatch(tr)
              return true
            }

            // Normal auto-indent
            const trimmed = currentLine.trimEnd()
            const extraIndent = (trimmed.endsWith(':') && !trimmed.startsWith('http')) ? '    ' : ''
            ed.chain().focus().insertContent('\n' + indent + extraIndent).run()
            return true
          }
          return false
        }
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
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'T' || event.key === 't')) {
          event.preventDefault()
          editorRef.current?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          return true
        }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && (event.key === 'a' || event.key === 'A')) {
          const ed = editorRef.current
          if (!ed) return false
          const { $from } = ed.state.selection
          // If in a table cell, select cell content only
          const cell = $from.node(-1)
          if (cell && (cell.type.name === 'tableCell' || cell.type.name === 'tableHeader')) {
            event.preventDefault()
            const cellStart = $from.start(-1)
            const cellEnd = $from.end(-1)
            ed.chain().focus().setTextSelection({ from: cellStart, to: cellEnd }).run()
            return true
          }
          // If in a code block, select code block content only
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
          // Otherwise let default Ctrl+A (select all) handle it
          return false
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
                insertImageRef.current(dataUrl)
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
              insertImageRef.current(dataUrl, (file as any).path)
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

  // Typewriter mode: keep cursor line centered
  useEffect(() => {
    if (!editor || mode !== 'wysiwyg' || !typewriterMode) return
    const scroll = () => {
      const { from } = editor.state.selection
      const coords = editor.view.coordsAtPos(from)
      if (!coords) return
      const scrollContainer = editor.view.dom.closest('.overflow-auto') as HTMLElement
      if (!scrollContainer) return
      const containerRect = scrollContainer.getBoundingClientRect()
      const targetScroll = scrollContainer.scrollTop + coords.top - containerRect.top - containerRect.height / 2
      scrollContainer.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
    editor.on('selectionUpdate', scroll)
    return () => { editor.off('selectionUpdate', scroll) }
  }, [editor, mode, typewriterMode])

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
      const html = markdownToHtml(content || '')
      // Strip trailing newlines from code blocks (TipTap adds \n on render)
      const cleaned = html.replace(/(<code[^>]*>)([\s\S]*?)(\n*)(<\/code>)/gi, (_, open, body, trail, close) => {
        return open + body.replace(/\n+$/, '') + close
      })
      // Pre-resolve zell-img refs before rendering to avoid broken image flash
      const refs = [...cleaned.matchAll(/zell-img:([^\s")<]+)/g)].map(m => m[1])
      if (refs.length === 0) {
        editor.commands.setContent(cleaned)
        return
      }
      const uniqueRefs = [...new Set(refs)]
      Promise.all(uniqueRefs.map(async (ref) => {
        const [projId, fileName] = ref.split('/')
        try {
          const dataUrl = await invoke<string>('resolve_project_image', { projectId: projId, fileName })
          return { ref, dataUrl }
        } catch { return { ref, dataUrl: '' } }
      })).then((results) => {
        let resolved = cleaned
        for (const { ref, dataUrl } of results) {
          if (dataUrl) {
            const imgRef = `zell-img:${ref}`
            // Replace zell-img src with resolved data URL, but keep zell ref as attribute
            const escapedRef = imgRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            resolved = resolved.replace(
              new RegExp(`src="${escapedRef}"`, 'g'),
              `src="${dataUrl}" data-zell-ref="${imgRef}" data-zell-resolved="${dataUrl}"`
            )
          }
        }
        if (!editor.isDestroyed) editor.commands.setContent(resolved)
      })
    }
  }, [content, editor, mode])

  // Resolve zell-img refs for display without corrupting the src attribute.
  // We store the resolved URL in a data- attribute so turndown preserves zell-img: refs.
  useEffect(() => {
    if (!editor || mode !== 'wysiwyg') return
    const resolve = () => {
      const imgs = editor.view.dom.querySelectorAll('img[src^="zell-img:"]')
      imgs.forEach(async (img) => {
        const src = img.getAttribute('src') || ''
        const match = src.match(/^zell-img:(.+?)\/([^/]+)$/)
        if (!match) return
        const [, projectId, fileName] = match
        const cached = img.getAttribute('data-zell-resolved')
        if (cached) {
          if (img.getAttribute('src')?.startsWith('zell-img:')) {
            img.setAttribute('src', cached)
          }
          return
        }
        try {
          const dataUrl = await invoke<string>('resolve_project_image', { projectId, fileName })
          img.setAttribute('data-zell-ref', src)
          img.setAttribute('data-zell-resolved', dataUrl)
          if (img.getAttribute('src')?.startsWith('zell-img:')) {
            img.setAttribute('src', dataUrl)
          }
        } catch { /* keep */ }
      })
    }
    editor.on('create', resolve)
    const onUpdate = () => {
      const imgs = editor.view.dom.querySelectorAll('img[src^="zell-img:"]:not([data-zell-resolved])')
      if (imgs.length > 0) resolve()
    }
    editor.on('update', onUpdate)
    // Use rAF to ensure DOM is ready after mode switch
    requestAnimationFrame(resolve)
    return () => {
      editor.off('create', resolve)
      editor.off('update', onUpdate)
    }
  }, [editor, mode])

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable && mode === 'wysiwyg')
    }
  }, [editor, editable, mode])

  // Tauri native drag-and-drop: insert images from OS file manager
  useEffect(() => {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
    const toBase64 = (bytes: Uint8Array): string => {
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      return btoa(binary)
    }
    // Track mouse position during drag for insertion point
    let mouseX = 0, mouseY = 0
    const onMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY }

    const promise = getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'enter') {
        window.addEventListener('mousemove', onMouseMove)
        const ed = editorRef.current
        if (ed && mode === 'wysiwyg') {
          ed.view.dom.classList.add('drag-over')
        }
      }
      if (event.payload.type === 'over') {
        const ed = editorRef.current
        if (!ed || mode !== 'wysiwyg') return
        const rect = ed.view.dom.getBoundingClientRect()
        const pos = ed.view.posAtCoords({
          left: mouseX - rect.left,
          top: mouseY - rect.top,
        })
        if (pos) {
          ed.chain().focus().setTextSelection(pos.pos).run()
        }
      }
      if (event.payload.type === 'leave' || event.payload.type === 'drop') {
        window.removeEventListener('mousemove', onMouseMove)
        editorRef.current?.view.dom.classList.remove('drag-over')
      }
      if (event.payload.type !== 'drop') return
      for (const filePath of event.payload.paths) {
        const ext = filePath.split('.').pop()?.toLowerCase() || ''
        if (!imageExts.includes(ext)) continue
        readFile(filePath).then((bytes) => {
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
          const base64 = toBase64(bytes)
          const dataUrl = `data:${mime};base64,${base64}`
          insertImage(dataUrl, filePath)
        }).catch(() => {})
      }
    })
    return () => { promise.then((fn) => fn()) }
  }, [insertImage, mode])

  const handleSave = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const html = ed.getHTML()
    const md = htmlToMarkdown(html)
    onSave?.(html, md)
    setSaveMessage('✓ 已保存')
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 2000)
  }, [onSave])

  // Keyboard: edit # markers at heading start
  useEffect(() => {
    if (!editor) return
    const keyHandler = (e: KeyboardEvent) => {
      if (!editor.isEditable) return
      if (!editor.isActive('heading')) return
      const { $from } = editor.state.selection
      if ($from.parentOffset !== 0) return

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
    dom.addEventListener('keydown', keyHandler, true)
    return () => {
      dom.removeEventListener('keydown', keyHandler, true)
    }
  }, [editor])

  // ------ Split mode ------
  const [splitSource, setSplitSource] = useState('')
  const splitSourceRef = useRef('')
  splitSourceRef.current = splitSource
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
  const [resolvedPreviewHtml, setResolvedPreviewHtml] = useState('')

  // Generate and resolve preview HTML for split mode
  useEffect(() => {
    if (mode !== 'split' || !splitSource) {
      setResolvedPreviewHtml('')
      return
    }
    const raw = markdownToPreviewHtml(splitSource)
    const refs = [...raw.matchAll(/zell-img:([^\s")<]+)/g)].map(m => m[0])
    if (refs.length === 0) {
      // Process code highlighting
      const div = document.createElement('div')
      div.innerHTML = raw
      div.querySelectorAll('pre code[class*="language-"]').forEach((code) => {
        const pre = code.parentElement!
        const match = code.className.match(/language-(\w+)/)
        if (match && hljs.getLanguage(match[1])) {
          try {
            code.innerHTML = hljs.highlight(code.textContent || '', { language: match[1] }).value
            code.classList.add('hljs')
          } catch { /* fallback */ }
        }
      })
      setResolvedPreviewHtml(div.innerHTML)
      return
    }
    const uniqueRefs = [...new Set(refs)]
    Promise.all(uniqueRefs.map(async (ref) => {
      const parts = ref.replace('zell-img:', '').split('/')
      const [, ...rest] = parts
      const fileName = rest.join('/')
      try {
        const dataUrl = await invoke<string>('resolve_project_image', { projectId: parts[0], fileName })
        return { ref, dataUrl }
      } catch { return { ref, dataUrl: '' } }
    })).then((results) => {
      let html = raw
      for (const { ref, dataUrl } of results) {
        if (dataUrl) html = html.replace(new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), dataUrl)
      }
      const div = document.createElement('div')
      div.innerHTML = html
      div.querySelectorAll('pre code[class*="language-"]').forEach((code) => {
        const pre = code.parentElement!
        const match = code.className.match(/language-(\w+)/)
        if (match && hljs.getLanguage(match[1])) {
          try {
            code.innerHTML = hljs.highlight(code.textContent || '', { language: match[1] }).value
            code.classList.add('hljs')
          } catch { /* fallback */ }
        }
      })
      setResolvedPreviewHtml(div.innerHTML)
    })
  }, [splitSource, mode])

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
    <div className={cn('flex flex-col h-full overflow-hidden bg-white relative', className)}>
      {editable && showToolbar && (
        <EditorToolbar editor={editor} editorMode={mode} onToggleMode={handleModeToggle} />
      )}

      {mode === 'wysiwyg' ? (
        <>
          <div className="flex-1 overflow-auto flex justify-center">
            <div className="w-full max-w-3xl px-8 py-4" key={collabKey}>
              <EditorContent editor={editor} />
            </div>
          </div>
          <FloatingImageMenu editor={editor} />
          <TableToolbar editor={editor} />
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
              splitDragging ? 'bg-zell-400' : 'hover:bg-zell-300'
            )}
          />

          <div className="flex-1 flex flex-col">
            <div className="px-3 py-1 text-xs text-gray-400 bg-gray-50 border-b border-gray-100 shrink-0">
              预览
            </div>
            <div className="flex-1 overflow-auto flex justify-center">
              <div
                ref={previewRef}
                className="w-full max-w-3xl px-8 py-4 prose zell-prose"
                dangerouslySetInnerHTML={{ __html: resolvedPreviewHtml }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex justify-between shrink-0">
        <span>
          {mode === 'wysiwyg'
            ? `${editor.storage.characterCount?.characters?.() ?? 0} 字符`
            : `${splitSource.length} 字符`}
          {codeBlockLang && (
            <span className="ml-3 text-zell-500 font-medium">{codeBlockLang}</span>
          )}
          {justSaved && (
            <span className="ml-3 text-green-500">{saveMessage}</span>
          )}
          {updatedAt && !justSaved && (
            <span className="ml-3">· 更新于 {format.relativeTime(updatedAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExport(!showExport)}
              className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-0.5"
              title="导出"
            >
              <Download size={13} />
            </button>
            {showExport && (
              <div className="absolute bottom-full right-0 mb-1 w-24 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  PDF
                </button>
                <button
                  onClick={() => handleExport('docx')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  DOCX
                </button>
              </div>
            )}
          </div>
          <span className="text-gray-300">|</span>
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

      {/* Floating AI button */}
      {!isAIOpen && (
        <button
          onClick={() => openPanel('knowledge')}
          className="absolute bottom-14 right-4 z-10 p-2 bg-zell-500 text-white rounded-full shadow-lg hover:bg-zell-600 transition-all hover:scale-110"
          title="AI 助手"
        >
          <Sparkles size={16} />
        </button>
      )}
    </div>
  )
}
