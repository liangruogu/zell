import { create } from 'zustand'

interface EditorState {
  content: string
  isDirty: boolean
  wordCount: number
  charCount: number

  setContent: (content: string) => void
  markClean: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  content: '',
  isDirty: false,
  wordCount: 0,
  charCount: 0,

  setContent: (content: string) =>
    set({
      content,
      isDirty: true,
      charCount: content.length,
      wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    }),

  markClean: () => set({ isDirty: false }),
}))
