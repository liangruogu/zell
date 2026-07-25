import { create } from 'zustand'

interface SyncState {
  serverUrl: string
  token: string | null
  connected: boolean
  serverRunning: boolean
  displayName: string

  setServerUrl: (url: string) => void
  setToken: (token: string | null) => void
  setConnected: (v: boolean) => void
  setServerRunning: (v: boolean) => void
  setDisplayName: (name: string) => void
  disconnect: () => void
}

export const useSyncStore = create<SyncState>((set) => ({
  serverUrl: localStorage.getItem('bindle_server_url') || '',
  token: null,
  connected: false,
  serverRunning: false,
  displayName: '',

  setServerUrl: (url) => {
    localStorage.setItem('bindle_server_url', url)
    set({ serverUrl: url })
  },
  setToken: (token) => set({ token }),
  setConnected: (v) => set({ connected: v }),
  setServerRunning: (v) => set({ serverRunning: v }),
  setDisplayName: (name) => set({ displayName: name }),
  disconnect: () => set({ connected: false, token: null }),
}))
