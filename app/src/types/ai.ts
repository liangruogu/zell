export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIChatOptions {
  sourceType: 'knowledge' | 'whiteboard'
  sourceId?: string
  selectedText?: string
}

export interface AIConversation {
  id: string
  project_id: string
  source_type: string
  source_id: string | null
  selected_text: string | null
  messages: string
  created_at: string
  updated_at: string
}
