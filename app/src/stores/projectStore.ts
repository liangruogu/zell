import { create } from 'zustand'
import type { Project } from '@/types/project'
import { invoke } from '@tauri-apps/api/core'

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null

  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: CreateProjectInput) => Promise<Project>
  updateProject: (id: string, data: UpdateProjectInput) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
}

export interface CreateProjectInput {
  id?: string
  name: string
  description?: string
  background?: string
  settings?: string
}

export interface UpdateProjectInput {
  name: string
  description: string
  background: string
  settings: string
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await invoke<Project[]>('get_projects')
      set({ projects, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  fetchProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const project = await invoke<Project>('get_project', { id })
      set({ currentProject: project, loading: false })
    } catch (e) {
      set({ error: String(e), loading: false })
    }
  },

  createProject: async (data: CreateProjectInput) => {
    const project = await invoke<Project>('create_project', {
      id: data.id || null,
      name: data.name,
      description: data.description || '',
      background: data.background || '',
      icon: '',
      settings: data.settings || '{}',
    })
    set((state) => ({ projects: [project, ...state.projects] }))
    return project
  },

  updateProject: async (id: string, data: UpdateProjectInput) => {
    const updated = await invoke<Project>('update_project', {
      id,
      name: data.name,
      description: data.description,
      background: data.background,
      icon: '',
      settings: data.settings,
    })
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? updated : p)),
      currentProject: state.currentProject?.id === id ? updated : state.currentProject,
    }))
  },

  deleteProject: async (id: string) => {
    await invoke('delete_project', { id })
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }))
  },

  setCurrentProject: (project) => set({ currentProject: project }),
}))
