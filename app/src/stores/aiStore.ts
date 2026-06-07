import { create } from 'zustand'

interface AIState {
  isOpen: boolean
  sourceType: 'knowledge' | 'whiteboard' | null
  selectedText: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  streaming: boolean

  openPanel: (sourceType: 'knowledge' | 'whiteboard', selectedText?: string) => void
  closePanel: () => void
  addMessage: (msg: { role: 'user' | 'assistant'; content: string }) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
}

export const useAIStore = create<AIState>((set) => ({
  isOpen: false,
  sourceType: null,
  selectedText: '',
  messages: [],
  streaming: false,

  openPanel: (sourceType, selectedText = '') =>
    set({ isOpen: true, sourceType, selectedText }),

  closePanel: () => set({ isOpen: false }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  setStreaming: (streaming) => set({ streaming }),

  clearMessages: () => set({ messages: [] }),
}))
