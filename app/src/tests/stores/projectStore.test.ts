import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types/project'

const mockProject: Project = {
  id: 'p1',
  name: 'Test Project',
  description: '',
  background: '#ffffff',
  settings: '{}',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useProjectStore.setState({
    projects: [],
    currentProject: null,
    loading: false,
    error: null,
  })
})

describe('projectStore', () => {
  describe('fetchProjects', () => {
    it('calls invoke with correct command and updates state', async () => {
      vi.mocked(invoke).mockResolvedValue([mockProject])

      await useProjectStore.getState().fetchProjects()

      expect(invoke).toHaveBeenCalledWith('get_projects')
      expect(useProjectStore.getState().projects).toHaveLength(1)
      expect(useProjectStore.getState().projects[0].id).toBe('p1')
      expect(useProjectStore.getState().loading).toBe(false)
    })

    it('sets loading true while fetching', () => {
      vi.mocked(invoke).mockImplementation(() => new Promise(() => {}))
      useProjectStore.getState().fetchProjects()
      expect(useProjectStore.getState().loading).toBe(true)
    })

    it('handles error', async () => {
      vi.mocked(invoke).mockRejectedValue('Network error')

      await useProjectStore.getState().fetchProjects()

      expect(useProjectStore.getState().error).toBe('Network error')
      expect(useProjectStore.getState().loading).toBe(false)
      expect(useProjectStore.getState().projects).toHaveLength(0)
    })
  })

  describe('fetchProject', () => {
    it('calls invoke and sets currentProject', async () => {
      vi.mocked(invoke).mockResolvedValue(mockProject)

      await useProjectStore.getState().fetchProject('p1')

      expect(invoke).toHaveBeenCalledWith('get_project', { id: 'p1' })
      expect(useProjectStore.getState().currentProject?.id).toBe('p1')
    })
  })

  describe('createProject', () => {
    it('calls invoke with correct params and prepends to list', async () => {
      vi.mocked(invoke).mockResolvedValue(mockProject)

      const result = await useProjectStore.getState().createProject({
        name: 'My Project',
        description: 'A desc',
        background: '#000',
        settings: '{}',
      })

      expect(invoke).toHaveBeenCalledWith('create_project', {
        id: null,
        name: 'My Project',
        description: 'A desc',
        background: '#000',
        icon: '',
        settings: '{}',
      })
      expect(useProjectStore.getState().projects).toHaveLength(1)
      expect(result.id).toBe('p1')
    })

    it('prepends new project to list', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ ...mockProject, id: 'old' })
        .mockResolvedValueOnce({ ...mockProject, id: 'new' })

      await useProjectStore.getState().createProject({ name: 'Old' })
      await useProjectStore.getState().createProject({ name: 'New' })

      const ids = useProjectStore.getState().projects.map(p => p.id)
      expect(ids).toEqual(['new', 'old'])
    })

    it('updates existing project when id matches', async () => {
      useProjectStore.setState({ projects: [mockProject] })

      const updated = { ...mockProject, name: 'Updated', description: 'new desc' }
      vi.mocked(invoke).mockResolvedValue(updated)

      await useProjectStore.getState().createProject({
        id: 'p1', name: 'Updated', description: 'new desc',
      })

      expect(useProjectStore.getState().projects[0].name).toBe('Updated')
      expect(useProjectStore.getState().projects).toHaveLength(1)
    })
  })

  describe('updateProject', () => {
    it('calls invoke and updates state', async () => {
      useProjectStore.setState({
        projects: [mockProject],
        currentProject: mockProject,
      })

      const updated = { ...mockProject, name: 'Renamed', description: 'changed' }
      vi.mocked(invoke).mockResolvedValue(updated)

      await useProjectStore.getState().updateProject('p1', {
        name: 'Renamed',
        description: 'changed',
        background: '#fff',
        settings: '{}',
      })

      expect(invoke).toHaveBeenCalledWith('update_project', {
        id: 'p1',
        name: 'Renamed',
        description: 'changed',
        background: '#fff',
        icon: '',
        settings: '{}',
      })
      expect(useProjectStore.getState().projects[0].name).toBe('Renamed')
      expect(useProjectStore.getState().currentProject?.name).toBe('Renamed')
    })
  })

  describe('deleteProject', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useProjectStore.setState({
        projects: [mockProject],
        currentProject: mockProject,
      })

      await useProjectStore.getState().deleteProject('p1')

      expect(invoke).toHaveBeenCalledWith('delete_project', { id: 'p1' })
      expect(useProjectStore.getState().projects).toHaveLength(0)
      expect(useProjectStore.getState().currentProject).toBeNull()
    })
  })

  describe('setCurrentProject', () => {
    it('sets currentProject directly', () => {
      useProjectStore.getState().setCurrentProject(mockProject)
      expect(useProjectStore.getState().currentProject?.id).toBe('p1')
    })

    it('sets currentProject to null', () => {
      useProjectStore.getState().setCurrentProject(mockProject)
      useProjectStore.getState().setCurrentProject(null)
      expect(useProjectStore.getState().currentProject).toBeNull()
    })
  })
})
