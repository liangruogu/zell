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
import type { KnowledgeArticle } from '@/types/knowledge'
import { Plus, FileText, Trash2, Search, X, ListTree, ChevronRight, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useServerSync } from '@/hooks/useServerSync'
import { useKnowledgeShortcuts } from '@/hooks/useKnowledgeShortcuts'
import { useKnowledgeEditor } from '@/hooks/useKnowledgeEditor'
import { useKnowledgeDragDrop } from '@/hooks/useKnowledgeDragDrop'
import { parseHeadingTree } from '@/lib/headingTree'
import { logger } from '@/lib/logger'

type ListTab = 'files' | 'outline'

import { parseHeadingTree, type HeadingNode } from '@/lib/headingTree'

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
    const isCollab = !!psCollab.collabEnabled
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
