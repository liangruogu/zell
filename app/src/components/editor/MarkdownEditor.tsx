import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
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
import { CollaborationCursor } from '@tiptap/extension-collaboration-cursor'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { common, createLowlight } from 'lowlight'
import { EditorToolbar } from './EditorToolbar'
import { FloatingImageMenu } from './FloatingImageMenu'
import { TableToolbar } from './TableToolbar'
import { cn } from '@/lib/utils'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'
import { MathExtension } from '@/lib/mathExtension'
import { MathInlineNode, MathDisplayNode } from '@/lib/mathNodes'
import { useAIStore } from '@/stores/aiStore'
import { Sparkles, Download } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useSyncStore } from '@/stores/syncStore'
import { format } from '@/lib/format'
import { parseProjectSettings } from '@/types/project'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { useEditorPlugins } from './useEditorPlugins'
import { useEditorHandlers } from './useEditorHandlers'
import { useEditorDragDrop } from './useEditorDragDrop'
import { useTypewriter } from './useTypewriter'

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

    const loadSettings = useSettingsStore((s) => s.loadSettings)
    useEffect(() => { loadSettings() }, [loadSettings])

    // ---- Theme ----
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
                    if (theme) document.documentElement.setAttribute('data-zell-theme', theme)
                    else document.documentElement.removeAttribute('data-zell-theme')
                    return
                }
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

    // ---- Collaboration ----
    const currentProject = useProjectStore((s) => s.currentProject)
    const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
    const collabServerUrl = ps.serverUrl || ''
    const collabToken = ps.token || ''
    const collabEnabled = !!collabServerUrl && !!collabToken
    const currentArticleId = useKnowledgeStore((s) => s.currentArticle?.id)
    const collabYDocRef = useRef<Y.Doc | null>(null)
    const collabProviderRef = useRef<WebsocketProvider | null>(null)
    const [collabKey, setCollabKey] = useState(0)

    useEffect(() => {
        if (!collabEnabled) {
            collabYDocRef.current = null
            return
        }
        const article = useKnowledgeStore.getState().currentArticle
        if (!article) return
        const projectId = useProjectStore.getState().currentProject?.id
        if (!projectId) return
        if (collabProviderRef.current) {
            collabProviderRef.current.disconnect()
            collabProviderRef.current = null
        }
        const ydoc = new Y.Doc()
        collabYDocRef.current = ydoc
        const wsBase = collabServerUrl.replace(/^http/, 'ws')
        const provider = new WebsocketProvider(`${wsBase}/ws`, `${projectId}/${article.id}`, ydoc, {
            params: { token: collabToken },
        })
        collabProviderRef.current = provider
        requestAnimationFrame(() => setCollabKey(k => k + 1))
        return () => {
            provider.disconnect()
            collabYDocRef.current = null
            collabProviderRef.current = null
        }
    }, [collabEnabled, collabServerUrl, collabToken, currentArticleId])

    // ---- Settings ----
    const showToolbar = useSettingsStore((s) => s.settings['show_toolbar'] !== 'false')
    const typewriterEnabled = useSettingsStore((s) => s.settings['editor_typewriter'] === 'true')

    const [justSaved, setJustSaved] = useState(false)
    const [saveMessage, setSaveMessage] = useState('✓ 已保存')
    const [showExport, setShowExport] = useState(false)

    const editorRef = useRef<ReturnType<typeof useEditor>>(null)
    const insertImageRef = useRef<(dataUrl: string, sourcePath?: string) => void>(() => { })

    // ---- Export ----
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

    const insertImage = useCallback(async (dataUrl: string, _sourcePath?: string) => {
        const ed = editorRef.current
        if (!ed) return
        ed.chain().focus().setImage({ src: dataUrl }).run()
    }, [])
    insertImageRef.current = insertImage

    // ---- Save ----
    const handleSave = useCallback(() => {
        const ed = editorRef.current
        if (!ed) return
        const html = ed.getHTML()
        const md = htmlToMarkdown(html)
        onSave?.(html, md, ed.getJSON())
        setSaveMessage('✓ 已保存')
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
    }, [onSave])

    // ---- Extracted hooks ----
    const scrollRef = useRef<HTMLDivElement>(null)
    const { trimCodeBlockPlugin, markdownLinkPlugin, keyboardPlugin } = useEditorPlugins({ editorRef, handleSave })
    const { handlePaste, handleDrop } = useEditorHandlers({ editorRef, insertImageRef })
    useEditorDragDrop({ editorRef, insertImage })

    // ---- Editor init ----
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

    const initLockRef = useRef(true)
    const ignoreNextSync = useRef(false)

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
            ...(collabYDocRef.current ? [Collaboration.configure({ document: collabYDocRef.current, field: 'content' })] : []),
            ...(collabYDocRef.current ? [CollaborationCursor.configure({
                provider: collabProviderRef.current as any,
                user: {
                    name: parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}').displayName || 'Anonymous',
                    color: '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0'),
                },
            })] : []),
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
            trimCodeBlockPlugin,
            markdownLinkPlugin,
            keyboardPlugin,
        ],
        content: collabYDocRef.current ? undefined : initialHtml,
        editable: editable,
        autofocus: autofocus ? 'end' : false,
        onUpdate: handleUpdate,
        editorProps: {
            attributes: { class: 'prose zell-prose focus:outline-none min-h-[300px]' },
            handleKeyDown: keyboardPlugin.props.handleKeyDown,
            handlePaste,
            handleDrop,
        },
    }, [collabKey])

    editorRef.current = editor

    useTypewriter({ editor, enabled: typewriterEnabled, scrollRef })

    // ---- Effects ----
    useEffect(() => {
        if (!editor) return
        initLockRef.current = true
        const timer = setTimeout(() => { initLockRef.current = false }, 1000)
        return () => clearTimeout(timer)
    }, [editor])

    useEffect(() => {
        if (editor) editor.setEditable(editable)
    }, [editor, editable])

    // Keyboard: edit # markers at heading start
    useEffect(() => {
        if (!editor) return
        let dom: HTMLElement
        try { dom = editor.view.dom } catch { return }
        const keyHandler = (e: KeyboardEvent) => {
            if (!editor.isEditable) return
            if (!editor.isActive('heading')) return
            const { $from } = editor.state.selection
            if ($from.parentOffset !== 0) return
            if (e.key === '#') {
                e.preventDefault()
                const attrs = editor.getAttributes('heading')
                const current = (attrs.level as number) || 1
                if (current < 3) editor.chain().focus().toggleHeading({ level: (current + 1) as 1 | 2 | 3 }).run()
            } else if (e.key === 'Backspace') {
                e.preventDefault()
                const attrs = editor.getAttributes('heading')
                const current = (attrs.level as number) || 1
                if (current > 1) editor.chain().focus().toggleHeading({ level: (current - 1) as 1 | 2 | 3 }).run()
                else editor.chain().focus().setParagraph().run()
            }
        }
        dom.addEventListener('keydown', keyHandler, true)
        return () => { dom.removeEventListener('keydown', keyHandler, true) }
    }, [editor])

    if (!editor) return <div className="p-6 text-gray-400">加载编辑器中...</div>

    return (
        <div className={cn('flex flex-col h-full overflow-hidden bg-white relative', className)}>
            {editable && showToolbar && <EditorToolbar editor={editor} />}

            <div ref={scrollRef} className="flex-1 overflow-auto flex flex-col items-center">
                {typewriterEnabled && <div className="shrink-0" style={{ width: '100%', maxWidth: '48rem', height: '50vh' }} />}
                <div className="w-full max-w-3xl px-8 py-4">
                    <EditorContent editor={editor} />
                </div>
                {typewriterEnabled && <div className="shrink-0" style={{ width: '100%', maxWidth: '48rem', height: '50vh' }} />}
            </div>
            <FloatingImageMenu editor={editor} />
            <TableToolbar editor={editor} />

            <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex justify-between shrink-0">
                <span>
                    {editor.storage.characterCount?.characters?.() ?? 0} 字符
                    {justSaved && <span className="ml-3 text-green-500">{saveMessage}</span>}
                    {updatedAt && !justSaved && <span className="ml-3">· 更新于 {format.relativeTime(updatedAt)}</span>}
                </span>
                <span className="flex items-center gap-1">
                    <div className="relative">
                        <button type="button" onClick={() => setShowExport(!showExport)}
                            className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-0.5" title="导出">
                            <Download size={13} />
                        </button>
                        {showExport && (
                            <div className="absolute bottom-full right-0 mb-1 w-24 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                                <button onClick={() => handleExport('pdf')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">PDF</button>
                                <button onClick={() => handleExport('docx')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">DOCX</button>
                            </div>
                        )}
                    </div>
                </span>
            </div>

            {!isAIOpen && (
                <button onClick={() => openPanel('knowledge')}
                    className="absolute bottom-14 right-4 z-10 p-2 bg-zell-500 text-white rounded-full shadow-lg hover:bg-zell-600 transition-all hover:scale-110" title="AI 助手">
                    <Sparkles size={16} />
                </button>
            )}
        </div>
    )
}
