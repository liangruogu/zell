import { create } from 'zustand'
import { logger } from '@/lib/logger'

const STORAGE_KEY = 'zell_sidebar_collapsed'

function loadCollapsed(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v !== null ? v === '1' : true
  } catch (e) { logger.error('Failed to read sidebar collapsed state', e); return true }
}

function saveCollapsed(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch (e) { logger.error('Failed to save sidebar collapsed state', e); /* */ }
}

interface SidebarState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: loadCollapsed(),
  toggle: () => set((s) => {
    saveCollapsed(!s.collapsed)
    return { collapsed: !s.collapsed }
  }),
  setCollapsed: (v) => { saveCollapsed(v); set({ collapsed: v }) },
}))
