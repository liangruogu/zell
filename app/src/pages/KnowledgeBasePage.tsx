import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { parseProjectSettings, applyProjectConfig } from '@/types/project'
import { ResizablePanel, useResizablePanel } from '@/components/layout/ResizablePanel'
import type { KnowledgeArticle } from '@/types/knowledge'
import { Plus, FileText, Trash2, Search, X, ListTree, ChevronRight, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

type ListTab = 'files' | 'outline'

interface HeadingNode {
    level: number
    text: string
    line: number
    children: HeadingNode[]
}

function buildHeadingTree(headings: { level: number; text: string; line: number }[]): HeadingNode[] {
    const roots: HeadingNode[] = []
    const stack: HeadingNode[] = []
    for (const h of headings) {
        const node: HeadingNode = { ...h, children: [] }
        while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
            stack.pop()
        }
        if (stack.length === 0) {
            roots.push(node)
        } else {
            stack[stack.length - 1].children.push(node)
        }
        stack.push(node)
    }
    return roots
}

export default function KnowledgeBasePage() {
    const { id: projectId } = useParams<{ id: string }>()
    const { fetchProject } = useProjectStore()
    const deleteProject = useProjectStore(s => s.deleteProject)
    const {
        articles, currentArticle, loading,
        fetchArticles, createArticle, updateArticle, deleteArticle, setCurrentArticle,
    } = useKnowledgeStore()
    const panel = useResizablePanel(224, 120, 400, 80, 'zell_panel_knowledge')

    const [showCreate, setShowCreate] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [showSearch, setShowSearch] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null)
    const [listTab, setListTab] = useState<ListTab>('files')
    const listTabRef = useRef<ListTab>('files')
    const setListTabSafe = (tab: ListTab) => { setListTab(tab); listTabRef.current = tab }
    const [isDragOver, setIsDragOver] = useState(false)
    const dragCounter = useRef(0)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [editorMd, setEditorMd] = useState('')
    const psCollab = parseProjectSettings(useProjectStore(s => s.currentProject?.settings) || '{}')
    const isCollab = !!psCollab.collabEnabled
    const [serverOnline, setServerOnline] = useState(true)
    const syncDoneRef = useRef(false)
    const [collabReady, setCollabReady] = useState(!isCollab)

    useEffect(() => {
        if (projectId) {
            fetchProject(projectId)
            fetchArticles(projectId)
        }
    }, [projectId, fetchProject, fetchArticles])

    // Keyboard shortcuts
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            // Ctrl+Shift+L: toggle left panel
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
                e.preventDefault()
                panel.toggle()
                return
            }
            // Ctrl+Shift+F: search articles
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault()
                setListTabSafe('files')
                setShowSearch(true)
                setTimeout(() => searchInputRef.current?.focus(), 50)
                return
            }
            // Ctrl+F when NOT in editor: search articles
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'f') {
                const active = document.activeElement
                const isInEditor = active?.closest('.ProseMirror') || active?.closest('[contenteditable]')
                if (!isInEditor) {
                    e.preventDefault()
                    setListTabSafe('files')
                    setShowSearch(true)
                    setTimeout(() => searchInputRef.current?.focus(), 50)
                }
                // If in editor, let browser native find work
            }
            if (e.key === 'Escape' && showSearch) {
                setShowSearch(false)
                setSearchQuery('')
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [showSearch])

    const syncToServer = useCallback((aid: string, title: string, content: string, contentJson: string, isNew = false) => {
        const ps = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
        const serverUrl = ps.serverUrl
        const serverKey = ps.serverKey
        const token = ps.token
        if (!serverUrl || !projectId) return
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        } else if (serverKey) {
            headers['X-Server-Key'] = serverKey
        } else {
            return
        }
        const url = `${serverUrl}/api/v1/projects/${projectId}/articles${isNew ? '' : '/' + aid}`
        fetch(url, {
            method: isNew ? 'POST' : 'PUT',
            headers,
            body: JSON.stringify({ id: aid, project_id: projectId, title, content, content_json: contentJson }),
        }).catch((e) => { logger.error('Failed to sync article to server', e) })
    }, [projectId])

    // Listen for server article change broadcasts via WebSocket + initial sync
    useEffect(() => {
        if (!projectId) return

        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let stopped = false
        let projectSubscribed = false

        function getSettings() {
            const cur = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
            return { serverUrl: cur.serverUrl, token: cur.token, serverKey: cur.serverKey }
        }

        let syncing = false

        const syncArticlesFromServer = async () => {
            if (syncing) return
            syncing = true
            const { serverUrl, token, serverKey } = getSettings()
            if (!serverUrl || (!token && !serverKey)) { syncing = false; return }
            try {
                const headers: Record<string, string> = {}
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`
                } else if (serverKey) {
                    headers['X-Server-Key'] = serverKey
                }
                const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/articles`, { headers })
                if (res.status === 410) {
                    alert('项目已被管理员删除，即将返回首页')
                    deleteProject(projectId!)
                    window.location.href = '/'
                    return
                }
                if (res.status === 403) {
                    try {
                        const body = await res.json()
                        if (body.code === 'COLLAB_DISABLED') {
                            alert('协作已被管理员关闭，即将返回首页')
                        } else if (body.code === 'MEMBER_REMOVED') {
                            alert('你已被移出项目，即将返回首页')
                        } else {
                            alert('访问被拒绝，即将返回首页')
                        }
                    } catch (e) { logger.error('Failed to parse 403 response', e); alert('访问被拒绝，即将返回首页') }
                    deleteProject(projectId!)
                    window.location.href = '/'
                    return
                }
                if (!res.ok) { setServerOnline(false); useSyncStore.getState().setReadOnly(true); return }
                setServerOnline(true)
                useSyncStore.getState().setReadOnly(false)
                const serverArticles: { id: string }[] = await res.json()
                console.log('[sync] server articles count=' + serverArticles.length
                    + ', local articles count=' + useKnowledgeStore.getState().articles.length
                    + ', sample content=' + (serverArticles[0] ? JSON.stringify((serverArticles[0] as any).content).slice(0, 50) : 'none'))
                const store = useKnowledgeStore.getState()
                const localArticles = store.articles

                for (const a of serverArticles) {
                    const srv = a as any
                    const existing = localArticles.find(la => la.id === srv.id)
                    if (existing) {
                        if (srv.content && srv.content !== existing.content) {
                            try { await store.updateArticle(srv.id, srv.title || existing.title, srv.content, srv.content_json) } catch (e) { logger.error('Failed to update synced article', e) }
                        }
                    } else {
                        try {
                            await store.createArticle(projectId, srv.title || '', srv.content || '', undefined, srv.id, srv.content_json)
                        } catch (e) {
                            // Article already exists locally (store.articles raced with Tauri DB load on startup)
                            console.log('[sync] create failed for ' + srv.id + ', updating instead. server content len=' + (srv.content || '').length)
                            await store.updateArticle(srv.id, srv.title || '', srv.content || '', srv.content_json || '{}')
                        }
                    }
                }

                const serverIds = new Set(serverArticles.map((a: any) => a.id))
                for (const la of localArticles) {
                    if (!serverIds.has(la.id)) {
                        try { await store.deleteArticle(la.id) } catch (e) { logger.error('Failed to delete synced article', e) }
                    }
                }

                fetchArticles(projectId)

                if (!syncDoneRef.current) {
                    syncDoneRef.current = true
                    setCollabReady(true)
                }

                const cur = useKnowledgeStore.getState().currentArticle
                if (cur && !serverArticles.some((a: any) => a.id === cur.id)) {
                    useKnowledgeStore.getState().setCurrentArticle(null)
                }
            } catch (e) { logger.error('Failed to sync articles from server', e); setServerOnline(false) }
            finally { syncing = false }
        }

        const syncProjectInfoFromServer = async () => {
            const { serverUrl, token, serverKey } = getSettings()
            if (!serverUrl || (!token && !serverKey)) return
            try {
                const headers: Record<string, string> = {}
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`
                } else if (serverKey) {
                    headers['X-Server-Key'] = serverKey
                }
                const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/info`, { headers })
                if (!res.ok) return
                const data = await res.json()
                if (!data?.name) return
                const proj = useProjectStore.getState().currentProject
                if (!proj) return
                let newSettings = proj.settings || '{}'
                if (data.config) {
                    try { newSettings = applyProjectConfig(newSettings, JSON.parse(data.config)) }
                    catch (e) { logger.error('Failed to parse project config', e) }
                }
                if (newSettings === proj.settings
                    && data.name === proj.name
                    && (data.description || '') === (proj.description || '')) {
                    return
                }
                useProjectStore.getState().updateProject(proj.id, {
                    name: data.name,
                    description: data.description || '',
                    background: proj.background || '',
                    settings: newSettings,
                })
            } catch (e) { logger.error('Failed to sync project info from server', e) }
        }

        function connect() {
            if (stopped) return
            const { serverUrl, token } = getSettings()
            if (!serverUrl) return
            const wsBase = serverUrl.replace(/^http/, 'ws')
            const wsUrl = `${wsBase}/ws/${projectId}/__notifications__${token ? '?token=' + encodeURIComponent(token) : ''}`
            ws = new WebSocket(wsUrl)
            ws.onopen = () => {
                console.log('[sync] WS connected')
                setServerOnline(true)
                syncArticlesFromServer()
                if (token && serverUrl && projectId) {
                    useSyncStore.getState().pullNotifications(projectId, token, serverUrl).then(() => {
                        const notifs = useSyncStore.getState().notifications
                        if (notifs) {
                            for (const n of notifs) {
                                if (n.type === 'removed' || n.type === 'collab_disabled' || n.type === 'project_deleted') {
                                    const msg = n.type === 'project_deleted' ? '项目已被管理员删除'
                                        : n.type === 'collab_disabled' ? '协作已被管理员关闭'
                                            : '你已被移出项目'
                                    alert(msg + '，即将返回首页')
                                    deleteProject(projectId!)
                                    window.location.href = '/'
                                    return
                                }
                            }
                        }
                    })
                }
            }
            ws.onerror = () => {}
            ws.onclose = (e) => {
                console.log('[sync] WS closed, code=' + e.code + ', stopped=' + stopped)
                setServerOnline(false)
                useSyncStore.getState().setReadOnly(true)
                if (!stopped) {
                    reconnectTimer = setTimeout(connect, 3000)
                }
            }
            ws.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type === 'project_deleted') {
                        alert('项目已被管理员删除，即将返回首页')
                        deleteProject(projectId!)
                        window.location.href = '/'
                        return
                    }
                    if (msg.type === 'collab_disabled') {
                        alert('协作已被管理员关闭，即将返回首页')
                        deleteProject(projectId!)
                        window.location.href = '/'
                        return
                    }
                    if (msg.type === 'member_removed' && msg.data?.client_id) {
                        alert('你已被管理员移出项目，即将返回首页')
                        deleteProject(projectId!)
                        window.location.href = '/'
                        return
                    }
                    if (msg.type && msg.type.startsWith('article_')) {
                        if (msg.type === 'article_updated' && msg.data?.id && msg.data.id === useKnowledgeStore.getState().currentArticle?.id) {
                            return
                        }
                        syncArticlesFromServer()
                    }
                    if (msg.type === 'project_updated') {
                        const proj = useProjectStore.getState().currentProject
                        if (proj && msg.data) {
                            let newSettings = proj.settings || '{}'
                            if (msg.data.config) {
                                try {
                                    const cfg = JSON.parse(msg.data.config)
                                    newSettings = applyProjectConfig(newSettings, cfg)
                                } catch (e) { logger.error('Failed to parse project_updated config', e) }
                            }
                            const updated = {
                                ...proj,
                                name: msg.data.name || proj.name,
                                description: msg.data.description || proj.description,
                                settings: newSettings,
                            }
                            useProjectStore.getState().setCurrentProject(updated)
                            useProjectStore.getState().updateProject(proj.id, {
                                name: updated.name,
                                description: updated.description || '',
                                background: updated.background || '',
                                settings: newSettings,
                            })
                        }
                    }
                } catch (e) { logger.error('Failed to parse WebSocket message', e) /* not JSON */ }
            }
        }

        function trySetup() {
            const { serverUrl } = getSettings()
            if (!serverUrl) return
            projectSubscribed = true
            syncProjectInfoFromServer()
            syncArticlesFromServer()
            connect()
        }

        // Try immediately (project may already be loaded from ProjectPage)
        trySetup()

        // If project not loaded yet, subscribe to store until it is
        let unsub: (() => void) | null = null
        if (!projectSubscribed) {
            unsub = useProjectStore.subscribe(() => {
                if (projectSubscribed || stopped) return
                trySetup()
                if (projectSubscribed && unsub) { unsub(); unsub = null }
            })
        }

        return () => {
            stopped = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            if (ws) ws.close()
            if (unsub) unsub()
        }
    }, [projectId])


    const handleCreate = useCallback(async () => {
        if (!projectId || !newTitle.trim()) return
        const mdContent = ""
        const article = await createArticle(projectId, newTitle.trim(), mdContent)
        setNewTitle('')
        setShowCreate(false)
        setCurrentArticle(article)
        syncToServer(article.id, article.title, mdContent, '{}', true)
    }, [projectId, newTitle, createArticle, setCurrentArticle, syncToServer])

    const handleEditorChange = useCallback(
        (_html: string, markdown: string, json?: any) => {
            setEditorMd(markdown)
            if (!currentArticle) return
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
            saveTimerRef.current = setTimeout(() => {
                const contentJson = json ? JSON.stringify(json) : currentArticle.content_json || '{}'
                if (markdown === currentArticle.content && contentJson === (currentArticle.content_json || '{}')) return
                updateArticle(currentArticle.id, currentArticle.title, markdown, contentJson)
                syncToServer(currentArticle.id, currentArticle.title, markdown, contentJson)
            }, 800)
        },
        [currentArticle, updateArticle, projectId]
    )
    const handleImmediateSave = useCallback((_html: string, markdown: string, json?: any) => {
        if (!currentArticle) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        const contentJson = json ? JSON.stringify(json) : currentArticle.content_json || '{}'
        if (markdown === currentArticle.content && contentJson === (currentArticle.content_json || '{}')) return
        updateArticle(currentArticle.id, currentArticle.title, markdown, contentJson)
        syncToServer(currentArticle.id, currentArticle.title, markdown, contentJson)
    }, [currentArticle, updateArticle, syncToServer])

    const handleRename = useCallback((article: KnowledgeArticle, newTitle: string) => {
        updateArticle(article.id, newTitle, article.content)
    }, [updateArticle])

    const confirmDelete = useCallback((article: KnowledgeArticle) => {
        setDeleteTarget(article)
    }, [])

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return
        const ps = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
        const serverUrl = ps.serverUrl
        const token = ps.token
        const serverKey = ps.serverKey
        if (serverUrl && projectId) {
            const headers: Record<string, string> = {}
            if (token) {
                headers['Authorization'] = `Bearer ${token}`
            } else if (serverKey) {
                headers['X-Server-Key'] = serverKey
            }
            if (headers['Authorization'] || headers['X-Server-Key']) {
                try {
                    const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/articles/${deleteTarget.id}`, {
                        method: 'DELETE',
                        headers,
                    })
                    if (!res.ok) {
                        logger.error('Server failed to delete article', new Error(`HTTP ${res.status}`))
                        return
                    }
                } catch (e) {
                    logger.error('Failed to delete article on server', e)
                    return
                }
            }
        }
        await deleteArticle(deleteTarget.id)
        setDeleteTarget(null)
    }, [deleteTarget, deleteArticle, projectId])

    // Drag-and-drop file import
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (listTabRef.current !== 'files') return
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragOver(true)
        }
    }, [listTab])

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current++
        if (listTabRef.current === 'files' && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragOver(true)
        }
    }, [listTab])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current <= 0) {
            dragCounter.current = 0
            setIsDragOver(false)
        }
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current = 0
        setIsDragOver(false)
        if (!projectId) return
        const files = e.dataTransfer.files
        for (const file of Array.from(files)) {
            if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.type === 'text/markdown') {
                const text = await file.text()
                let title = file.name.replace(/\.(md|markdown)$/i, '')
                // Auto-rename if duplicate exists
                const existingNames = articles.map((a) => a.title.toLowerCase())
                let suffix = 1
                let candidate = title
                while (existingNames.includes(candidate.toLowerCase())) {
                    candidate = `${title} (${suffix})`
                    suffix++
                }
                title = candidate
                const article = await createArticle(projectId, title, text)
                setCurrentArticle(article)
            }
        }
    }, [projectId, articles, createArticle, setCurrentArticle])

    const filteredArticles = searchQuery
        ? articles.filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : articles

    // Parse headings into tree structure
    const headingTree = useMemo(() => {
        const md = editorMd || currentArticle?.content || ''
        const lines = md.split('\n')
        const flat: { level: number; text: string; line: number }[] = []
        lines.forEach((line, i) => {
            const match = line.match(/^(#{1,6})\s+(.+)/)
            if (match) {
                // Strip markdown formatting for display
                let text = match[2].trim()
                text = text.replace(/\*\*(.+?)\*\*/g, '$1')     // bold
                text = text.replace(/__(.+?)__/g, '$1')          // bold
                text = text.replace(/\*(.+?)\*/g, '$1')          // italic
                text = text.replace(/_(.+?)_/g, '$1')            // italic
                text = text.replace(/~~(.+?)~~/g, '$1')          // strikethrough
                text = text.replace(/`(.+?)`/g, '$1')            // inline code
                text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1')   // links
                text = text.replace(/!\[.+?\]\(.+?\)/g, '')      // images
                text = text.replace(/^>\s*/, '')                  // blockquote
                flat.push({ level: match[1].length, text, line: i })
            }
        })
        return buildHeadingTree(flat)
    }, [editorMd, currentArticle?.content])

    return (
        <AppShell>
            <div className="flex-1 flex min-h-0">
                {/* Left panel: files + outline tabs */}
                <div {...panel.panelProps}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 shrink-0">
                        <button
                            onClick={() => setListTabSafe('files')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                                listTab === 'files'
                                    ? 'text-zell-600 border-b-2 border-zell-500 bg-zell-50/50'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <FileText size={13} />
                            文件
                        </button>
                        <button
                            onClick={() => setListTabSafe('outline')}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                                listTab === 'outline'
                                    ? 'text-zell-600 border-b-2 border-zell-500 bg-zell-50/50'
                                    : 'text-gray-500 hover:text-gray-700'
                            )}
                        >
                            <ListTree size={13} />
                            大纲
                        </button>
                    </div>

                    {/* Search bar (Ctrl+Shift+F) */}
                    {showSearch && listTab === 'files' && (
                        <div className="p-2 border-b border-gray-100 shrink-0">
                            <div className="relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="搜索文章..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400"
                                />
                                <button
                                    onClick={() => { setShowSearch(false); setSearchQuery('') }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Content area */}
                    <div
                        className={cn(
                            'flex-1 overflow-auto py-1 zell-scrollbar transition-colors',
                            isDragOver && 'bg-zell-50 ring-2 ring-inset ring-zell-400'
                        )}
                    >
                        {isDragOver && (
                            <div className="flex flex-col items-center justify-center h-full text-zell-500 gap-2">
                                <Upload size={32} strokeWidth={1.5} />
                                <p className="text-sm font-medium">释放以导入 Markdown 文件</p>
                            </div>
                        )}
                        {!isDragOver && (
                            listTab === 'files' ? (
                                loading ? (
                                    <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
                                ) : filteredArticles.length === 0 ? (
                                    <p className="px-3 py-4 text-sm text-gray-400 text-center">
                                        {searchQuery ? '无匹配文章' : '暂无文章'}
                                    </p>
                                ) : (
                                    filteredArticles.map((article) => (
                                        <ArticleItem
                                            key={article.id}
                                            article={article}
                                            isActive={currentArticle?.id === article.id}
                                            onSelect={setCurrentArticle}
                                            onDelete={confirmDelete}
                                            onRename={handleRename}
                                        />
                                    ))
                                )
                            ) : (
                                headingTree.length === 0 ? (
                                    <p className="px-3 py-4 text-sm text-gray-400 text-center">无标题</p>
                                ) : (
                                    headingTree.map((node, i) => (
                                        <OutlineNode key={i} node={node} depth={0} />
                                    ))
                                )
                            )
                        )}
                    </div>

                    {/* Bottom: new article + count (only in files tab) */}
                    {listTab === 'files' && (
                        <div className="p-2 border-t border-gray-100 space-y-1 shrink-0">
                            {showCreate ? (
                                <div className="flex gap-1">
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="文章标题"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreate()
                                            if (e.key === 'Escape') { setShowCreate(false); setNewTitle('') }
                                        }}
                                        className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-zell-400"
                                    />
                                    <Button size="sm" onClick={handleCreate} disabled={!newTitle.trim()}>确定</Button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowCreate(true)}
                                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
                                >
                                    <Plus size={14} />
                                    新建文章
                                </button>
                            )}

                        </div>
                    )}
                </div>

                {/* Resize handle */}
                {panel.handleProps && <div {...panel.handleProps} />}

                {/* Editor area */}
                <div className="flex-1 flex flex-col min-w-0">
                        {currentArticle ? (
                            <div className="flex-1 overflow-hidden">
                                <MarkdownEditor
                                    key={currentArticle.id}
                                    content={currentArticle.content}
                                    contentJson={
                                        currentArticle.content_json && currentArticle.content_json !== '{}'
                                            ? (() => { try { return JSON.parse(currentArticle.content_json) } catch (e) { logger.error('Failed to parse article content JSON', e); return null } })()
                                            : null
                                    }
                                    editable={(!isCollab || serverOnline) && collabReady}
                                    collabReady={collabReady}
                                    onChange={handleEditorChange}
                                    onSave={handleImmediateSave}
                                    placeholder="开始编辑知识库文档..."
                                    autofocus={false}
                                    updatedAt={(currentArticle as any).updated_at}
                                />
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-gray-400">
                                <div className="text-center">
                                    <FileText size={48} strokeWidth={1} className="mx-auto mb-3" />
                                    <p className="text-lg">选择或创建一篇文章</p>
                                </div>
                            </div>
                        )}
                </div>
            </div>

            <Dialog
                open={!!deleteTarget}
                onOpenChange={() => setDeleteTarget(null)}
                title="删除文章"
                description={'确定要删除"' + (deleteTarget?.title || '') + '"吗？此操作不可撤销。'}>
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
                    <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
                </div>
            </Dialog>
        </AppShell>
    )
}

function ArticleItem({
    article, isActive, onSelect, onDelete, onRename,
}: {
    article: KnowledgeArticle; isActive: boolean
    onSelect: (a: KnowledgeArticle) => void
    onDelete: (a: KnowledgeArticle) => void
    onRename: (a: KnowledgeArticle, newTitle: string) => void
}) {
    const [renaming, setRenaming] = useState(false)
    const [renameValue, setRenameValue] = useState(article.title)

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setRenaming(true)
        setRenameValue(article.title)
    }

    const handleRenameSubmit = () => {
        if (renameValue.trim() && renameValue !== article.title) {
            onRename(article, renameValue.trim())
        }
        setRenaming(false)
    }

    return (
        <div
            className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
                isActive ? 'bg-zell-100 text-zell-700' : 'text-gray-600 hover:bg-gray-50'
            )}
            onClick={() => onSelect(article)}
            onDoubleClick={handleDoubleClick}
        >
            <FileText size={14} className="shrink-0 text-gray-400" />
            {renaming ? (
                <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') { setRenaming(false); setRenameValue(article.title) }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 px-1 py-0.5 text-sm border border-zell-300 rounded outline-none focus:ring-1 focus:ring-zell-400"
                />
            ) : (
                <span className="truncate flex-1">{article.title}</span>
            )}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onDelete(article) }} className="p-0.5 rounded hover:bg-red-100" title="删除">
                    <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                </button>
            </div>
        </div>
    )
}

// ---- Outline tree node with expand/collapse ----
function OutlineNode({ node, depth }: { node: HeadingNode; depth: number }) {
    const [expanded, setExpanded] = useState(true)
    const hasChildren = node.children.length > 0

    const scrollToHeading = () => {
        const editor = document.querySelector('.ProseMirror')
        if (!editor) return
        const all = editor.querySelectorAll(`h${node.level}`)
        // Use data attribute to find correct heading (set by TipTap)
        if (all.length > 0) {
            for (const el of all) {
                if (el.textContent?.trim() === node.text) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    return
                }
            }
            all[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }

    return (
        <>
            <div
                className={cn(
                    'group flex items-center gap-0.5 cursor-pointer text-sm text-gray-600 hover:bg-gray-50 transition-colors select-none',
                    depth === 0 && 'font-medium py-0.5',
                    depth >= 1 && 'py-0.5',
                )}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                onClick={scrollToHeading}
            >
                {hasChildren ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                        className="p-0.5 rounded hover:bg-gray-200 shrink-0"
                    >
                        <ChevronRight
                            size={12}
                            className={cn('text-gray-400 transition-transform', expanded && 'rotate-90')}
                        />
                    </button>
                ) : (
                    <span className="w-[18px] shrink-0" />
                )}
                <span className="truncate">{node.text}</span>
            </div>
            {expanded && hasChildren && node.children.map((child, i) => (
                <OutlineNode key={i} node={child} depth={depth + 1} />
            ))}
        </>
    )
}
