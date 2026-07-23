import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { useSettingsStore } from '@/stores/settingsStore'
import type { CoreMessage } from 'ai'

export interface AgentToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
}

export interface AgentStreamCallbacks {
  onTextDelta: (delta: string) => void
  onToolCall?: (tc: AgentToolCall) => void
  onToolResult?: (tc: AgentToolCall) => void
  onError?: (error: string) => void
}

export interface AgentConfig {
  systemPrompt: string
  tools: any[]  // LangChain StructuredTool[]
  modelId: string
  abortSignal?: AbortSignal
}

function buildMessages(systemPrompt: string, messages: CoreMessage[]) {
  const result: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
  ]
  for (const m of messages) {
    if (m.role === 'user') result.push(new HumanMessage(m.content as string))
    else if (m.role === 'assistant') result.push(new AIMessage(m.content as string))
  }
  return result
}

export async function runAgent(
  messages: CoreMessage[],
  config: AgentConfig,
  callbacks: AgentStreamCallbacks,
) {
  const providersRaw = useSettingsStore.getState().settings['ai_providers']
  let providers: Array<{ id: string; name: string; baseUrl: string; apiKey: string; model: string }> = []
  try { providers = JSON.parse(providersRaw || '[]') } catch { /* empty */ }

  const activeId = useSettingsStore.getState().settings['ai_active_provider']
  const prov = activeId
    ? providers.find(p => p.id === activeId) || providers[0]
    : providers[0]

  if (!prov) {
    callbacks.onError?.('请先在设置中配置 AI 服务。')
    return
  }

  const llm = new ChatOpenAI({
    model: config.modelId || prov.model,
    apiKey: prov.apiKey || 'not-needed',
    configuration: { baseURL: prov.baseUrl },
    temperature: 0.7,
  })

  const llmWithTools = config.tools.length > 0 ? llm.bindTools(config.tools) : llm

  const langMessages = buildMessages(config.systemPrompt, messages)

  try {
    const stream = await llmWithTools.stream(langMessages, {
      signal: config.abortSignal,
    })

    let content = ''
    let toolCalls: any[] = []

    for await (const chunk of stream) {
      if (chunk.content) {
        const text = typeof chunk.content === 'string' ? chunk.content : ''
        if (text) {
          content += text
          callbacks.onTextDelta(text)
        }
      }
      if (chunk.tool_calls && chunk.tool_calls.length > 0) {
        toolCalls = chunk.tool_calls
      }
    }

    if (toolCalls.length > 0 && config.tools.length > 0) {
      langMessages.push(new AIMessage({ content, tool_calls: toolCalls }))

      for (const tc of toolCalls) {
        const entry: AgentToolCall = {
          toolCallId: tc.id || '',
          toolName: tc.name,
          args: tc.args,
        }
        callbacks.onToolCall?.(entry)

        try {
          const matchedTool = config.tools.find((t: any) => t.name === tc.name)
          let result = 'Tool not found'
          if (matchedTool) {
            result = await matchedTool.invoke(tc.args)
          }
          entry.result = result
          callbacks.onToolResult?.(entry)

          langMessages.push(new ToolMessage({
            content: typeof result === 'string' ? result : JSON.stringify(result),
            tool_call_id: tc.id || '',
          }))
        } catch (e: any) {
          langMessages.push(new ToolMessage({
            content: `Error: ${e.message || String(e)}`,
            tool_call_id: tc.id || '',
          }))
        }
      }

      const stream2 = await llmWithTools.stream(langMessages)
      for await (const chunk of stream2) {
        if (chunk.content) {
          const text = typeof chunk.content === 'string' ? chunk.content : ''
          if (text) callbacks.onTextDelta(text)
        }
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return
    callbacks.onError?.(`请求失败: ${e.message || String(e)}`)
  }
}
