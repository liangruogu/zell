import { create } from 'zustand'

const STORAGE_KEY = 'bindle_sidebar_collapsed'

function loadCollapsed(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v !== null ? v === '1' : true
  } catch { return true }
}

function saveCollapsed(v: boolean) {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch { /* */ }
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
