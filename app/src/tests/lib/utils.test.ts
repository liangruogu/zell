import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('combines class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('filters falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'inactive')).toBe('base active')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('resolves tailwind conflicts', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })

  it('handles mixed strings and objects', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })

  it('handles arrays of classes', () => {
    expect(cn('base', ['px-4', 'py-2'])).toBe('base px-4 py-2')
  })
})
