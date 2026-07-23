import { create } from 'zustand'

interface AIState {
  isOpen: boolean
  sourceType: 'knowledge' | 'whiteboard' | null
  selectedText: string
  messages: { role: 'user' | 'assistant'; content: string; reasoningContent?: string }[]
  streaming: boolean

  openPanel: (sourceType: 'knowledge' | 'whiteboard', selectedText?: string) => void
  closePanel: () => void
  setSelectedText: (text: string) => void
  addMessage: (msg: { role: 'user' | 'assistant'; content: string; reasoningContent?: string }) => void
  updateMessage: (index: number, content: string, reasoningContent?: string) => void
  deleteMessagePair: (index: number) => void
  truncateMessages: (index: number) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
}

export const useAIStore = create<AIState>((set) => ({
  isOpen: false,
  sourceType: null,
  selectedText: '',
  messages: [],
  streaming: false,

  openPanel: (sourceType, selectedText) =>
    set((state) => ({
      isOpen: true,
      sourceType,
      selectedText: selectedText !== undefined ? selectedText : state.selectedText,
    })),

  closePanel: () => set({ isOpen: false }),

  setSelectedText: (selectedText: string) => set({ selectedText }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateMessage: (index: number, content: string, reasoningContent?: string) =>
    set((state) => ({
      messages: state.messages.map((m, i) =>
        i === index ? { ...m, content, reasoningContent: reasoningContent ?? m.reasoningContent } : m
      ),
    })),

  deleteMessagePair: (index: number) =>
    set((state) => {
      const msgs = [...state.messages]
      msgs.splice(index, 2)
      return { messages: msgs }
    }),

  truncateMessages: (index: number) =>
    set((state) => ({
      messages: state.messages.slice(0, index),
    })),

  setStreaming: (streaming) => set({ streaming }),

  clearMessages: () => set({ messages: [], streaming: false }),
}))
