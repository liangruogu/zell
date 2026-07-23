import { create } from 'zustand'

const STORAGE_OPEN_KEY = 'bindle_ai_open'
const STORAGE_INPUT_KEY = 'bindle_ai_input'

function loadAIOpen(): boolean {
  try { return localStorage.getItem(STORAGE_OPEN_KEY) === '1' } catch { return false }
}

function saveAIOpen(v: boolean) {
  try { localStorage.setItem(STORAGE_OPEN_KEY, v ? '1' : '0') } catch { /* */ }
}

function loadInput(): string {
  try { return localStorage.getItem(STORAGE_INPUT_KEY) || '' } catch { return '' }
}

function saveInput(v: string) {
  try { localStorage.setItem(STORAGE_INPUT_KEY, v) } catch { /* */ }
}

interface AIMessage_ {
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
}

interface AIState {
  isOpen: boolean
  sourceType: 'knowledge' | 'whiteboard' | null
  selectedText: string
  messages: AIMessage_[]
  streaming: boolean

  openPanel: (sourceType: 'knowledge' | 'whiteboard', selectedText?: string) => void
  closePanel: () => void
  setSelectedText: (text: string) => void
  addMessage: (msg: AIMessage_) => void
  updateMessage: (index: number, content: string, reasoningContent?: string) => void
  deleteMessagePair: (index: number) => void
  truncateMessages: (index: number) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
  pendingInput: string
  setPendingInput: (text: string) => void
}

export const useAIStore = create<AIState>((set) => ({
  isOpen: loadAIOpen(),
  sourceType: null,
  selectedText: '',
  messages: [],
  streaming: false,

  openPanel: (sourceType, selectedText) => {
    saveAIOpen(true)
    set((state) => ({
      isOpen: true,
      sourceType,
      selectedText: selectedText !== undefined ? selectedText : state.selectedText,
    }))
  },

  closePanel: () => { saveAIOpen(false); set({ isOpen: false }) },

  setSelectedText: (selectedText: string) => set({ selectedText }),

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateMessage: (index: number, content: string, reasoningContent?: string) =>
    set((state) => ({
      messages: state.messages.map((m, i) =>
        i === index ? { ...m, content, ...(reasoningContent !== undefined ? { reasoningContent } : {}) } : m
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

  pendingInput: loadInput(),
  setPendingInput: (text: string) => { saveInput(text); set({ pendingInput: text }) },
}))
