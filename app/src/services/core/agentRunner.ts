import { useSettingsStore } from '@/stores/settingsStore'

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

interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<string>
}

export interface AgentConfig {
  systemPrompt: string
  tools: ToolDef[]
  modelId: string
  abortSignal?: AbortSignal
}

export async function runAgent(
  messages: Array<{ role: string; content: string; reasoningContent?: string }>,
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

  if (!prov) { callbacks.onError?.('请先在设置中配置 AI 服务。'); return }

  const endpoint = `${prov.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const model = config.modelId || prov.model
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${prov.apiKey}`,
  }

  const apiMessages: any[] = [{ role: 'system', content: config.systemPrompt }]
  for (const m of messages) {
    const msg: any = { role: m.role, content: m.content }
    if (m.role === 'assistant' && m.reasoningContent) {
      msg.reasoning_content = m.reasoningContent
    }
    apiMessages.push(msg)
  }

  let maxSteps = 3
  while (maxSteps-- > 0) {
    if (config.abortSignal?.aborted) return

    const body: any = { model, messages: apiMessages, stream: true }
    if (config.tools.length > 0) {
      body.tools = config.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }))
      body.tool_choice = 'auto'
    }

    const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: config.abortSignal })
    if (!resp.ok) {
      const err = await resp.text()
      callbacks.onError?.(`API ${resp.status}: ${err.slice(0, 200)}`)
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) { callbacks.onError?.('No response body'); return }

    const decoder = new TextDecoder()
    let buf = '', text = ''
    const tcMap = new Map<number, { id: string; name: string; args: string }>()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data: ') || s === 'data: [DONE]') continue
        try {
          const d = JSON.parse(s.slice(6))
          const delta = d.choices?.[0]?.delta
          if (delta?.content) { text += delta.content; callbacks.onTextDelta(delta.content) }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const e = tcMap.get(idx) || { id: '', name: '', args: '' }
              if (tc.id) e.id = tc.id
              if (tc.function?.name) e.name += tc.function.name
              if (tc.function?.arguments) e.args += tc.function.arguments
              tcMap.set(idx, e)
            }
          }
        } catch { /* skip */ }
      }
    }

    const toolCalls = [...tcMap.values()]
    if (toolCalls.length === 0 || config.tools.length === 0) return

    apiMessages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.args },
      })),
    })

    for (const tc of toolCalls) {
      const tool = config.tools.find(t => t.name === tc.name)
      if (!tool) continue
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.args) } catch { /* empty */ }

      const entry: AgentToolCall = { toolCallId: tc.id, toolName: tc.name, args }
      callbacks.onToolCall?.(entry)
      try {
        entry.result = await tool.execute(args)
      } catch (e: any) {
        entry.result = `Error: ${e.message}`
      }
      callbacks.onToolResult?.(entry)
      apiMessages.push({ role: 'tool', content: typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result), tool_call_id: tc.id })
    }
  }
}
