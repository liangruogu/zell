import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'
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
import { EditorToolbar } from './EditorToolbar'
import { FloatingImageMenu } from './FloatingImageMenu'
import { TableToolbar } from './TableToolbar'
import { cn } from '@/lib/utils'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'
import { extractImagePaths } from '@/lib/clipboard'
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
import { readText, readImage } from '@tauri-apps/plugin-clipboard-manager'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'

const lowlight = createLowlight(common)

interface MarkdownEditorProps {
    content?: string
    contentJson?: any
    editable?: boolean
    placeholder?: string
    onChange?: (html: string, markdown: string, json?: any) => void
    onSave?: (html: string, markdown: string, json?: any) => void
    className?: string
    autofocus?: boolean
    updatedAt?: string
}

export function MarkdownEditor({
    content = '',
    contentJson,
    editable = true,
    placeholder = '开始写作...',
    onChange,
    onSave,
    className,
    autofocus = false,
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
    const insertImage = useCallback(async (dataUrl: string, _sourcePath?: string) => {
        const ed = editorRef.current
        if (!ed) return
        ed.chain().focus().setImage({ src: dataUrl }).run()
    }, [])

    const insertImageRef = useRef(insertImage)
    insertImageRef.current = insertImage

    const initialHtml = useMemo(() => {
        if (contentJson) {
            try {
                const parsed = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson
                return parsed
            } catch { /* fall through */ }
        }
        const html = markdownToHtml(content || '')
        return html.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/gi, (_, open, body, close) => {
            return open + body.replace(/\n+$/, '') + close
        })
    }, [contentJson, content])

    // Prevent saves during content initialization (markdown→JSON race)
    const initLockRef = useRef(true)

    const ignoreNextSync = useRef(false)
    const editorRef = useRef<ReturnType<typeof useEditor>>(null)

    const handleUpdate = useCallback(
        ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
            if (!editor) return
            ignoreNextSync.current = true
            const html = editor.getHTML()
            const md = htmlToMarkdown(html)
            onChangeRef.current?.(html, md, editor.getJSON())
        },
        []
    )

    const editor = useEditor({
        extensions: [
            TaskList,
            TaskItem.configure({ nested: true }),
            StarterKit.configure({ codeBlock: false, link: false }),
            ...(collabYDocRef.current
                ? [Collaboration.configure({ document: collabYDocRef.current, field: 'content' })]
                : []),
            Image.configure({ allowBase64: true, inline: false }),
            Table.configure({ resizable: true }),
            TableRow, TableCell, TableHeader,
            TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell'] }),
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
                if (items) {
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
                }
                // Fallback: file managers paste file paths as text.
                // Read system clipboard via Rust (bypasses broken webview clipboard API).
                event.preventDefault()
                event.stopPropagation()
                const toBase64 = (bytes: Uint8Array): string => {
                    let binary = ''
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
                    return btoa(binary)
                }
                readText().then((text) => {
                    console.log(text)
                    const refs = extractImagePaths(text)
                    if (refs.length > 0) {
                        for (const ref of refs) {
                            readFile(ref.path).then((bytes) => {
                                const ext = ref.path.split('.').pop()?.toLowerCase() || 'png'
                                const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
                                const dataUrl = `data:${mime};base64,${toBase64(bytes)}`
                                insertImageRef.current(dataUrl, ref.path)
                            }).catch(() => { })
                        }
                    } else if (text) {
                        // Plain text paste: insert it ourselves since we prevented default
                        const { tr } = _view.state
                        tr.insertText(text, _view.state.selection.from, _view.state.selection.to)
                        _view.dispatch(tr)
                    }
                }).catch(() => { })
                return true
            },
            handleDrop: (_view, event, _moved, _supported) => {
                const files = event.dataTransfer?.files
                if (files && files.length > 0) {
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
                }
                // Fallback: Desktop file managers often send file:// URIs via
                // various MIME types. Scan ALL of them for image paths.
                const toBase64 = (bytes: Uint8Array): string => {
                    let binary = ''
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
                    return btoa(binary)
                }
                const types = event.dataTransfer?.types || []
                let allText = ''
                for (const mimeType of types) {
                    allText += (event.dataTransfer?.getData(mimeType) || '') + '\n'
                }
                const refs = extractImagePaths(allText)
                if (refs.length === 0) return false
                event.preventDefault()
                event.stopPropagation()
                const dropPos = _view.posAtCoords({ left: event.clientX, top: event.clientY })
                for (const ref of refs) {
                    readFile(ref.path).then((bytes) => {
                        const ext = ref.path.split('.').pop()?.toLowerCase() || 'png'
                        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
                        const dataUrl = `data:${mime};base64,${toBase64(bytes)}`
                        if (dropPos) {
                            const { tr } = _view.state
                            const img = _view.state.schema.nodes.image.create({ src: dataUrl })
                            tr.insert(dropPos.pos, img)
                            _view.dispatch(tr)
                        } else {
                            insertImageRef.current(dataUrl, ref.path)
                        }
                    }).catch(() => { })
                }
                return true
            },
        },
    })

    editorRef.current = editor

    // Prevent saves during content init (1s lock after mount)
    useEffect(() => {
        if (!editor) return
        initLockRef.current = true
        const timer = setTimeout(() => { initLockRef.current = false }, 1000)
        return () => clearTimeout(timer)
    }, [editor])

    const prevContentRef = useRef(content)

    useEffect(() => {
        if (editor) {
            editor.setEditable(editable)
        }
    }, [editor, editable])

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
                if (ed) {
                    ed.view.dom.classList.add('drag-over')
                }
            }
            if (event.payload.type === 'over') {
                const ed = editorRef.current
                if (!ed) return
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
                }).catch(() => { })
            }
        })
        return () => { promise.then((fn) => fn()) }
    }, [insertImage])

    const handleSave = useCallback(() => {
        const ed = editorRef.current
        if (!ed) return
        const html = ed.getHTML()
        const md = htmlToMarkdown(html)
        onSave?.(html, md, editor.getJSON())
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

    // Current code block language for status bar (Typora style)
    const codeBlockLang = useMemo(() => {
        if (!editor) return null
        if (editor.isActive('codeBlock')) {
            const attrs = editor.getAttributes('codeBlock')
            return attrs.language || null
        }
        return null
    }, [editor, editor?.state.selection])

    if (!editor) {
        return <div className="p-6 text-gray-400">加载编辑器中...</div>
    }

    return (
        <div className={cn('flex flex-col h-full overflow-hidden bg-white relative', className)}>
            {editable && showToolbar && (
                <EditorToolbar editor={editor} />
            )}

            <>
                <div className="flex-1 overflow-auto flex justify-center">
                    <div className="w-full max-w-3xl px-8 py-4" key={collabKey}>
                        <EditorContent editor={editor} />
                    </div>
                </div>
                <FloatingImageMenu editor={editor} />
                <TableToolbar editor={editor} />
            </>

            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex justify-between shrink-0">
                <span>
                    {editor.storage.characterCount?.characters?.() ?? 0} 字符
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
