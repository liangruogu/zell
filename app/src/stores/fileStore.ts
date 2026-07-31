import { create } from 'zustand'
import type { ProjectFile } from '@/types/share'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@/lib/logger'

interface FileState {
  files: ProjectFile[]
  currentFile: ProjectFile | null
  loading: boolean

  fetchFiles: (projectId: string) => Promise<void>
  importFile: (projectId: string, sourcePath: string) => Promise<ProjectFile>
  deleteFile: (id: string) => Promise<void>
  updateFile: (id: string, data: { description: string }) => Promise<void>
  resolveFileUrl: (projectId: string, fileName: string) => Promise<string>
  getFilePath: (projectId: string, fileName: string) => Promise<string>
  reExtractText: (id: string) => Promise<string>
  setCurrentFile: (file: ProjectFile | null) => void
  renameFile: (id: string, newName: string) => Promise<void>
}

export const useFileStore = create<FileState>((set) => ({
  files: [],
  currentFile: null,
  loading: false,

  fetchFiles: async (projectId: string) => {
    set({ loading: true })
    try {
      const files = await invoke<ProjectFile[]>('get_project_files', { projectId })
      set({ files, loading: false })
    } catch (e) { logger.error('Failed to fetch files', e); set({ loading: false }) }
  },

  importFile: async (projectId, sourcePath) => {
    const file = await invoke<ProjectFile>('import_project_file', { projectId, sourcePath })
    set((s) => ({ files: [...s.files, file] }))
    return file
  },

  deleteFile: async (id: string) => {
    await invoke('delete_project_file', { id })
    set((s) => ({
      files: s.files.filter((f) => f.id !== id),
      currentFile: s.currentFile?.id === id ? null : s.currentFile,
    }))
  },

  updateFile: async (id, data) => {
    await invoke('update_project_file', { id, description: data.description })
    set((s) => ({
      files: s.files.map((f) =>
        f.id === id ? { ...f, description: data.description } : f
      ),
    }))
  },

  resolveFileUrl: async (projectId, fileName) => {
    return invoke<string>('resolve_project_file', { projectId, fileName })
  },

  renameFile: async (id: string, newName: string) => {
    await invoke('rename_project_file', { id, newName })
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, original_name: newName } : f)),
      currentFile: s.currentFile?.id === id ? { ...s.currentFile, original_name: newName } : s.currentFile,
    }))
  },

  getFilePath: async (projectId, fileName) => {
    return invoke<string>('get_project_file_path', { projectId, fileName })
  },

  reExtractText: async (id) => {
    const text = await invoke<string>('re_extract_file_text', { id })
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, extracted_text: text } : f)),
      currentFile: s.currentFile?.id === id ? { ...s.currentFile, extracted_text: text } : s.currentFile,
    }))
    return text
  },

  setCurrentFile: (file) => set({ currentFile: file }),
}))
