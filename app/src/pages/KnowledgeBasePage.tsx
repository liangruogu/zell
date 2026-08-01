import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useProjectStore } from '@/stores/projectStore'
import { parseProjectSettings } from '@/types/project'
import { ResizablePanel, useResizablePanel } from '@/components/layout/ResizablePanel'
import { Plus, FileText, Search, X, ListTree, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useServerSync } from '@/hooks/useServerSync'
import { useKnowledgeShortcuts } from '@/hooks/useKnowledgeShortcuts'
import { useKnowledgeEditor } from '@/hooks/useKnowledgeEditor'
import { useKnowledgeDragDrop } from '@/hooks/useKnowledgeDragDrop'
import { parseHeadingTree } from '@/lib/headingTree'
import { ArticleItem } from '@/components/knowledge/ArticleItem'
import { OutlineNode } from '@/components/knowledge/OutlineNode'
import { logger } from '@/lib/logger'

type ListTab = 'files' | 'outline'


export default function KnowledgeBasePage() {
    const { id: projectId } = useParams<{ id: string }>()
    const { fetchProject } = useProjectStore()
    const deleteProject = useProjectStore(s => s.deleteProject)
    const { articles, currentArticle, loading, fetchArticles, setCurrentArticle } = useKnowledgeStore()
    const panel = useResizablePanel(224, 120, 400, 80, 'zell_panel_knowledge')

    const [searchQuery, setSearchQuery] = useState('')
    const [showSearch, setShowSearch] = useState(false)
    const [listTab, setListTab] = useState<ListTab>('files')
    const listTabRef = useRef<ListTab>('files')
    const setListTabSafe = (tab: ListTab) => { setListTab(tab); listTabRef.current = tab }
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [editorMd, setEditorMd] = useState('')

    const psCollab = parseProjectSettings(useProjectStore(s => s.currentProject?.settings) || '{}')
    const isCollab = !!(psCollab.collabEnabled ?? (psCollab.token || psCollab.serverKey))
    console.log('[KB] isCollab', { isCollab, collabEnabled: psCollab.collabEnabled, hasToken: !!psCollab.token, hasServerKey: !!psCollab.serverKey, settings: psCollab })
    const { serverOnline, collabReady } = useServerSync({ projectId, isCollab, deleteProject })

    useEffect(() => {
        if (projectId) { fetchProject(projectId); fetchArticles(projectId) }
    }, [projectId, fetchProject, fetchArticles])

    useKnowledgeShortcuts({
        panel, setListTab,
        focusSearch: () => { setTimeout(() => searchInputRef.current?.focus(), 50) },
        showSearch, setShowSearch, setSearchQuery,
    })

    const { newTitle, setNewTitle, showCreate, setShowCreate, deleteTarget, setDeleteTarget,
        handleCreate, handleEditorChange, handleImmediateSave, handleRename, confirmDelete, handleDelete
    } = useKnowledgeEditor({ projectId, currentArticle, onContentChange: setEditorMd })

    const { isDragOver, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } =
        useKnowledgeDragDrop({ projectId, listTab })

    const filteredArticles = searchQuery
        ? articles.filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : articles

    const headingTree = useMemo(() =>
        parseHeadingTree(editorMd || currentArticle?.content || ''),
        [editorMd, currentArticle?.content])


    const editorJson = useMemo(() => {
        const raw = currentArticle?.content_json
        if (!raw || raw === '{}') return null
        try { return JSON.parse(raw) } catch (e) { logger.error('Failed to parse article content JSON', e); return null }
    }, [currentArticle?.content_json])

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
                                contentJson={editorJson}
                                editable={isCollab ? (serverOnline && collabReady) : true}
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
