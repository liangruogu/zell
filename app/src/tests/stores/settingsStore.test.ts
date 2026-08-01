import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settingsStore'

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useSettingsStore.setState({
    settings: {},
    loading: false,
  })
})

describe('settingsStore', () => {
  describe('loadSettings', () => {
    it('loads all setting keys via invoke', async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
        const key = (args as any)?.key
        if (key === 'ai_providers') return 'provider_data'
        if (key === 'server_url') return 'http://localhost:3000'
        if (key === 'editor_typewriter') return 'true'
        return null
      })

      await useSettingsStore.getState().loadSettings()

      const keys = [
        'ai_providers', 'ai_active_provider', 'server_url', 'appearance',
        'editor_prefs', 'editor_typewriter', 'show_toolbar', 'link_sync_policy', 'custom_css',
      ]
      for (const key of keys) {
        expect(invoke).toHaveBeenCalledWith('get_setting', { key })
      }
      expect(useSettingsStore.getState().loading).toBe(false)
      expect(useSettingsStore.getState().settings['ai_providers']).toBe('provider_data')
      expect(useSettingsStore.getState().settings['server_url']).toBe('http://localhost:3000')
      expect(useSettingsStore.getState().settings['editor_typewriter']).toBe('true')
    })

    it('skips null values', async () => {
      vi.mocked(invoke).mockResolvedValue(null)

      await useSettingsStore.getState().loadSettings()

      expect(useSettingsStore.getState().settings).toEqual({})
    })
  })

  describe('getSetting', () => {
    it('returns setting by key', async () => {
      vi.mocked(invoke).mockImplementation(async (_cmd, args: any) => {
        return args.key === 'ai_providers' ? 'prov_data' : null
      })
      await useSettingsStore.getState().loadSettings()

      const value = useSettingsStore.getState().getSetting('ai_providers')

      expect(value).toBe('prov_data')
    })

    it('returns null for missing key', () => {
      const value = useSettingsStore.getState().getSetting('nonexistent')
      expect(value).toBeNull()
    })
  })

  describe('setSetting', () => {
    it('calls invoke and updates local state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await useSettingsStore.getState().setSetting('server_url', 'http://new.example.com')

      expect(invoke).toHaveBeenCalledWith('set_setting', {
        key: 'server_url',
        value: 'http://new.example.com',
      })
      expect(useSettingsStore.getState().settings['server_url']).toBe('http://new.example.com')
    })

    it('overwrites existing key', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      await useSettingsStore.getState().setSetting('theme', 'light')
      await useSettingsStore.getState().setSetting('theme', 'dark')

      expect(useSettingsStore.getState().settings['theme']).toBe('dark')
    })
  })
})
