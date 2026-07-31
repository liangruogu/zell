import { create } from 'zustand'
import type { KnowledgeArticle } from '@/types/knowledge'
import { invoke } from '@tauri-apps/api/core'

interface KnowledgeState {
  articles: KnowledgeArticle[]
  currentArticle: KnowledgeArticle | null
  loading: boolean

  fetchArticles: (projectId: string) => Promise<void>
  createArticle: (projectId: string, title: string, content?: string, parentId?: string) => Promise<KnowledgeArticle>
  fetchArticle: (id: string) => Promise<KnowledgeArticle>
  updateArticle: (id: string, title: string, content: string, contentJson?: string) => Promise<void>
  deleteArticle: (id: string) => Promise<void>
  setCurrentArticle: (article: KnowledgeArticle | null) => void
  reorderArticles: (articleIds: string[]) => Promise<void>
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  articles: [],
  currentArticle: null,
  loading: false,

  fetchArticles: async (projectId: string) => {
    set({ loading: true })
    try {
      const articles = await invoke<KnowledgeArticle[]>('get_knowledge_articles', { projectId })
      set({ articles, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  createArticle: async (projectId: string, title: string, content = '', parentId?: string, id?: string, contentJson?: string) => {
    const article = await invoke<KnowledgeArticle>('create_knowledge_article', {
      projectId,
      title,
      content,
      parentId: parentId || null,
      id: id || null,
      contentJson: contentJson || null,
    })
    set((state) => ({ articles: [...state.articles, article] }))
    return article
  },

  fetchArticle: async (id: string) => {
    const article = await invoke<KnowledgeArticle>('get_knowledge_article', { id })
    set({ currentArticle: article })
    return article
  },

  updateArticle: async (id: string, title: string, content: string, contentJson = '{}') => {
    const updated = await invoke<KnowledgeArticle>('update_knowledge_article', {
      id,
      title,
      content,
      contentJson,
    })
    set((state) => ({
      articles: state.articles.map((a) => (a.id === id ? updated : a)),
      currentArticle: state.currentArticle?.id === id ? updated : state.currentArticle,
    }))
  },

  deleteArticle: async (id: string) => {
    await invoke('delete_knowledge_article', { id })
    set((state) => ({
      articles: state.articles.filter((a) => a.id !== id),
      currentArticle: state.currentArticle?.id === id ? null : state.currentArticle,
    }))
  },

  setCurrentArticle: (article) => set({ currentArticle: article }),

  reorderArticles: async (articleIds: string[]) => {
    await invoke('reorder_knowledge_articles', { articleIds })
  },
}))
