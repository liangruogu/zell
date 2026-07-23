import { streamText, type CoreMessage, type Tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
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

export interface AgentConfig {
  systemPrompt: string
  tools: Record<string, Tool>
  modelId: string
  abortSignal?: AbortSignal
}

function resolveProvider(providerConfig: { baseUrl: string; apiKey: string; model: string }) {
  const { baseUrl, apiKey } = providerConfig
  return createOpenAI({ apiKey: apiKey || 'not-needed', baseURL: baseUrl })
}

export async function runAgent(
  messages: CoreMessage[],
  config: AgentConfig,
  callbacks: AgentStreamCallbacks,
) {
  const providersRaw = useSettingsStore.getState().settings['ai_providers']
  let providers: Array<{ id: string; name: string; baseUrl: string; apiKey: string; model: string }> = []
  try { providers = JSON.parse(providersRaw || '[]') } catch (e) { console.error('[agentRunner] failed to parse providers:', e) }

  const activeId = useSettingsStore.getState().settings['ai_active_provider']
  const provider = activeId
    ? providers.find(p => p.id === activeId) || providers[0]
    : providers[0]

  if (!provider) {
    callbacks.onError?.('请先在设置中配置 AI 服务。')
    return
  }

  const model = resolveProvider(provider)(config.modelId || provider.model)

  try {
    const result = streamText({
      model,
      system: config.systemPrompt,
      messages,
      tools: config.tools,
      maxSteps: 5,
      abortSignal: config.abortSignal,
      onStepFinish: (event) => {
        if (event.toolResults) {
          for (const tr of event.toolResults) {
            callbacks.onToolResult?.({
              toolCallId: tr.toolCallId,
              toolName: tr.toolName,
              args: tr.args as Record<string, unknown>,
              result: tr.result,
            })
          }
        }
      },
    })

    for await (const chunk of result.textStream) {
      callbacks.onTextDelta(chunk)
    }
  } catch (e: any) {
    if (e.name === 'AbortError') return
    let msg = e.message || String(e)
    if (e.responseBody) {
      try { msg += ' | ' + JSON.stringify(JSON.parse(e.responseBody)) } catch { msg += ' | ' + e.responseBody }
    }
    if (e.url) msg += ' | url: ' + e.url
    if (e.statusCode) msg += ' | status: ' + e.statusCode
    console.error('[agentRunner] Full error:', e)
    callbacks.onError?.(`AI 请求失败: ${msg}`)
  }
}
