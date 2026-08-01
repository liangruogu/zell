import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageMock } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  const ls = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
    get length() { return Object.keys(store).length },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: ls, configurable: true, writable: true,
  })
  return { localStorageMock: ls }
})

import { useSyncStore } from '@/stores/syncStore'

beforeEach(() => {
  localStorageMock.clear()
  vi.restoreAllMocks()
  useSyncStore.setState({
    serverUrl: '',
    connected: false,
    serverRunning: false,
    displayName: '',
    readOnly: false,
  })
})

describe('syncStore', () => {
  describe('setServerUrl', () => {
    it('updates serverUrl state', () => {
      useSyncStore.getState().setServerUrl('http://localhost:3000')
      expect(useSyncStore.getState().serverUrl).toBe('http://localhost:3000')
    })
  })

  describe('setConnected', () => {
    it('updates connected flag', () => {
      useSyncStore.getState().setConnected(true)
      expect(useSyncStore.getState().connected).toBe(true)
    })
  })

  describe('setServerRunning', () => {
    it('updates serverRunning flag', () => {
      useSyncStore.getState().setServerRunning(true)
      expect(useSyncStore.getState().serverRunning).toBe(true)
    })
  })

  describe('setDisplayName', () => {
    it('updates displayName', () => {
      useSyncStore.getState().setDisplayName('Alice')
      expect(useSyncStore.getState().displayName).toBe('Alice')
    })
  })

  describe('setReadOnly', () => {
    it('updates readOnly flag', () => {
      useSyncStore.getState().setReadOnly(true)
      expect(useSyncStore.getState().readOnly).toBe(true)
    })
  })

  describe('disconnect', () => {
    it('sets connected to false', () => {
      useSyncStore.getState().setConnected(true)
      useSyncStore.getState().disconnect()
      expect(useSyncStore.getState().connected).toBe(false)
    })
  })

  describe('pullStatus', () => {
    it('fetches status and returns data', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ project_status: 'active', collab_enabled: true, member_status: 'online' }),
      })
      globalThis.fetch = fetchMock as any

      const result = await useSyncStore.getState().pullStatus('p1', 'token', 'http://localhost')

      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost/api/v1/projects/p1/status',
        { headers: { Authorization: 'Bearer token' } },
      )
      expect(result?.project_status).toBe('active')
    })

    it('returns null on fetch error', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Offline'))
      globalThis.fetch = fetchMock as any

      const result = await useSyncStore.getState().pullStatus('p1', 'token', 'http://localhost')

      expect(result).toBeNull()
    })
  })
})
