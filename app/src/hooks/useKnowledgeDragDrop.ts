import { useState, useRef, useCallback } from 'react'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import type { KnowledgeArticle } from '@/types/knowledge'

interface UseKnowledgeDragDropOptions {
  projectId: string | undefined
  listTab: 'files' | 'outline'
}

interface UseKnowledgeDragDropReturn {
  isDragOver: boolean
  handleDragOver: (e: React.DragEvent) => void
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => Promise<void>
}

export function useKnowledgeDragDrop({ projectId, listTab }: UseKnowledgeDragDropOptions): UseKnowledgeDragDropReturn {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const { articles, createArticle, setCurrentArticle } = useKnowledgeStore()

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (listTab !== 'files') return
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragOver(true)
  }, [listTab])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current++
    if (listTab === 'files' && e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragOver(true)
  }, [listTab])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragOver(false) }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current = 0; setIsDragOver(false)
    if (!projectId) return
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.name.endsWith('.md') || file.name.endsWith('.markdown') || file.type === 'text/markdown') {
        const text = await file.text()
        let title = file.name.replace(/\.(md|markdown)$/i, '')
        const existingNames = articles.map((a) => a.title.toLowerCase())
        let suffix = 1; let candidate = title
        while (existingNames.includes(candidate.toLowerCase())) { candidate = `${title} (${suffix})`; suffix++ }
        const article = await createArticle(projectId, candidate, text)
        setCurrentArticle(article)
      }
    }
  }, [projectId, articles, createArticle, setCurrentArticle])

  return { isDragOver, handleDragOver, handleDragEnter, handleDragLeave, handleDrop }
}
