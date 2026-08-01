import { useState } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { KnowledgeArticle } from '@/types/knowledge'

interface ArticleItemProps {
  article: KnowledgeArticle
  isActive: boolean
  onSelect: (a: KnowledgeArticle) => void
  onDelete: (a: KnowledgeArticle) => void
  onRename: (a: KnowledgeArticle, newTitle: string) => void
}

export function ArticleItem({ article, isActive, onSelect, onDelete, onRename }: ArticleItemProps) {
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
