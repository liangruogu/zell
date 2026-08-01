import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAIStore } from '@/stores/aiStore'

const mockConversationMeta = {
  id: 'c1',
  project_id: 'p1',
  title: 'Test Conversation',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockAiConversation = {
  id: 'c1',
  project_id: 'p1',
  source_type: 'knowledge',
  source_id: null,
  selected_text: null,
  messages: JSON.stringify([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ]),
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
  useAIStore.setState({
    isOpen: false,
    sourceType: null,
    selectedText: '',
    messages: [],
    streaming: false,
    pendingInput: '',
    conversations: [],
    activeConversationId: null,
    abortController: null,
  })
})

describe('aiStore', () => {
  describe('pure state actions', () => {
    describe('openPanel', () => {
      it('sets isOpen, sourceType and selectedText', () => {
        useAIStore.getState().openPanel('knowledge', 'selected text')

        expect(useAIStore.getState().isOpen).toBe(true)
        expect(useAIStore.getState().sourceType).toBe('knowledge')
        expect(useAIStore.getState().selectedText).toBe('selected text')
      })
    })

    describe('closePanel', () => {
      it('sets isOpen to false', () => {
        useAIStore.getState().openPanel('whiteboard')
        useAIStore.getState().closePanel()

        expect(useAIStore.getState().isOpen).toBe(false)
      })
    })

    describe('setSelectedText', () => {
      it('updates selectedText', () => {
        useAIStore.getState().setSelectedText('new text')
        expect(useAIStore.getState().selectedText).toBe('new text')
      })
    })

    describe('addMessage', () => {
      it('appends a message', () => {
        useAIStore.getState().addMessage({ role: 'user', content: 'Hello' })
        expect(useAIStore.getState().messages).toHaveLength(1)
        expect(useAIStore.getState().messages[0].role).toBe('user')
      })
    })

    describe('updateMessage', () => {
      it('updates message at index', () => {
        useAIStore.getState().addMessage({ role: 'user', content: 'Hello' })
        useAIStore.getState().updateMessage(0, 'Updated', 'reasoning here')

        expect(useAIStore.getState().messages[0].content).toBe('Updated')
        expect(useAIStore.getState().messages[0].reasoningContent).toBe('reasoning here')
      })
    })

    describe('deleteMessagePair', () => {
      it('removes two messages at index', () => {
        useAIStore.getState().addMessage({ role: 'user', content: 'Q1' })
        useAIStore.getState().addMessage({ role: 'assistant', content: 'A1' })
        useAIStore.getState().addMessage({ role: 'user', content: 'Q2' })
        useAIStore.getState().addMessage({ role: 'assistant', content: 'A2' })

        useAIStore.getState().deleteMessagePair(2)

        expect(useAIStore.getState().messages).toHaveLength(2)
        expect(useAIStore.getState().messages[0].content).toBe('Q1')
      })
    })

    describe('truncateMessages', () => {
      it('keeps messages before index', () => {
        for (let i = 0; i < 4; i++) {
          useAIStore.getState().addMessage({ role: 'user', content: `msg${i}` })
        }

        useAIStore.getState().truncateMessages(2)

        expect(useAIStore.getState().messages).toHaveLength(2)
      })
    })

    describe('setStreaming', () => {
      it('sets streaming flag', () => {
        useAIStore.getState().setStreaming(true)
        expect(useAIStore.getState().streaming).toBe(true)
      })
    })

    describe('clearMessages', () => {
      it('clears messages and stops streaming', () => {
        useAIStore.getState().addMessage({ role: 'user', content: 'Hello' })
        useAIStore.getState().setStreaming(true)

        useAIStore.getState().clearMessages()

        expect(useAIStore.getState().messages).toHaveLength(0)
        expect(useAIStore.getState().streaming).toBe(false)
      })
    })

    describe('setPendingInput', () => {
      it('updates pendingInput', () => {
        useAIStore.getState().setPendingInput('draft text')
        expect(useAIStore.getState().pendingInput).toBe('draft text')
      })
    })

    describe('setAbortController', () => {
      it('sets abortController', () => {
        const ctrl = new AbortController()
        useAIStore.getState().setAbortController(ctrl)
        expect(useAIStore.getState().abortController).toBe(ctrl)
      })

      it('sets abortController to null', () => {
        useAIStore.getState().setAbortController(null)
        expect(useAIStore.getState().abortController).toBeNull()
      })
    })
  })

  describe('loadConversations', () => {
    it('calls invoke and updates conversations', async () => {
      vi.mocked(invoke).mockResolvedValue([mockConversationMeta])

      await useAIStore.getState().loadConversations('p1')

      expect(invoke).toHaveBeenCalledWith('get_ai_conversations', { projectId: 'p1' })
      expect(useAIStore.getState().conversations).toHaveLength(1)
    })

    it('clears activeConversationId if no longer exists', async () => {
      useAIStore.setState({ activeConversationId: 'c-missing' })
      vi.mocked(invoke).mockResolvedValue([mockConversationMeta])

      await useAIStore.getState().loadConversations('p1')

      expect(useAIStore.getState().activeConversationId).toBe('c1')
    })
  })

  describe('createConversation', () => {
    it('calls invoke and sets as active', async () => {
      vi.mocked(invoke).mockResolvedValue(mockConversationMeta)

      const id = await useAIStore.getState().createConversation('p1', 'knowledge')

      expect(invoke).toHaveBeenCalledWith('create_ai_conversation', {
        projectId: 'p1',
        sourceType: 'knowledge',
      })
      expect(useAIStore.getState().activeConversationId).toBe('c1')
      expect(useAIStore.getState().messages).toHaveLength(0)
      expect(id).toBe('c1')
    })
  })

  describe('switchConversation', () => {
    it('loads conversation messages from invoke', async () => {
      useAIStore.setState({ conversations: [mockConversationMeta] })
      vi.mocked(invoke).mockResolvedValue(mockAiConversation)

      await useAIStore.getState().switchConversation('c1')

      expect(invoke).toHaveBeenCalledWith('get_ai_conversation', { id: 'c1' })
      expect(useAIStore.getState().activeConversationId).toBe('c1')
      expect(useAIStore.getState().messages).toHaveLength(2)
    })

    it('does nothing if conversation not found', async () => {
      await useAIStore.getState().switchConversation('missing')
      expect(invoke).not.toHaveBeenCalled()
    })

    it('handles parse error gracefully', async () => {
      useAIStore.setState({ conversations: [mockConversationMeta] })
      vi.mocked(invoke).mockResolvedValue({ ...mockAiConversation, messages: 'invalid json' })

      await useAIStore.getState().switchConversation('c1')

      expect(useAIStore.getState().activeConversationId).toBe('c1')
      expect(useAIStore.getState().messages).toHaveLength(0)
    })
  })

  describe('deleteConversation', () => {
    it('calls invoke and removes from state', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useAIStore.setState({
        conversations: [mockConversationMeta],
        activeConversationId: 'c1',
        messages: [{ role: 'user', content: 'hi' }],
      })

      await useAIStore.getState().deleteConversation('c1')

      expect(invoke).toHaveBeenCalledWith('delete_ai_conversation', { id: 'c1' })
      expect(useAIStore.getState().conversations).toHaveLength(0)
      expect(useAIStore.getState().activeConversationId).toBeNull()
      expect(useAIStore.getState().messages).toHaveLength(0)
    })

    it('picks next conversation as active', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useAIStore.setState({
        conversations: [mockConversationMeta, { ...mockConversationMeta, id: 'c2' }],
        activeConversationId: 'c1',
      })

      await useAIStore.getState().deleteConversation('c1')

      expect(useAIStore.getState().activeConversationId).toBe('c2')
    })
  })

  describe('saveConversation', () => {
    it('calls invoke with messages and title', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      useAIStore.setState({
        activeConversationId: 'c1',
        messages: [{ role: 'user', content: 'What is AI?' }],
      })

      await useAIStore.getState().saveConversation()

      expect(invoke).toHaveBeenCalledWith('save_ai_conversation', {
        id: 'c1',
        messagesJson: JSON.stringify([{ role: 'user', content: 'What is AI?' }]),
        title: 'What is AI?',
      })
    })

    it('does nothing without active conversation', async () => {
      await useAIStore.getState().saveConversation()
      expect(invoke).not.toHaveBeenCalled()
    })
  })
})
