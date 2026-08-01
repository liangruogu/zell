import { describe, it, expect, beforeEach } from 'vitest'
import { useSidebarStore } from '@/stores/sidebarStore'

beforeEach(() => {
  useSidebarStore.setState({ collapsed: true })
})

describe('sidebarStore', () => {
  describe('toggle', () => {
    it('flips collapsed from true to false', () => {
      useSidebarStore.getState().toggle()
      expect(useSidebarStore.getState().collapsed).toBe(false)
    })

    it('flips collapsed from false to true', () => {
      useSidebarStore.setState({ collapsed: false })
      useSidebarStore.getState().toggle()
      expect(useSidebarStore.getState().collapsed).toBe(true)
    })
  })

  describe('setCollapsed', () => {
    it('sets collapsed to true', () => {
      useSidebarStore.getState().setCollapsed(true)
      expect(useSidebarStore.getState().collapsed).toBe(true)
    })

    it('sets collapsed to false', () => {
      useSidebarStore.getState().setCollapsed(false)
      expect(useSidebarStore.getState().collapsed).toBe(false)
    })
  })
})
