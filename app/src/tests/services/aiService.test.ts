import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '@/stores/settingsStore'
import { getProviders, getActiveProviderId, testProviderConnection } from '@/services/aiService'
import type { AIProvider } from '@/services/aiService'

const mockProvider: AIProvider = {
  id: 'p1',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4',
}

beforeEach(() => {
  useSettingsStore.setState({ settings: {}, loading: false })
  vi.unstubAllGlobals()
})

describe('aiService', () => {
  describe('getProviders', () => {
    it('returns empty array when no providers configured', () => {
      expect(getProviders()).toEqual([])
    })

    it('parses and returns providers from settings', () => {
      useSettingsStore.setState({
        settings: { ai_providers: JSON.stringify([mockProvider]) },
      })
      expect(getProviders()).toEqual([mockProvider])
    })

    it('returns empty array on invalid JSON', () => {
      useSettingsStore.setState({
        settings: { ai_providers: 'invalid json' },
      })
      expect(getProviders()).toEqual([])
    })
  })

  describe('getActiveProviderId', () => {
    it('returns null when no active provider set', () => {
      expect(getActiveProviderId()).toBeNull()
    })

    it('returns the active provider id from settings', () => {
      useSettingsStore.setState({
        settings: { ai_active_provider: 'p1' },
      })
      expect(getActiveProviderId()).toBe('p1')
    })

    it('returns null for empty string active provider', () => {
      useSettingsStore.setState({
        settings: { ai_active_provider: '' },
      })
      expect(getActiveProviderId()).toBeNull()
    })
  })

  describe('testProviderConnection', () => {
    it('returns ok on successful connection', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

      const result = await testProviderConnection(mockProvider)
      expect(result.ok).toBe(true)
      expect(result.message).toBe('连接成功')
    })

    it('returns error with status on HTTP failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        }),
      )

      const result = await testProviderConnection(mockProvider)
      expect(result.ok).toBe(false)
      expect(result.message).toContain('401')
    })

    it('returns error on network failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error')),
      )

      const result = await testProviderConnection(mockProvider)
      expect(result.ok).toBe(false)
      expect(result.message).toContain('网络错误')
    })

    it('sends correct request with auth header', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      await testProviderConnection(mockProvider)
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer sk-test',
          }),
          body: expect.stringContaining('gpt-4'),
        }),
      )
    })

    it('omits auth header when apiKey is empty', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      await testProviderConnection({ ...mockProvider, apiKey: '' })
      const callHeaders = fetchMock.mock.calls[0][1].headers
      expect(callHeaders['Authorization']).toBeUndefined()
    })

    it('strips trailing slashes from baseUrl', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      await testProviderConnection({ ...mockProvider, baseUrl: 'https://api.openai.com/v1///' })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.anything(),
      )
    })
  })
})
