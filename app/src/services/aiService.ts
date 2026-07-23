import { useAIStore } from '@/stores/aiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useFileStore } from '@/stores/fileStore'
import { useLinkStore } from '@/stores/linkStore'
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
  const store = useAIStore.getState()
  const project = useProjectStore.getState().currentProject

  // Auto-create conversation if none active
  if (project && !store.activeConversationId) {
    const sourceType = store.sourceType || 'knowledge'
    await useAIStore.getState().createConversation(project.id, sourceType)
  }

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

  // Clear previous error messages before sending
  const allMsgs = useAIStore.getState().messages
  if (allMsgs.some(m => m.role === 'assistant' && (m.content.startsWith('请求失败') || m.content === '(没有返回内容)'))) {
    useAIStore.setState((state: any) => ({
      messages: state.messages.filter((m: any) => {
        if (m.role !== 'assistant') return true
        const c = m.content
        if (c === '(没有返回内容)') return false
        if (c.startsWith('请求失败') || c.startsWith('AI 请求失败')) return false
        return true
      }),
    }))
  }

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
      reasoningContent: (m as any).reasoningContent,
    }))

  const config = createKnowledgeAgentConfig()

  // Pre-inject project context into system prompt to save initial tool calls
  try {
    const project = useProjectStore.getState().currentProject
    if (project) {
      let ctx = `\n\n【当前项目上下文 - 无需调用工具获取】\n项目名称: ${project.name}`
      if (project.background) ctx += `\n项目背景: ${project.background}`
      try {
        const s = JSON.parse(project.settings || '{}')
        if (s.status) ctx += `\n项目状态: ${s.status}`
      } catch { /* */ }
      // Add article list
      const articles = useKnowledgeStore.getState().articles
      if (articles.length > 0) {
        ctx += `\n\n知识库文章 (${articles.length} 篇):`
        for (const a of articles.slice(0, 20)) {
          const preview = (a.content || '').replace(/[#*`\[\]()]/g, '').slice(0, 80)
          ctx += `\n- [${a.title}] ${preview}`
        }
        if (articles.length > 20) ctx += `\n... 共 ${articles.length} 篇`
      }

      // Add external files with descriptions
      const files = useFileStore.getState().files
      if (files.length > 0) {
        ctx += `\n\n外部资源文件 (${files.length} 个):`
        for (const f of files.slice(0, 15)) {
          let desc = ''
          if (f.description) desc = ` — ${f.description}`
          if (f.extracted_text) desc += ` (已提取文本, ${f.extracted_text.length} 字符)`
          ctx += `\n- [${f.original_name}] ${f.file_type} | ID: ${f.id}${desc}`
        }
      }

      // Add external links with sync status
      const links = useLinkStore.getState().links
      if (links.length > 0) {
        ctx += `\n\n外部链接 (${links.length} 个):`
        for (const l of links.slice(0, 15)) {
          let desc = ` — ${l.url}`
          if (l.description) desc += ` | ${l.description}`
          if (l.sync_status === 'synced') desc += ' [已同步]'
          ctx += `\n- [${l.title}] 类型: ${l.link_type} | ID: ${l.id}${desc}`
        }
        if (links.length > 15) ctx += `\n... 共 ${links.length} 个链接`
      }

      config.systemPrompt += ctx
    }
  } catch { /* best effort */ }

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
  // Persist conversation to DB
  useAIStore.getState().saveConversation().catch(() => {})
}
