import { create } from 'zustand'

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

interface SyncState {
  status: SyncStatus
  pendingCount: number
  lastSync: string | null
  serverUrl: string | null

  setStatus: (status: SyncStatus) => void
  setPendingCount: (count: number) => void
  setLastSync: (time: string) => void
  setServerUrl: (url: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastSync: null,
  serverUrl: null,

  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSync: (lastSync) => set({ lastSync }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
}))
