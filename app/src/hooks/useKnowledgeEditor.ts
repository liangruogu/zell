import { useState, useCallback, useRef } from 'react'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useProjectStore } from '@/stores/projectStore'
import { parseProjectSettings } from '@/types/project'
import type { KnowledgeArticle } from '@/types/knowledge'
import { logger } from '@/lib/logger'

interface UseKnowledgeEditorOptions {
  projectId: string | undefined
  currentArticle: KnowledgeArticle | null
  onContentChange?: (md: string) => void
}

interface UseKnowledgeEditorReturn {
  newTitle: string
  setNewTitle: (v: string) => void
  showCreate: boolean
  setShowCreate: (v: boolean) => void
  deleteTarget: KnowledgeArticle | null
  setDeleteTarget: (v: KnowledgeArticle | null) => void
  handleCreate: () => Promise<void>
  handleEditorChange: (html: string, markdown: string, json?: any) => void
  handleImmediateSave: (html: string, markdown: string, json?: any) => void
  handleRename: (article: KnowledgeArticle, newTitle: string) => void
  confirmDelete: (article: KnowledgeArticle) => void
  handleDelete: () => Promise<void>
}

export function useKnowledgeEditor({ projectId, currentArticle, onContentChange }: UseKnowledgeEditorOptions): UseKnowledgeEditorReturn {
  const { createArticle, updateArticle, deleteArticle, setCurrentArticle } = useKnowledgeStore()
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeArticle | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncToServer = useCallback((aid: string, title: string, content: string, contentJson: string, isNew = false) => {
    const ps = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
    if (!ps.serverUrl || !projectId) return
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (ps.token) headers['Authorization'] = `Bearer ${ps.token}`
    else if (ps.serverKey) headers['X-Server-Key'] = ps.serverKey
    else return
    const url = `${ps.serverUrl}/api/v1/projects/${projectId}/articles${isNew ? '' : '/' + aid}`
    fetch(url, {
      method: isNew ? 'POST' : 'PUT',
      headers,
      body: JSON.stringify({ id: aid, project_id: projectId, title, content, content_json: contentJson }),
    }).catch((e) => { logger.error('Failed to sync article to server', e) })
  }, [projectId])

  const handleCreate = useCallback(async () => {
    if (!projectId || !newTitle.trim()) return
    const exists = useKnowledgeStore.getState().articles.some(
      a => a.title.toLowerCase() === newTitle.trim().toLowerCase()
    )
    if (exists) {
      alert('同名文章已存在，请更换名称')
      return
    }
    const article = await createArticle(projectId, newTitle.trim(), "")
    setNewTitle(''); setShowCreate(false)
    setCurrentArticle(article)
    syncToServer(article.id, article.title, "", '{}', true)
  }, [projectId, newTitle, createArticle, setCurrentArticle, syncToServer])

  const handleEditorChange = useCallback(
    (_html: string, markdown: string, json?: any) => {
      onContentChange?.(markdown)
      if (!currentArticle) return
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const contentJson = json ? JSON.stringify(json) : currentArticle.content_json || '{}'
        if (markdown === currentArticle.content && contentJson === (currentArticle.content_json || '{}')) return
        updateArticle(currentArticle.id, currentArticle.title, markdown, contentJson)
        syncToServer(currentArticle.id, currentArticle.title, markdown, contentJson)
      }, 800)
    },
    [currentArticle, updateArticle, syncToServer]
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
    const exists = useKnowledgeStore.getState().articles.some(
      a => a.id !== article.id && a.title.toLowerCase() === newTitle.toLowerCase()
    )
    if (exists) {
      alert('同名文章已存在，请更换名称')
      return
    }
    updateArticle(article.id, newTitle, article.content)
  }, [updateArticle])

  const confirmDelete = useCallback((article: KnowledgeArticle) => { setDeleteTarget(article) }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    const ps = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
    if (ps.serverUrl && projectId) {
      const headers: Record<string, string> = {}
      if (ps.token) headers['Authorization'] = `Bearer ${ps.token}`
      else if (ps.serverKey) headers['X-Server-Key'] = ps.serverKey
      if (headers['Authorization'] || headers['X-Server-Key']) {
        try {
          const res = await fetch(`${ps.serverUrl}/api/v1/projects/${projectId}/articles/${deleteTarget.id}`, { method: 'DELETE', headers })
          if (!res.ok) { logger.error('Server failed to delete article', new Error(`HTTP ${res.status}`)); return }
        } catch (e) { logger.error('Failed to delete article on server', e); return }
      }
    }
    await deleteArticle(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteArticle, projectId])

  return { newTitle, setNewTitle, showCreate, setShowCreate, deleteTarget, setDeleteTarget,
    handleCreate, handleEditorChange, handleImmediateSave, handleRename, confirmDelete, handleDelete }
}
