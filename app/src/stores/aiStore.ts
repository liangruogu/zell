import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@/lib/logger'

const STORAGE_OPEN_KEY = 'zell_ai_open'
const STORAGE_INPUT_KEY = 'zell_ai_input'

function loadAIOpen(): boolean {
  try { return localStorage.getItem(STORAGE_OPEN_KEY) === '1' } catch (e) { logger.error('Failed to read AI open state', e); return false }
}
function saveAIOpen(v: boolean) {
  try { localStorage.setItem(STORAGE_OPEN_KEY, v ? '1' : '0') } catch (e) { logger.error('Failed to save AI open state', e); /* */ }
}
function loadInput(): string {
  try { return localStorage.getItem(STORAGE_INPUT_KEY) || '' } catch (e) { logger.error('Failed to read AI input', e); return '' }
}
function saveInput(v: string) {
  try { localStorage.setItem(STORAGE_INPUT_KEY, v) } catch (e) { logger.error('Failed to save AI input', e); /* */ }
}

interface AIMessage_ {
  role: 'user' | 'assistant'
  content: string
  reasoningContent?: string
}

interface ConversationMeta {
  id: string
  project_id: string
  title: string
  created_at: string
  updated_at: string
}

interface AiConversation {
  id: string
  project_id: string
  source_type: string
  source_id: string | null
  selected_text: string | null
  messages: string
  created_at: string
  updated_at: string
}

interface AIState {
  isOpen: boolean
  sourceType: 'knowledge' | 'whiteboard' | null
  selectedText: string
  messages: AIMessage_[]
  streaming: boolean
  pendingInput: string

  conversations: ConversationMeta[]
  activeConversationId: string | null

  openPanel: (sourceType: 'knowledge' | 'whiteboard', selectedText?: string) => void
  closePanel: () => void
  setSelectedText: (text: string) => void
  addMessage: (msg: AIMessage_) => void
  updateMessage: (index: number, content: string, reasoningContent?: string) => void
  deleteMessagePair: (index: number) => void
  truncateMessages: (index: number) => void
  setStreaming: (v: boolean) => void
  clearMessages: () => void
  setPendingInput: (text: string) => void

  loadConversations: (projectId: string) => Promise<void>
  createConversation: (projectId: string, sourceType: string) => Promise<string>
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => Promise<void>
  saveConversation: () => Promise<void>
  abortController: AbortController | null
  setAbortController: (ctrl: AbortController | null) => void
}

export const useAIStore = create<AIState>((set, get) => ({
  isOpen: loadAIOpen(),
  sourceType: null,
  selectedText: '',
  messages: [],
  streaming: false,
  pendingInput: loadInput(),

  conversations: [],
  activeConversationId: null,
  abortController: null,

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

  setPendingInput: (text: string) => { saveInput(text); set({ pendingInput: text }) },

  // --- Conversation management ---

  loadConversations: async (projectId: string) => {
    try {
      const convos = await invoke<ConversationMeta[]>('get_ai_conversations', { projectId })
      set((state) => {
        const active = state.activeConversationId
        if (active && !convos.find(c => c.id === active)) {
          // Active conversation was deleted
          return { conversations: convos, activeConversationId: convos[0]?.id || null }
        }
        return { conversations: convos }
      })
    } catch (e) { logger.error('Failed to load conversations', e); /* */ }
  },

  createConversation: async (projectId: string, sourceType: string) => {
    const conv = await invoke<ConversationMeta>('create_ai_conversation', { projectId, sourceType })
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
      messages: [],
    }))
    return conv.id
  },

  switchConversation: async (id: string) => {
    const conv = get().conversations.find(c => c.id === id)
    if (!conv) return
    try {
      const full = await invoke<AiConversation>('get_ai_conversation', { id })
      const msgs = JSON.parse(full.messages || '[]') as AIMessage_[]
      set({ activeConversationId: id, messages: msgs })
    } catch (e) {
      logger.error('Failed to switch conversation', e)
      set({ activeConversationId: id, messages: [] })
    }
  },

  deleteConversation: async (id: string) => {
    await invoke('delete_ai_conversation', { id })
    set((state) => {
      const convos = state.conversations.filter(c => c.id !== id)
      const nextActive = state.activeConversationId === id
        ? (convos[0]?.id || null)
        : state.activeConversationId
      return {
        conversations: convos,
        activeConversationId: nextActive,
        messages: nextActive ? state.messages : [],
      }
    })
  },

  saveConversation: async (title?: string) => {
    const { activeConversationId, messages } = get()
    if (!activeConversationId) return
    const firstUserMsg = messages.find(m => m.role === 'user')?.content || ''
    const t = title || (firstUserMsg.slice(0, 30).replace(/\n/g, ' ') + (firstUserMsg.length > 30 ? '...' : ''))
    await invoke('save_ai_conversation', {
      id: activeConversationId,
      messagesJson: JSON.stringify(messages),
      title: t,
    })
  },

  setAbortController: (ctrl) => set({ abortController: ctrl }),
}))
