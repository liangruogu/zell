import { create } from 'zustand'
import type { Whiteboard } from '@/types/whiteboard'
import { invoke } from '@tauri-apps/api/core'

interface WhiteboardState {
  whiteboards: Whiteboard[]
  currentWhiteboard: Whiteboard | null
  loading: boolean

  fetchWhiteboards: (projectId: string) => Promise<void>
  createWhiteboard: (projectId: string, name: string, wbType?: string) => Promise<Whiteboard>
  deleteWhiteboard: (id: string) => Promise<void>
  setCurrentWhiteboard: (wb: Whiteboard | null) => void
  saveSnapshot: (id: string, snapshotJson: string) => Promise<void>
  renameWhiteboard: (id: string, name: string) => Promise<void>
}

export const useWhiteboardStore = create<WhiteboardState>((set, get) => ({
  whiteboards: [],
  currentWhiteboard: null,
  loading: false,

  fetchWhiteboards: async (projectId: string) => {
    set({ loading: true })
    try {
      const boards = await invoke<Whiteboard[]>('get_whiteboards', { projectId })
      console.log(boards);
      set({ whiteboards: boards, loading: false })
      console.log("鑾峰彇鎴愬姛")
    } catch (e: any){
      set({ loading: false })
      console.log(e);
    }
  },

  createWhiteboard: async (projectId: string, name: string, wbType = 'free') => {
    const wb = await invoke<Whiteboard>('create_whiteboard', { projectId, name, wbType })
    set((s) => ({ whiteboards: [...s.whiteboards, wb] }))
    return wb
  },

  deleteWhiteboard: async (id: string) => {
    await invoke('delete_whiteboard', { id })
    set((s) => ({
      whiteboards: s.whiteboards.filter((w) => w.id !== id),
      currentWhiteboard: s.currentWhiteboard?.id === id ? null : s.currentWhiteboard,
    }))
  },

  setCurrentWhiteboard: (wb) => set({ currentWhiteboard: wb }),

  saveSnapshot: async (id: string, snapshot: string) => {
    await invoke('save_whiteboard_snapshot', { id, snapshot })
  },

  renameWhiteboard: async (id: string, name: string) => {
    await invoke('rename_whiteboard', { id, name })
    set((s) => ({
      whiteboards: s.whiteboards.map((w) => (w.id === id ? { ...w, name } : w)),
      currentWhiteboard: s.currentWhiteboard?.id === id ? { ...s.currentWhiteboard, name } : s.currentWhiteboard,
    }))
  },
}))
