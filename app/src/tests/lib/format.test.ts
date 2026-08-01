import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { format } from '@/lib/format'

describe('format', () => {
  describe('date', () => {
    it('formats ISO date in zh-CN locale', () => {
      const result = format.date('2024-06-15T10:30:00Z')
      expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}/)
    })
  })

  describe('dateTime', () => {
    it('formats ISO datetime in zh-CN locale', () => {
      const result = format.dateTime('2024-06-15T10:30:00Z')
      expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}/)
      expect(result).toMatch(/\d{2}:\d{2}/)
    })
  })

  describe('relativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "刚刚" for less than 1 minute ago', () => {
      const result = format.relativeTime('2024-06-15T11:59:30Z')
      expect(result).toBe('刚刚')
    })

    it('returns minutes ago', () => {
      const result = format.relativeTime('2024-06-15T11:55:00Z')
      expect(result).toBe('5 分钟前')
    })

    it('returns hours ago', () => {
      const result = format.relativeTime('2024-06-15T09:00:00Z')
      expect(result).toBe('3 小时前')
    })

    it('returns days ago', () => {
      const result = format.relativeTime('2024-06-10T12:00:00Z')
      expect(result).toBe('5 天前')
    })

    it('falls back to date format for older than 30 days', () => {
      const result = format.relativeTime('2024-01-01T00:00:00Z')
      expect(result).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}$/)
    })
  })

  describe('fileSize', () => {
    it('formats bytes', () => {
      expect(format.fileSize(0)).toBe('0 B')
      expect(format.fileSize(500)).toBe('500 B')
    })

    it('formats KB', () => {
      expect(format.fileSize(1024)).toBe('1.0 KB')
      expect(format.fileSize(1536)).toBe('1.5 KB')
    })

    it('formats MB', () => {
      expect(format.fileSize(1048576)).toBe('1.0 MB')
      expect(format.fileSize(5242880)).toBe('5.0 MB')
    })
  })
})
