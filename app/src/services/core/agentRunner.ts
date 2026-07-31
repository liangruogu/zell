import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { useSettingsStore } from '@/stores/settingsStore'
import { logger } from '@/lib/logger'

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
  tools: ReturnType<typeof tool>[]
  modelId: string
  abortSignal?: AbortSignal
}

export async function runAgent(
  messages: Array<{ role: string; content: string }>,
  config: AgentConfig,
  callbacks: AgentStreamCallbacks,
) {
  const providersRaw = useSettingsStore.getState().settings['ai_providers']
  let providers: Array<{ id: string; name: string; baseUrl: string; apiKey: string; model: string }> = []
  try { providers = JSON.parse(providersRaw || '[]') } catch (e) { logger.error('Failed to parse AI providers', e) }

  const activeId = useSettingsStore.getState().settings['ai_active_provider']
  const prov = activeId
    ? providers.find(p => p.id === activeId) || providers[0]
    : providers[0]

  if (!prov) { callbacks.onError?.('请先在设置中配置 AI 服务。'); return }

  const llm = new ChatOpenAI({
    model: config.modelId || prov.model,
    apiKey: prov.apiKey || 'not-needed',
    configuration: { baseURL: prov.baseUrl },
    temperature: 0.7,
    streaming: true,
  })

  const llmWithTools = config.tools.length > 0 ? llm.bindTools(config.tools) : llm

  const langMessages: (SystemMessage | HumanMessage | AIMessage)[] = [
    new SystemMessage(config.systemPrompt),
    ...messages.map(m =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
  ]

  let maxRounds = 5
  while (maxRounds-- > 0) {
    if (config.abortSignal?.aborted) return

    try {
      const stream = await llmWithTools.stream(langMessages, {
        signal: config.abortSignal,
      } as any)

      let content = ''
      let toolCalls: any[] = []
      const tcBuf: Map<number, any> = new Map()

      for await (const chunk of stream) {
        // Handle text content
        const text = getChunkText(chunk)
        if (text) {
          content += text
          callbacks.onTextDelta(text)
        }

        // Handle tool calls
        if ((chunk as any).tool_call_chunks?.length) {
          for (const tcc of (chunk as any).tool_call_chunks) {
            const idx = tcc.index ?? 0
            const existing = tcBuf.get(idx) || { id: '', name: '', args: '' }
            if (tcc.id) existing.id = tcc.id
            if (tcc.name) existing.name += tcc.name
            if (tcc.args) existing.args += tcc.args
            tcBuf.set(idx, existing)
          }
        }
      }

      // Convert buffered tool calls
      toolCalls = [...tcBuf.values()].filter((tc: any) => tc.id).map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args },
        name: tc.name,
        args: tc.args ? JSON.parse(tc.args) : {},
      }))

      if (toolCalls.length === 0) return // No more tool calls, done

      // Add assistant message with tool calls
      langMessages.push(new AIMessage({
        content: content || '',
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          args: typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : tc.args,
        })),
      }))

      // Execute tools
      for (const tc of toolCalls) {
        const entry: AgentToolCall = { toolCallId: tc.id, toolName: tc.name, args: tc.args }
        callbacks.onToolCall?.(entry)

        try {
          const matchedTool = config.tools.find(t => t.name === tc.name)
          entry.result = matchedTool ? await matchedTool.invoke(tc.args) : 'Tool not found'
        } catch (e: any) {
          logger.error('Tool execution failed', e)
          entry.result = `Error: ${e.message}`
        }
        callbacks.onToolResult?.(entry)

        langMessages.push({
          role: 'tool' as any,
          content: typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result),
          tool_call_id: tc.id,
          name: tc.name,
        } as any)
      }
    } catch (e: any) {
      logger.error('Agent run failed', e)
      if (e.name === 'AbortError') return
      callbacks.onError?.(`请求失败: ${e.message || String(e)}`)
      return
    }
  }
}

function getChunkText(chunk: AIMessageChunk): string {
  if (typeof chunk.content === 'string') return chunk.content
  if (Array.isArray(chunk.content)) {
    return chunk.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
  }
  return ''
}
