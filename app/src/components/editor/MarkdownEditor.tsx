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
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { common, createLowlight } from 'lowlight'
import { EditorToolbar } from './EditorToolbar'
import { FloatingImageMenu } from './FloatingImageMenu'
import { TableToolbar } from './TableToolbar'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
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
import katex from 'katex'
import baseCss from '@/styles/export/base.css?raw'
import zellThemeCss from '@/styles/export/theme-zell.css?raw'
import githubThemeCss from '@/styles/export/theme-github.css?raw'
import reportThemeCss from '@/styles/export/theme-report.css?raw'
import katexCss from 'katex/dist/katex.min.css?raw'
import { useEditorPlugins } from './useEditorPlugins'
import { useEditorHandlers } from './useEditorHandlers'
import { useEditorDragDrop } from './useEditorDragDrop'
import { useTypewriter } from './useTypewriter'
import { createCursorExtension } from '@/lib/cursorExtension'

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
    collabReady?: boolean
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
    collabReady = true,
}: MarkdownEditorProps) {
    const isAIOpen = useAIStore((s) => s.isOpen)
    const openPanel = useAIStore((s) => s.openPanel)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange

    const loadSettings = useSettingsStore((s) => s.loadSettings)
    useEffect(() => { loadSettings() }, [loadSettings])

    // ---- Theme ----
    const appearanceSettings = useProjectStore((s) => {
        if (!s.currentProject) return undefined
        const ps = parseProjectSettings(s.currentProject.settings)
        if (!ps.appearance) return undefined
        return JSON.stringify(ps.appearance)
    })
    // ---- Appearance ----
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
            } catch (e) {
                logger.error('MarkdownEditor: failed to load theme', e)
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
    const collabEnabled = !!collabServerUrl && !!collabToken && collabReady
    const currentArticleId = useKnowledgeStore((s) => s.currentArticle?.id)
    const collabYDocRef = useRef<Y.Doc>(new Y.Doc())
    const collabProviderRef = useRef<WebsocketProvider | null>(null)
    const contentLoadedKey = currentArticleId ? `${currentArticleId}:loaded` : ''

    useEffect(() => {
        if (!collabEnabled) {
            if (collabProviderRef.current) {
                collabProviderRef.current.disconnect()
                collabProviderRef.current = null
            }
            // In local mode, set content from props into Y.Doc
            if (editorRef.current && initialHtml) {
                const config = collabYDocRef.current.getMap('config')
                if (!config.get(contentLoadedKey)) {
                    editorRef.current.commands.setContent(initialHtml)
                    // Don't mark as loaded in local mode — it's not synced
                }
            }
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
        const wsBase = collabServerUrl.replace(/^http/, 'ws')
        const provider = new WebsocketProvider(`${wsBase}/ws`, `${projectId}/${article.id}`, collabYDocRef.current, {
            params: { token: collabToken },
        })
        collabProviderRef.current = provider
        const settings = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
        const displayName = settings.displayName || (settings.serverKey ? 'Owner' : 'Anonymous')
        const userColors = ['#8B7EC8', '#D98B7A', '#D4A76A', '#C2C06A', '#7AB8D4', '#7AC8A8', '#8EC87A', '#A0C8C0', '#C8B868', '#8AA8C8', '#C88AAA', '#7AC0B8', '#B89ACA', '#9AA0B0']
        const colorHash = displayName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
        const userColor = userColors[colorHash % userColors.length]
        provider.awareness.setLocalStateField('user', { name: displayName, color: userColor })

        // Follow TipTap docs: set initial content only once, tracked via Y.Doc map
        provider.on('sync', (synced: boolean) => {
            if (!synced) return
            const config = collabYDocRef.current.getMap('config')
            if (!config.get(contentLoadedKey) && editorRef.current) {
                if (initialHtml) {
                    editorRef.current.commands.setContent(initialHtml)
                }
                config.set(contentLoadedKey, true)
            }
        })

        return () => {
            provider.awareness.setLocalStateField('cursor', null)
            try {
                const ws = (provider as any).ws as WebSocket | undefined
                if (ws && ws.readyState === WebSocket.OPEN) {
                    provider.disconnect()
                }
            } catch (e) { logger.error('MarkdownEditor: failed to disconnect collaboration provider', e) }
            collabProviderRef.current = null
        }
    }, [collabEnabled, collabServerUrl, collabToken, currentArticleId])
    const showToolbar = useSettingsStore((s) => s.settings['show_toolbar'] !== 'false')
    const typewriterEnabled = useSettingsStore((s) => s.settings['editor_typewriter'] === 'true')

    const [justSaved, setJustSaved] = useState(false)
    const [saveMessage, setSaveMessage] = useState('✓ 已保存')
    const [showExport, setShowExport] = useState(false)
    const [exporting, setExporting] = useState(false)

    const editorRef = useRef<ReturnType<typeof useEditor>>(null)
    const insertImageRef = useRef<(dataUrl: string, sourcePath?: string) => void>(() => { })

    // Pre-render math, checkboxes for export
    function prepareExportHtml(html: string): string {
        return html
            .replace(/<input type="checkbox"(\s+checked)?(\s[^>]*)?>/g, (_, checked) => {
                return `<span class="zell-checkbox${checked ? ' zell-checkbox-checked' : ''}"></span>`
            })
            .replace(/<math-inline[^>]*>(.*?)<\/math-inline>/gs, (_, tex) => {
                try { return katex.renderToString(tex, { throwOnError: false, displayMode: false, output: 'html' }) }
                catch { return `<em>${tex}</em>` }
            })
            .replace(/<math-display[^>]*>(.*?)<\/math-display>/gs, (_, tex) => {
                try { return katex.renderToString(tex, { throwOnError: false, displayMode: true, output: 'html' }) }
                catch { return `<p style="text-align:center"><em>${tex}</em></p>` }
            })
    }

    // ---- Export ----
    const handleExport = useCallback(async (format: 'pdf' | 'docx' | 'html') => {
        setShowExport(false)
        setExporting(true)
        const article = useKnowledgeStore.getState().currentArticle
        const fileName = article?.title || 'document'

        const projectSettings = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
        const theme = (projectSettings as any).appearance?.theme || 'zell'
        const themeCss: Record<string, string> = { zell: zellThemeCss, github: githubThemeCss, report: reportThemeCss }
        const fullCss = katexCss + '\n' + baseCss + '\n' + (themeCss[theme] || zellThemeCss)
        const htmlContent = prepareExportHtml(editorRef.current?.getHTML() || content)
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${fileName}</title><style>${fullCss}</style></head><body>${htmlContent}</body></html>`

        if (format === 'html') {
            const outputPath = await save({
                defaultPath: `${fileName}.html`,
                filters: [{ name: 'HTML', extensions: ['html'] }],
            })
            if (!outputPath) { setExporting(false); return }
            try {
                const { writeTextFile } = await import('@tauri-apps/plugin-fs')
                await writeTextFile(outputPath, fullHtml)
                setSaveMessage('✓ HTML 导出成功')
            } catch (e: any) {
                alert(`导出失败: ${e}`)
            }
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 3000)
            setExporting(false)
            return
        }

        if (format === 'pdf') {
            const outputPath = await save({
                defaultPath: `${fileName}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }],
            })
            if (!outputPath) { setExporting(false); return }
            try {
                await invoke('export_html_to_pdf', { html: fullHtml, outputPath })
                setSaveMessage('✓ PDF 导出成功')
            } catch (e: any) {
                alert(`导出失败: ${e}`)
            }
            setJustSaved(true)
            setTimeout(() => setJustSaved(false), 3000)
            setExporting(false)
            return
        }

        // DOCX
        const docxPath = await save({
            defaultPath: `${fileName}.docx`,
            filters: [{ name: 'DOCX', extensions: ['docx'] }],
        })
        if (!docxPath) { setExporting(false); return }
        try {
            await invoke('export_html_to_docx', { html: fullHtml, outputPath: docxPath })
            setSaveMessage('✓ DOCX 导出成功')
        } catch (e: any) {
            alert(`导出失败: ${e}`)
        }
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 3000)
        setExporting(false)
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
    const { trimCodeBlockExt, markdownLinkExt, keyboardExt } = useEditorPlugins({ editorRef, handleSave })
    const { handlePaste, handleDrop } = useEditorHandlers({ editorRef, insertImageRef })
    useEditorDragDrop({ editorRef, insertImage })

    // ---- Editor init ----
    const initialHtml = useMemo(() => {
        if (contentJson) {
            try {
                const parsed = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson
                console.log('[EDITOR] initialHtml from json', { hasText: JSON.stringify(parsed).includes('"text"'), len: JSON.stringify(parsed).length })
                return parsed
            } catch (e) { logger.error('MarkdownEditor: failed to parse content json', e); /* fall through */ }
        }
        const html = markdownToHtml(content || '')
        console.log('[EDITOR] initialHtml from markdown', { contentLen: (content || '').length, htmlLen: html.length })
        return html.replace(/(<code[^>]*>)([\s\S]*?)(<\/code>)/gi, (_, open, body, close) => {
            return open + body.replace(/\n+$/, '') + close
        })
    }, [contentJson, content])

    const ignoreNextSync = useRef(false)

    const handleUpdate = useCallback(
        ({ editor }: { editor: ReturnType<typeof useEditor> }) => {
            if (!editor) return
            ignoreNextSync.current = true
            const html = editor.getHTML()
            const md = htmlToMarkdown(html)
            console.log('[EDITOR] onUpdate', { textLen: editor.getText().length, text: editor.getText().slice(0, 40) })
            onChangeRef.current?.(html, md, editor.getJSON())
        },
        []
    )

    const editor = useEditor({
        extensions: [
            TaskList,
            TaskItem.configure({ nested: true }),
            StarterKit.configure({ history: false, codeBlock: false, link: false }),
            Collaboration.configure({ document: collabYDocRef.current, field: 'content' }),
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
            createCursorExtension(
                () => collabProviderRef.current?.awareness,
                () => collabProviderRef.current?.awareness?.clientID ?? 0
            ),
            trimCodeBlockExt,
            markdownLinkExt,
            keyboardExt,
        ],
        content: collabYDocRef.current ? undefined : initialHtml,
        editable: editable,
        autofocus: autofocus ? 'end' : false,
        onUpdate: handleUpdate,
        onCreate: ({ editor }) => {
            // Local init is handled by tryLocalInit after 'sync' event confirms peer count
        },
        editorProps: {
            attributes: { class: 'prose zell-prose focus:outline-none min-h-[300px]' },
            handlePaste,
            handleDrop,
        },
    }, [])

    editorRef.current = editor

    useTypewriter({ editor, enabled: typewriterEnabled, scrollRef })

    // ---- Effects ----
    useEffect(() => {
        if (editor) editor.setEditable(editable)
    }, [editor, editable])

    // Keyboard: edit # markers at heading start
    useEffect(() => {
        if (!editor) return
        let dom: HTMLElement
        try { dom = editor.view.dom } catch (e) { logger.error('MarkdownEditor: failed to access editor dom', e); return }
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
                        <button type="button" onClick={() => setShowExport(!showExport)} disabled={exporting}
                            className="hover:text-gray-600 transition-colors cursor-pointer flex items-center gap-0.5 disabled:opacity-50" title="导出">
                            <Download size={13} />
                            {exporting && <span className="text-xs ml-0.5">导出中...</span>}
                        </button>
                        {showExport && (
                            <div className="absolute bottom-full right-0 mb-1 w-24 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                                <button onClick={() => handleExport('pdf')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">PDF</button>
                                <button onClick={() => handleExport('docx')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">DOCX</button>
                                <button onClick={() => handleExport('html')} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">HTML</button>
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

            {/* Export loading overlay */}
            {exporting && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl px-8 py-6 text-center space-y-3">
                        <div className="w-8 h-8 border-2 border-zell-500 border-t-transparent rounded-full mx-auto" style={{ animation: 'spin 0.8s linear infinite' }} />
                        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                        <p className="text-sm text-gray-600">正在导出...</p>
                    </div>
                </div>
            )}
        </div>
    )
}
