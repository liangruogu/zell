import { create } from 'zustand'

interface SyncState {
  serverUrl: string
  token: string | null
  connected: boolean
  serverRunning: boolean
  displayName: string
  readOnly: boolean

  setServerUrl: (url: string) => void
  setToken: (token: string | null) => void
  setConnected: (v: boolean) => void
  setServerRunning: (v: boolean) => void
  setDisplayName: (name: string) => void
  setReadOnly: (v: boolean) => void
  disconnect: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  serverUrl: localStorage.getItem('zell_server_url') || '',
  token: null,
  connected: false,
  serverRunning: false,
  displayName: '',
  readOnly: false,

  setServerUrl: (url) => {
    localStorage.setItem('zell_server_url', url)
    set({ serverUrl: url })
  },
  setToken: (token) => set({ token }),
  setConnected: (v) => set({ connected: v }),
  setServerRunning: (v) => set({ serverRunning: v }),
  setDisplayName: (name) => set({ displayName: name }),
  setReadOnly: (v) => set({ readOnly: v }),
  disconnect: () => set({ connected: false, token: null }),
}))
