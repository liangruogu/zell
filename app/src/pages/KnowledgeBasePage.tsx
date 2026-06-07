import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useProjectStore } from '@/stores/projectStore'
import { ResizablePanel, useResizablePanel } from '@/components/layout/ResizablePanel'
import type { KnowledgeArticle } from '@/types/knowledge'
import { markdownToHtml } from '@/lib/markdown'
import { Plus, FileText, Trash2, FileOutput, Search, X, ListTree, ChevronRight, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const {
    articles, currentArticle, loading,
    fetchArticles, createArticle, updateArticle, deleteArticle, setCurrentArticle,
  } = useKnowledgeStore()
  const panel = useResizablePanel()

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

  const handleCreate = useCallback(async () => {
    if (!projectId || !newTitle.trim()) return
    const mdContent = `# ${newTitle.trim()}\n\n开始编写内容...`
    const article = await createArticle(projectId, newTitle.trim(), mdContent)
    setNewTitle('')
    setShowCreate(false)
    setCurrentArticle(article)
  }, [projectId, newTitle, createArticle, setCurrentArticle])

  const handleEditorChange = useCallback(
    (_html: string, markdown: string) => {
      setEditorMd(markdown)
      if (!currentArticle) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        updateArticle(currentArticle.id, currentArticle.title, markdown)
      }, 800)
    },
    [currentArticle, updateArticle]
  )

  const handleImmediateSave = useCallback((_html: string, markdown: string) => {
    if (!currentArticle) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    updateArticle(currentArticle.id, currentArticle.title, markdown)
  }, [currentArticle, updateArticle])

  const handleExport = useCallback((article: KnowledgeArticle) => {
    const html = markdownToHtml(article.content)
    const docHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${article.title}</title></head><body>${html}</body></html>`
    const blob = new Blob([docHtml], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${article.title}.doc`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const confirmDelete = useCallback((article: KnowledgeArticle) => {
    setDeleteTarget(article)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteArticle(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteArticle])

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
                  ? 'text-bindle-600 border-b-2 border-bindle-500 bg-bindle-50/50'
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
                  ? 'text-bindle-600 border-b-2 border-bindle-500 bg-bindle-50/50'
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
                  className="w-full pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-bindle-400"
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
              'flex-1 overflow-auto py-1 bindle-scrollbar transition-colors',
              isDragOver && 'bg-bindle-50 ring-2 ring-inset ring-bindle-400'
            )}
          >
            {isDragOver && (
              <div className="flex flex-col items-center justify-center h-full text-bindle-500 gap-2">
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
                    onExport={handleExport}
                    onDelete={confirmDelete}
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
                    className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400"
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
              <p className="text-xs text-gray-400 px-2.5">{articles.length} 篇文章</p>
            </div>
          )}
        </div>

        {/* Resize handle */}
        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentArticle ? (
            <div className="flex-1 p-3 overflow-hidden">
              <MarkdownEditor
                key={currentArticle.id}
                content={currentArticle.content}
                onChange={handleEditorChange}
                onSave={handleImmediateSave}
                placeholder="开始编辑知识库文档..."
                autofocus={false}
                updatedAt={currentArticle.updated_at}
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
        description={`确定要删除「${deleteTarget?.title}」吗？此操作不可撤销。`}
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}

function ArticleItem({
  article, isActive, onSelect, onExport, onDelete,
}: {
  article: KnowledgeArticle; isActive: boolean
  onSelect: (a: KnowledgeArticle) => void
  onExport: (a: KnowledgeArticle) => void
  onDelete: (a: KnowledgeArticle) => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
        isActive ? 'bg-bindle-100 text-bindle-700' : 'text-gray-600 hover:bg-gray-50'
      )}
      onClick={() => onSelect(article)}
    >
      <FileText size={14} className="shrink-0 text-gray-400" />
      <span className="truncate flex-1">{article.title}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onExport(article) }} className="p-0.5 rounded hover:bg-bindle-200" title="导出 Word">
          <FileOutput size={13} className="text-gray-400 hover:text-bindle-600" />
        </button>
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
