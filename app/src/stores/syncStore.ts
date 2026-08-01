import { create } from 'zustand'
import { logger } from '@/lib/logger'

interface SyncState {
  serverUrl: string
  connected: boolean
  serverRunning: boolean
  displayName: string
  readOnly: boolean

  setServerUrl: (url: string) => void
  setConnected: (v: boolean) => void
  setServerRunning: (v: boolean) => void
  setDisplayName: (name: string) => void
  setReadOnly: (v: boolean) => void
  disconnect: () => void
  pullStatus: (projectId: string, token: string, serverUrl: string) => Promise<{ project_status: string; collab_enabled: boolean; member_status: string } | null>
}

export const useSyncStore = create<SyncState>((set) => ({
  serverUrl: localStorage.getItem('zell_server_url') || '',
  connected: false,
  serverRunning: false,
  displayName: '',
  readOnly: false,

  setServerUrl: (url) => {
    localStorage.setItem('zell_server_url', url)
    set({ serverUrl: url })
  },
  setConnected: (v) => set({ connected: v }),
  setServerRunning: (v) => set({ serverRunning: v }),
  setDisplayName: (name) => set({ displayName: name }),
  setReadOnly: (v) => set({ readOnly: v }),
  disconnect: () => set({ connected: false }),

  pullStatus: async (projectId, token, serverUrl) => {
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      return data
    } catch (e) { logger.error('Failed to pull status', e); return null }
  },
}))
