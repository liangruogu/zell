import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { useSettingsStore } from '@/stores/settingsStore'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'

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

const agentCache = new Map<string, ReturnType<typeof createReactAgent>>()

function getOrCreateAgent(llm: ChatOpenAI, tools: ReturnType<typeof tool>[], systemPrompt: string) {
  const key = systemPrompt.slice(0, 50)
  if (agentCache.has(key)) return agentCache.get(key)!
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: new SystemMessage(systemPrompt),
    checkpointSaver: new MemorySaver(),
  })
  agentCache.set(key, agent)
  return agent
}

export async function runAgent(
  messages: Array<{ role: string; content: string }>,
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

  const llm = new ChatOpenAI({
    model: config.modelId || prov.model,
    apiKey: prov.apiKey || 'not-needed',
    configuration: { baseURL: prov.baseUrl },
    temperature: 0.7,
  })

  const agent = getOrCreateAgent(llm, config.tools, config.systemPrompt)

  const inputMessages = messages.map(m =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
  )

  try {
    const stream = await agent.stream(
      { messages: inputMessages },
      { streamMode: 'messages' }
    )

    for await (const [msg, _] of stream as any) {
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          callbacks.onToolCall?.({ toolCallId: tc.id || '', toolName: tc.name, args: tc.args })
        }
      }
      if (msg.content) {
        const text = typeof msg.content === 'string' ? msg.content : ''
        if (text) callbacks.onTextDelta(text)
      }
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return
    callbacks.onError?.(`请求失败: ${e.message || String(e)}`)
  }
}
