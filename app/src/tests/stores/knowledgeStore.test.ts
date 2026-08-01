import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import type { KnowledgeArticle } from '@/types/knowledge'

const mockArticle: KnowledgeArticle = {
  id: 'a1',
  project_id: 'p1',
  title: 'Test Article',
  content: 'Hello world',
  content_json: '{}',
  parent_id: null,
  sort_order: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useKnowledgeStore.setState({
    articles: [],
    currentArticle: null,
    loading: false,
  })
})

describe('knowledgeStore', () => {
  describe('fetchArticles', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue([mockArticle])

      await useKnowledgeStore.getState().fetchArticles('p1')

      expect(invoke).toHaveBeenCalledWith('get_knowledge_articles', { projectId: 'p1' })
      expect(useKnowledgeStore.getState().articles).toHaveLength(1)
      expect(useKnowledgeStore.getState().loading).toBe(false)
    })

    it('sets loading true while fetching', () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))
      useKnowledgeStore.getState().fetchArticles('p1')
      expect(useKnowledgeStore.getState().loading).toBe(true)
    })

    it('handles error gracefully', async () => {
      vi.mocked(invoke).mockRejectedValue('Error')
      await useKnowledgeStore.getState().fetchArticles('p1')
      expect(useKnowledgeStore.getState().loading).toBe(false)
    })
  })

  describe('createArticle', () => {
    it('calls invoke with correct params', async () => {
      vi.mocked(invoke).mockResolvedValue(mockArticle)

      const result = await useKnowledgeStore.getState().createArticle('p1', 'Title', 'Content')

      expect(invoke).toHaveBeenCalledWith('create_knowledge_article', {
        projectId: 'p1',
        title: 'Title',
        content: 'Content',
        parentId: null,
        id: null,
        contentJson: null,
      })
      expect(useKnowledgeStore.getState().articles).toHaveLength(1)
      expect(result.id).toBe('a1')
    })

    it('appends article to list', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ ...mockArticle, id: 'first' })
        .mockResolvedValueOnce({ ...mockArticle, id: 'second' })

      await useKnowledgeStore.getState().createArticle('p1', 'First')
      await useKnowledgeStore.getState().createArticle('p1', 'Second')

      const ids = useKnowledgeStore.getState().articles.map(a => a.id)
      expect(ids).toEqual(['first', 'second'])
    })
  })

  describe('fetchArticle', () => {
    it('calls invoke and sets currentArticle', async () => {
      vi.mocked(invoke).mockResolvedValue(mockArticle)

      const result = await useKnowledgeStore.getState().fetchArticle('a1')

      expect(invoke).toHaveBeenCalledWith('get_knowledge_article', { id: 'a1' })
      expect(useKnowledgeStore.getState().currentArticle?.id).toBe('a1')
      expect(result.id).toBe('a1')
    })
  })

  describe('updateArticle', () => {
    it('calls invoke and updates state', async () => {
      useKnowledgeStore.setState({
        articles: [mockArticle],
        currentArticle: mockArticle,
      })

      const updated = { ...mockArticle, title: 'Renamed', content: 'new content' }
      vi.mocked(invoke).mockResolvedValue(updated)

      await useKnowledgeStore.getState().updateArticle('a1', 'Renamed', 'new content')

      expect(invoke).toHaveBeenCalledWith('update_knowledge_article', {
        id: 'a1',
        title: 'Renamed',
        content: 'new content',
        contentJson: '{}',
      })
      expect(useKnowledgeStore.getState().articles[0].title).toBe('Renamed')
      expect(useKnowledgeStore.getState().currentArticle?.title).toBe('Renamed')
    })
  })

  describe('deleteArticle', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useKnowledgeStore.setState({
        articles: [mockArticle],
        currentArticle: mockArticle,
      })

      await useKnowledgeStore.getState().deleteArticle('a1')

      expect(invoke).toHaveBeenCalledWith('delete_knowledge_article', { id: 'a1' })
      expect(useKnowledgeStore.getState().articles).toHaveLength(0)
      expect(useKnowledgeStore.getState().currentArticle).toBeNull()
    })
  })

  describe('setCurrentArticle', () => {
    it('sets currentArticle directly', () => {
      useKnowledgeStore.getState().setCurrentArticle(mockArticle)
      expect(useKnowledgeStore.getState().currentArticle?.id).toBe('a1')
    })

    it('sets currentArticle to null', () => {
      useKnowledgeStore.getState().setCurrentArticle(mockArticle)
      useKnowledgeStore.getState().setCurrentArticle(null)
      expect(useKnowledgeStore.getState().currentArticle).toBeNull()
    })
  })

  describe('reorderArticles', () => {
    it('calls invoke with article ids', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await useKnowledgeStore.getState().reorderArticles(['a2', 'a1', 'a3'])

      expect(invoke).toHaveBeenCalledWith('reorder_knowledge_articles', {
        articleIds: ['a2', 'a1', 'a3'],
      })
    })
  })
})
