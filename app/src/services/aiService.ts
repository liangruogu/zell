import { useAIStore } from '@/stores/aiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { runAgent, type AgentToolCall } from '@/services/core/agentRunner'
import { createKnowledgeAgentConfig } from '@/services/agents/knowledgeAgent'

export interface AIProvider {
  id: string; name: string; baseUrl: string; apiKey: string; model: string
}

export function getProviders(): AIProvider[] {
  const raw = useSettingsStore.getState().settings['ai_providers']
  try { return raw ? JSON.parse(raw) : [] } catch { return [] }
}

export function getActiveProviderId(): string | null {
  return useSettingsStore.getState().settings['ai_active_provider'] || null
}

export async function testProviderConnection(provider: AIProvider): Promise<{ ok: boolean; message: string }> {
  try {
    const u = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey) h['Authorization'] = `Bearer ${provider.apiKey}`
    const r = await fetch(u, {
      method: 'POST', headers: h,
      body: JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }),
    })
    if (r.ok) return { ok: true, message: '连接成功' }
    const t = await r.text()
    return { ok: false, message: `HTTP ${r.status}: ${t.slice(0, 200)}` }
  } catch (e: any) { return { ok: false, message: `网络错误: ${e.message || String(e)}` } }
}

export async function sendMessage(userContent: string) {
  const providers = getProviders()
  if (providers.length === 0) {
    useAIStore.getState().addMessage({ role: 'assistant', content: '请先在设置中配置 AI 服务。' })
    return
  }

  const refText = useAIStore.getState().selectedText
  const apiContent = refText
    ? `用户选择了以下内容：\n"""\n${refText}\n"""\n\n${userContent}`
    : userContent
  const displayContent = refText
    ? `\`\`\`quote\n${refText}\n\`\`\`\n\n${userContent}`
    : userContent

  useAIStore.getState().addMessage({ role: 'user', content: displayContent })
  useAIStore.getState().setStreaming(true)
  if (refText) useAIStore.getState().setSelectedText('')

  useAIStore.getState().addMessage({ role: 'assistant', content: '' })
  const msgIdx = useAIStore.getState().messages.length - 1

  const storeSnapshot = useAIStore.getState().messages
  const messages = storeSnapshot
    .slice(0, -1)
    .map((m, i) => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'user' && i === storeSnapshot.length - 2 ? apiContent : m.content,
    }))

  const config = createKnowledgeAgentConfig()

  let accumulated = ''

  await runAgent(messages as any, config, {
    onTextDelta(delta) {
      accumulated += delta
      useAIStore.getState().updateMessage(msgIdx, accumulated)
    },
    onToolResult(tc: AgentToolCall) {
      useAIStore.getState().updateMessage(msgIdx, accumulated)
    },
    onError(error) {
      useAIStore.getState().updateMessage(msgIdx, error)
    },
  })

  if (!accumulated) {
    useAIStore.getState().updateMessage(msgIdx, '(没有返回内容)')
  }

  useAIStore.getState().setStreaming(false)
}
