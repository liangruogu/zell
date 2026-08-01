import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import type { Whiteboard } from '@/types/whiteboard'

const mockWhiteboard: Whiteboard = {
  id: 'wb1',
  project_id: 'p1',
  name: 'Test WB',
  snapshot: null,
  update_log: null,
  wb_type: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useWhiteboardStore.setState({
    whiteboards: [],
    currentWhiteboard: null,
    loading: false,
  })
})

describe('whiteboardStore', () => {
  describe('fetchWhiteboards', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue([mockWhiteboard])

      await useWhiteboardStore.getState().fetchWhiteboards('p1')

      expect(invoke).toHaveBeenCalledWith('get_whiteboards', { projectId: 'p1' })
      expect(useWhiteboardStore.getState().whiteboards).toHaveLength(1)
      expect(useWhiteboardStore.getState().loading).toBe(false)
    })

    it('sets loading true while fetching', () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))
      useWhiteboardStore.getState().fetchWhiteboards('p1')
      expect(useWhiteboardStore.getState().loading).toBe(true)
    })

    it('handles error gracefully', async () => {
      vi.mocked(invoke).mockRejectedValue('Error')
      await useWhiteboardStore.getState().fetchWhiteboards('p1')
      expect(useWhiteboardStore.getState().loading).toBe(false)
    })
  })

  describe('createWhiteboard', () => {
    it('calls invoke with correct params', async () => {
      vi.mocked(invoke).mockResolvedValue(mockWhiteboard)

      const result = await useWhiteboardStore.getState().createWhiteboard('p1', 'My WB')

      expect(invoke).toHaveBeenCalledWith('create_whiteboard', {
        projectId: 'p1',
        name: 'My WB',
        wbType: 'free',
      })
      expect(useWhiteboardStore.getState().whiteboards).toHaveLength(1)
      expect(result.id).toBe('wb1')
    })

    it('appends whiteboard to list', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ ...mockWhiteboard, id: 'first' })
        .mockResolvedValueOnce({ ...mockWhiteboard, id: 'second' })

      await useWhiteboardStore.getState().createWhiteboard('p1', 'First')
      await useWhiteboardStore.getState().createWhiteboard('p1', 'Second')

      const ids = useWhiteboardStore.getState().whiteboards.map(w => w.id)
      expect(ids).toEqual(['first', 'second'])
    })
  })

  describe('deleteWhiteboard', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useWhiteboardStore.setState({
        whiteboards: [mockWhiteboard],
        currentWhiteboard: mockWhiteboard,
      })

      await useWhiteboardStore.getState().deleteWhiteboard('wb1')

      expect(invoke).toHaveBeenCalledWith('delete_whiteboard', { id: 'wb1' })
      expect(useWhiteboardStore.getState().whiteboards).toHaveLength(0)
      expect(useWhiteboardStore.getState().currentWhiteboard).toBeNull()
    })
  })

  describe('setCurrentWhiteboard', () => {
    it('sets currentWhiteboard directly', () => {
      useWhiteboardStore.getState().setCurrentWhiteboard(mockWhiteboard)
      expect(useWhiteboardStore.getState().currentWhiteboard?.id).toBe('wb1')
    })

    it('sets currentWhiteboard to null', () => {
      useWhiteboardStore.getState().setCurrentWhiteboard(mockWhiteboard)
      useWhiteboardStore.getState().setCurrentWhiteboard(null)
      expect(useWhiteboardStore.getState().currentWhiteboard).toBeNull()
    })
  })

  describe('saveSnapshot', () => {
    it('calls invoke with correct params', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await useWhiteboardStore.getState().saveSnapshot('wb1', '{"elements":[]}')

      expect(invoke).toHaveBeenCalledWith('save_whiteboard_snapshot', {
        id: 'wb1',
        snapshot: '{"elements":[]}',
      })
    })
  })

  describe('renameWhiteboard', () => {
    it('calls invoke and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useWhiteboardStore.setState({
        whiteboards: [mockWhiteboard],
        currentWhiteboard: mockWhiteboard,
      })

      await useWhiteboardStore.getState().renameWhiteboard('wb1', 'New Name')

      expect(invoke).toHaveBeenCalledWith('rename_whiteboard', {
        id: 'wb1',
        name: 'New Name',
      })
      expect(useWhiteboardStore.getState().whiteboards[0].name).toBe('New Name')
      expect(useWhiteboardStore.getState().currentWhiteboard?.name).toBe('New Name')
    })
  })
})
