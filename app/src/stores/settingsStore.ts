import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

interface SettingsState {
  settings: Record<string, string>
  loading: boolean

  loadSettings: () => Promise<void>
  getSetting: (key: string) => string | null
  setSetting: (key: string, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loading: false,

  loadSettings: async () => {
    set({ loading: true })
    const keys = ['ai_providers', 'ai_active_provider', 'server_url', 'appearance', 'editor_prefs', 'link_sync_policy']
    const result: Record<string, string> = {}
    for (const key of keys) {
      const val = await invoke<string | null>('get_setting', { key })
      if (val) result[key] = val
    }
    set({ settings: result, loading: false })
  },

  getSetting: (key: string) => {
    return get().settings[key] || null
  },

  setSetting: async (key: string, value: string) => {
    await invoke('set_setting', { key, value })
    set((state) => ({ settings: { ...state.settings, [key]: value } }))
  },
}))
