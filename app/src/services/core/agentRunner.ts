import { streamText, type CoreMessage, type Tool } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
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
  if (baseUrl.includes('openai.com') || baseUrl.includes('api.openai.com')) {
    return createOpenAI({ apiKey, baseURL: baseUrl })
  }
  return createOpenAICompatible({
    name: 'custom',
    baseURL: baseUrl,
    apiKey: apiKey || 'not-needed',
  })
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
    callbacks.onError?.(`AI 请求失败: ${e.message || String(e)}`)
  }
}
