import { create } from 'zustand'
import type { ExternalLink } from '@/types/share'
import { invoke } from '@tauri-apps/api/core'

export interface SearchResult {
  title: string
  snippet: string
  source_type: string
  source_id: string
  project_id: string
  rank: number
}

interface LinkState {
  links: ExternalLink[]
  currentLink: ExternalLink | null
  loading: boolean

  fetchLinks: (projectId: string) => Promise<void>
  createLink: (projectId: string, data: {
    title: string; url: string; description?: string; linkType?: string; aiSkill?: string
  }) => Promise<ExternalLink>
  updateLink: (id: string, data: {
    title: string; url: string; description: string; linkType: string; aiSkill?: string
  }) => Promise<void>
  deleteLink: (id: string) => Promise<void>
  syncLink: (id: string) => Promise<void>
  searchDocuments: (projectId: string, query: string, limit?: number) => Promise<SearchResult[]>
  setCurrentLink: (link: ExternalLink | null) => void
}

export const useLinkStore = create<LinkState>((set) => ({
  links: [],
  currentLink: null,
  loading: false,

  fetchLinks: async (projectId: string) => {
    set({ loading: true })
    try {
      const links = await invoke<ExternalLink[]>('get_external_links', { projectId })
      set({ links, loading: false })
    } catch { set({ loading: false }) }
  },

  createLink: async (projectId, data) => {
    const link = await invoke<ExternalLink>('create_external_link', {
      projectId, title: data.title, url: data.url,
      description: data.description || '', linkType: data.linkType || 'web',
      aiSkill: data.aiSkill || '',
    })
    set((s) => ({ links: [...s.links, link] }))
    return link
  },

  updateLink: async (id, data) => {
    await invoke('update_external_link', {
      id, title: data.title, url: data.url,
      description: data.description, linkType: data.linkType,
      aiSkill: data.aiSkill || '',
    })
    set((s) => ({
      links: s.links.map((l) => l.id === id ? { ...l, ...data } : l),
      currentLink: s.currentLink?.id === id ? { ...s.currentLink, ...data } : s.currentLink,
    }))
  },

  deleteLink: async (id: string) => {
    await invoke('delete_external_link', { id })
    set((s) => ({
      links: s.links.filter((l) => l.id !== id),
      currentLink: s.currentLink?.id === id ? null : s.currentLink,
    }))
  },

  syncLink: async (id: string) => {
    const updated = await invoke<ExternalLink>('sync_link', { id })
    set((s) => ({
      links: s.links.map((l) => l.id === id ? updated : l),
      currentLink: s.currentLink?.id === id ? updated : s.currentLink,
    }))
  },

  setCurrentLink: (link) => set({ currentLink: link }),

  searchDocuments: async (projectId: string, query: string, limit = 5) => {
    return invoke<SearchResult[]>('search_documents', { projectId, query, limit })
  },
}))
