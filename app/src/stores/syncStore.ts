import { create } from 'zustand'

interface SyncState {
  serverUrl: string
  connected: boolean
  serverRunning: boolean
  displayName: string
  readOnly: boolean
  notifications: Array<{ id: string; type: string; data: string; is_read: boolean; created_at: string }> | null

  setServerUrl: (url: string) => void
  setConnected: (v: boolean) => void
  setServerRunning: (v: boolean) => void
  setDisplayName: (name: string) => void
  setReadOnly: (v: boolean) => void
  disconnect: () => void
  pullNotifications: (projectId: string, token: string, serverUrl: string) => Promise<void>
  pullStatus: (projectId: string, token: string, serverUrl: string) => Promise<{ project_status: string; collab_enabled: boolean; member_status: string } | null>
}

export const useSyncStore = create<SyncState>((set) => ({
  serverUrl: localStorage.getItem('zell_server_url') || '',
  connected: false,
  serverRunning: false,
  displayName: '',
  readOnly: false,
  notifications: null,

  setServerUrl: (url) => {
    localStorage.setItem('zell_server_url', url)
    set({ serverUrl: url })
  },
  setConnected: (v) => set({ connected: v }),
  setServerRunning: (v) => set({ serverRunning: v }),
  setDisplayName: (name) => set({ displayName: name }),
  setReadOnly: (v) => set({ readOnly: v }),
  disconnect: () => set({ connected: false }),

  pullNotifications: async (projectId, token, serverUrl) => {
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      set({ notifications: data.notifications || [] })
    } catch { /* ignore */ }
  },

  pullStatus: async (projectId, token, serverUrl) => {
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      return data
    } catch { return null }
  },
}))
