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
  tools: any[]
  modelId: string
  abortSignal?: AbortSignal
}

function buildMessages(systemPrompt: string, messages: CoreMessage[]) {
  const result: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
  ]
  for (const m of messages) {
    if (m.role === 'user') result.push(new HumanMessage(m.content as string))
    else if (m.role === 'assistant') {
      const reasoning = (m as any).reasoningContent
      if (reasoning) {
        result.push(new AIMessage({ content: m.content as string, additional_kwargs: { reasoning_content: reasoning } } as any))
      } else {
        result.push(new AIMessage(m.content as string))
      }
    }
  }
  return result
}

export async function runAgent(
  messages: CoreMessage[],
  config: AgentConfig,
  callbacks: AgentStreamCallbacks,
): Promise<string> {
  const providersRaw = useSettingsStore.getState().settings['ai_providers']
  let providers: Array<{ id: string; name: string; baseUrl: string; apiKey: string; model: string }> = []
  try { providers = JSON.parse(providersRaw || '[]') } catch { /* empty */ }

  const activeId = useSettingsStore.getState().settings['ai_active_provider']
  const prov = activeId
    ? providers.find(p => p.id === activeId) || providers[0]
    : providers[0]

  if (!prov) {
    callbacks.onError?.('请先在设置中配置 AI 服务。')
    return ''
  }

  // Build raw API messages for DeepSeek reasoning_content support
  const rawMessages: any[] = [{ role: 'system', content: config.systemPrompt }]
  for (const m of messages) {
    if (m.role === 'user') {
      rawMessages.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const msg: any = { role: 'assistant', content: m.content }
      const reasoning = (m as any).reasoningContent
      if (reasoning) msg.reasoning_content = reasoning
      rawMessages.push(msg)
    }
  }

  const endpoint = `${prov.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${prov.apiKey}`,
  }

  try {
    // First call: get response or tool calls
    let { text, reasoning, toolCalls } = await streamAndCollect(endpoint, headers, prov.model, rawMessages, config.tools, callbacks, config.abortSignal)
    if (callbacks.onError) return '' // Error already handled

    // Handle tool calls
    if (toolCalls.length > 0 && config.tools.length > 0) {
      rawMessages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls, reasoning_content: reasoning || undefined })

      for (const tc of toolCalls) {
        const entry: AgentToolCall = { toolCallId: tc.id || '', toolName: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') }
        callbacks.onToolCall?.(entry)

        try {
          const matchedTool = config.tools.find((t: any) => t.name === tc.function.name)
          let result = 'Tool not found'
          if (matchedTool) result = await matchedTool.invoke(entry.args)
          entry.result = result
          callbacks.onToolResult?.(entry)
          rawMessages.push({ role: 'tool', content: result, tool_call_id: tc.id })
        } catch (e: any) {
          rawMessages.push({ role: 'tool', content: `Error: ${e.message}`, tool_call_id: tc.id })
        }
      }

      const second = await streamAndCollect(endpoint, headers, prov.model, rawMessages, config.tools, callbacks, config.abortSignal)
      return second.reasoning
    }
    return reasoning
  } catch (e: any) {
    if (e.name === 'AbortError') return ''
    callbacks.onError?.(`请求失败: ${e.message || String(e)}`)
    return ''
  }
}

async function streamAndCollect(
  endpoint: string, headers: Record<string, string>, model: string,
  messages: any[], tools: any[], callbacks: AgentStreamCallbacks, _signal?: AbortSignal,
): Promise<{ text: string; reasoning: string; toolCalls: any[] }> {
  const toolDefs = tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.lc_kwargs?.schema ?? t.schema ?? { type: 'object', properties: {} } },
  }))

  const body: any = { model, messages, stream: true }
  if (toolDefs.length > 0) { body.tools = toolDefs; body.tool_choice = 'auto' }

  const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!resp.ok) {
    const errText = await resp.text()
    callbacks.onError?.(`API ${resp.status}: ${errText.slice(0, 200)}`)
    return { text: '', reasoning: '', toolCalls: [] }
  }

  const reader = resp.body?.getReader()
  if (!reader) { callbacks.onError?.('No response body'); return { text: '', reasoning: '', toolCalls: [] } }

  const decoder = new TextDecoder()
  let buf = '', text = '', reasoning = ''
  const toolCallsMap: Map<number, any> = new Map()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
      try {
        const d = JSON.parse(trimmed.slice(6))
        const delta = d.choices?.[0]?.delta
        if (delta?.reasoning_content) reasoning += delta.reasoning_content
        if (delta?.content) { text += delta.content; callbacks.onTextDelta(delta.content) }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            const existing = toolCallsMap.get(idx) || { id: '', type: 'function', function: { name: '', arguments: '' } }
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.function.name += tc.function.name
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
            toolCallsMap.set(idx, existing)
          }
        }
      } catch { /* skip */ }
    }
  }

  return { text, reasoning, toolCalls: [...toolCallsMap.values()] }
}
