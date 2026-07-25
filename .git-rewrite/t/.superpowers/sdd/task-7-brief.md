### Task 7: Rewrite aiService.ts to use AgentRunner

**Files:**
- Rewrite: `app/src/services/aiService.ts`

**Interfaces:**
- Consumes: `runAgent` from `agentRunner.ts`, `createKnowledgeAgentConfig` from `knowledgeAgent.ts`
- Produces: Same external interface 鈥?`sendMessage(userContent)`, `getProviders()`, `getActiveProviderId()`, `testProviderConnection()`

- [ ] **Step 1: Rewrite aiService.ts**

```typescript
// services/aiService.ts
import { useAIStore } from '@/stores/aiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
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
    if (r.ok) return { ok: true, message: '杩炴帴鎴愬姛' }
    const t = await r.text()
    return { ok: false, message: `HTTP ${r.status}: ${t.slice(0, 200)}` }
  } catch (e: any) { return { ok: false, message: `缃戠粶閿欒: ${e.message || String(e)}` } }
}

export async function sendMessage(userContent: string) {
  const store = useAIStore.getState()
  const providers = getProviders()
  if (providers.length === 0) {
    store.addMessage({ role: 'assistant', content: '璇峰厛鍦ㄨ缃腑閰嶇疆 AI 鏈嶅姟銆? })
    return
  }

  const refText = store.selectedText
  const apiContent = refText
    ? `鐢ㄦ埛閫夋嫨浜嗕互涓嬪唴瀹癸細\n"""\n${refText}\n"""\n\n${userContent}`
    : userContent
  const displayContent = refText
    ? `\`\`\`quote\n${refText}\n\`\`\`\n\n${userContent}`
    : userContent

  store.addMessage({ role: 'user', content: displayContent })
  store.setStreaming(true)
  if (refText) store.setSelectedText('')

  // Add placeholder assistant message
  store.addMessage({ role: 'assistant', content: '' })
  const msgIdx = store.messages.length - 1

  const messages = store.messages
    .slice(0, -1) // exclude the placeholder we just added
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'user' ? (m === store.messages[store.messages.length - 2] ? apiContent : m.content) : m.content,
    }))

  const config = createKnowledgeAgentConfig()

  let accumulated = ''

  await runAgent(messages as any, config, {
    onTextDelta(delta) {
      accumulated += delta
      useAIStore.getState().updateMessage(msgIdx, accumulated)
    },
    onToolCall(tc: AgentToolCall) {
      // Update message to show tool call status
      const status = `\n\n馃攳 姝ｅ湪璋冪敤宸ュ叿: \`${tc.toolName}\`...\n`
      useAIStore.getState().updateMessage(msgIdx, accumulated + status)
    },
    onToolResult(tc: AgentToolCall) {
      // Update message after tool result
      const status = `\n鉁?宸ュ叿 \`${tc.toolName}\` 瀹屾垚\n`
      useAIStore.getState().updateMessage(msgIdx, accumulated + status)
    },
    onError(error) {
      useAIStore.getState().updateMessage(msgIdx, accumulated || error)
    },
  })

  if (!accumulated) {
    useAIStore.getState().updateMessage(msgIdx, '(绌哄搷搴?')
  }

  store.setStreaming(false)
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | Select-String "aiService|agentRunner|knowledgeAgent" 
```

Expected: no errors related to these files.

- [ ] **Step 3: Commit**

```bash
git add app/src/services/aiService.ts
git commit -m "refactor: rewrite aiService to use Vercel AI SDK AgentRunner"
```

---


