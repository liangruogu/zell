import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useLinkStore } from '@/stores/linkStore'
import type { ExternalLink } from '@/types/share'

const mockLink: ExternalLink = {
  id: 'l1',
  project_id: 'p1',
  title: 'Example',
  url: 'https://example.com',
  description: '',
  link_type: 'web',
  favicon: '',
  ai_skill: '',
  sort_order: 0,
  sync_status: 'synced',
  last_synced_at: null,
  last_snapshot: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useLinkStore.setState({
    links: [],
    currentLink: null,
    loading: false,
  })
})

describe('linkStore', () => {
  describe('fetchLinks', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue([mockLink])

      await useLinkStore.getState().fetchLinks('p1')

      expect(invoke).toHaveBeenCalledWith('get_external_links', { projectId: 'p1' })
      expect(useLinkStore.getState().links).toHaveLength(1)
      expect(useLinkStore.getState().loading).toBe(false)
    })

    it('sets loading true while fetching', () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))
      useLinkStore.getState().fetchLinks('p1')
      expect(useLinkStore.getState().loading).toBe(true)
    })

    it('handles error gracefully', async () => {
      vi.mocked(invoke).mockRejectedValue('Error')
      await useLinkStore.getState().fetchLinks('p1')
      expect(useLinkStore.getState().loading).toBe(false)
    })
  })

  describe('createLink', () => {
    it('calls invoke and appends to list', async () => {
      vi.mocked(invoke).mockResolvedValue(mockLink)

      const result = await useLinkStore.getState().createLink('p1', {
        title: 'Test', url: 'https://test.com',
      })

      expect(invoke).toHaveBeenCalledWith('create_external_link', {
        projectId: 'p1',
        title: 'Test',
        url: 'https://test.com',
        description: '',
        linkType: 'web',
        aiSkill: '',
      })
      expect(useLinkStore.getState().links).toHaveLength(1)
      expect(result.id).toBe('l1')
    })
  })

  describe('updateLink', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useLinkStore.setState({
        links: [mockLink],
        currentLink: mockLink,
      })

      await useLinkStore.getState().updateLink('l1', {
        title: 'Renamed',
        url: 'https://new.com',
        description: 'new desc',
        linkType: 'github',
        aiSkill: 'code',
      })

      expect(invoke).toHaveBeenCalledWith('update_external_link', {
        id: 'l1',
        title: 'Renamed',
        url: 'https://new.com',
        description: 'new desc',
        linkType: 'github',
        aiSkill: 'code',
      })
      expect(useLinkStore.getState().links[0].title).toBe('Renamed')
      expect(useLinkStore.getState().currentLink?.title).toBe('Renamed')
    })
  })

  describe('deleteLink', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useLinkStore.setState({
        links: [mockLink],
        currentLink: mockLink,
      })

      await useLinkStore.getState().deleteLink('l1')

      expect(invoke).toHaveBeenCalledWith('delete_external_link', { id: 'l1' })
      expect(useLinkStore.getState().links).toHaveLength(0)
      expect(useLinkStore.getState().currentLink).toBeNull()
    })
  })

  describe('syncLink', () => {
    it('calls invoke and updates state with returned link', async () => {
      const syncedLink = { ...mockLink, sync_status: 'synced', last_synced_at: '2024-01-02T00:00:00Z' }
      vi.mocked(invoke).mockResolvedValue(syncedLink)
      useLinkStore.setState({
        links: [mockLink],
        currentLink: mockLink,
      })

      await useLinkStore.getState().syncLink('l1')

      expect(invoke).toHaveBeenCalledWith('sync_link', { id: 'l1' })
      expect(useLinkStore.getState().links[0].sync_status).toBe('synced')
      expect(useLinkStore.getState().currentLink?.sync_status).toBe('synced')
    })
  })

  describe('setCurrentLink', () => {
    it('sets currentLink directly', () => {
      useLinkStore.getState().setCurrentLink(mockLink)
      expect(useLinkStore.getState().currentLink?.id).toBe('l1')
    })

    it('sets currentLink to null', () => {
      useLinkStore.getState().setCurrentLink(mockLink)
      useLinkStore.getState().setCurrentLink(null)
      expect(useLinkStore.getState().currentLink).toBeNull()
    })
  })

  describe('searchDocuments', () => {
    it('calls invoke with query and returns results', async () => {
      const mockResults = [{ title: 'Result', snippet: '...', source_type: 'file', source_id: 'f1', project_id: 'p1', rank: 1 }]
      vi.mocked(invoke).mockResolvedValue(mockResults)

      const results = await useLinkStore.getState().searchDocuments('p1', 'keyword')

      expect(invoke).toHaveBeenCalledWith('search_documents', {
        projectId: 'p1',
        query: 'keyword',
        limit: 5,
      })
      expect(results).toHaveLength(1)
    })

    it('passes custom limit', async () => {
      vi.mocked(invoke).mockResolvedValue([])

      await useLinkStore.getState().searchDocuments('p1', 'test', 10)

      expect(invoke).toHaveBeenCalledWith('search_documents', {
        projectId: 'p1',
        query: 'test',
        limit: 10,
      })
    })
  })
})
