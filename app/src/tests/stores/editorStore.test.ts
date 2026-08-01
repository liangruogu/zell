import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '@/stores/editorStore'

beforeEach(() => {
  useEditorStore.setState({
    content: '',
    isDirty: false,
    wordCount: 0,
    charCount: 0,
  })
})

describe('editorStore', () => {
  describe('setContent', () => {
    it('updates content and marks dirty', () => {
      useEditorStore.getState().setContent('Hello world')

      expect(useEditorStore.getState().content).toBe('Hello world')
      expect(useEditorStore.getState().isDirty).toBe(true)
    })

    it('computes word count correctly', () => {
      useEditorStore.getState().setContent('one two three four five')

      expect(useEditorStore.getState().wordCount).toBe(5)
    })

    it('computes char count correctly', () => {
      useEditorStore.getState().setContent('abc')

      expect(useEditorStore.getState().charCount).toBe(3)
    })

    it('returns 0 words for empty/whitespace content', () => {
      useEditorStore.getState().setContent('   ')

      expect(useEditorStore.getState().wordCount).toBe(0)
      expect(useEditorStore.getState().charCount).toBe(3)
    })

    it('handles multiple whitespace between words', () => {
      useEditorStore.getState().setContent('hello   world\ttest')

      expect(useEditorStore.getState().wordCount).toBe(3)
    })
  })

  describe('markClean', () => {
    it('resets isDirty to false', () => {
      useEditorStore.getState().setContent('some text')
      expect(useEditorStore.getState().isDirty).toBe(true)

      useEditorStore.getState().markClean()
      expect(useEditorStore.getState().isDirty).toBe(false)
    })

    it('keeps content unchanged', () => {
      useEditorStore.getState().setContent('keep me')
      useEditorStore.getState().markClean()

      expect(useEditorStore.getState().content).toBe('keep me')
    })
  })
})
