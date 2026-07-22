### Task 6: Create AgentRunner and KnowledgeAgent

**Files:**
- Create: `app/src/services/core/agentRunner.ts`
- Create: `app/src/services/agents/knowledgeAgent.ts`

**Interfaces:**
- Consumes: `knowledgeTools` from `services/tools/index.ts`, `useSettingsStore`, `useProjectStore`
- Produces:
  - `agentRunner.run(messages, agentConfig)` 鈥?returns async generator of text deltas + tool call events
  - `knowledgeAgentConfig` 鈥?`{ systemPrompt, tools, getProvider }`

- [ ] **Step 1: Create agentRunner.ts**

```typescript
// services/core/agentRunner.ts
import { streamText, type CoreMessage, type ToolSet } from 'ai'
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
  tools: ToolSet
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
    callbacks.onError?.('璇峰厛鍦ㄨ缃腑閰嶇疆 AI 鏈嶅姟銆?)
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
          for (const [i, tr] of event.toolResults.entries()) {
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
    callbacks.onError?.(`AI 璇锋眰澶辫触: ${e.message || String(e)}`)
  }
}
```

- [ ] **Step 2: Create knowledgeAgent.ts**

```typescript
// services/agents/knowledgeAgent.ts
import type { AgentConfig } from '@/services/core/agentRunner'
import { knowledgeTools } from '@/services/tools'

export const KNOWLEDGE_SYSTEM_PROMPT = `浣犳槸涓€涓」鐩煡璇嗗簱鍔╂墜锛岃繍琛屽湪 Bindle 搴旂敤涓€?浣犳湁浠ヤ笅鑳藉姏锛?- 鑾峰彇椤圭洰鑳屾櫙淇℃伅锛坓et_project_context锛?- 娴忚鎵€鏈夋枃绔犲垪琛紙list_articles锛夛細杩斿洖鏍囬鍜屽唴瀹归瑙?- 鎼滅储鐭ヨ瘑搴撴枃绔狅紙search_knowledge锛夛細鍏抽敭璇嶅叏鏂囨悳绱?- 鎼滅储澶栭儴璧勬簮锛坰earch_resources锛夛細鎼滅储 PDF銆乄ord銆丳PT銆佺綉椤电瓑鏂囦欢鐨勬彁鍙栨枃鏈?- 璇诲彇瀹屾暣鏂囩珷鍐呭锛坓et_article锛夛細闇€瑕佹彁渚涙枃绔?ID
- 鑾峰彇澶栭儴璧勬簮璇︾粏鍐呭锛坓et_resource锛夛細闇€瑕佹彁渚涜祫婧愮被鍨嬪拰 ID

浣跨敤鍘熷垯锛?1. 鐢ㄦ埛鎻愰棶鏃讹紝鍏堢敤 get_project_context 浜嗚В椤圭洰鑳屾櫙
2. 闇€瑕佹煡鎵句俊鎭椂锛屾牴鎹叧閿瘝鍜屾剰鍥鹃€夋嫨 search_knowledge锛堟悳鏂囩珷锛夋垨 search_resources锛堟悳澶栭儴鏂囦欢锛?3. 鎷垮埌鎼滅储缁撴灉鍚庯紝鏍规嵁鐗囨鍒ゆ柇鏄惁闇€瑕?get_article 鎴?get_resource 鑾峰彇瀹屾暣鍐呭
4. 鍥炵瓟鏃跺紩鐢ㄥ叿浣撴潵婧愶紙鏂囩珷鏍囬銆佽祫婧愬悕绉帮級
5. 鐢ㄤ腑鏂囧洖绛旓紝绠€娲佸噯纭?6. 濡傛灉鎵句笉鍒扮浉鍏充俊鎭紝璇氬疄鍛婄煡骞跺缓璁敤鎴疯ˉ鍏呰祫鏂檂

export function createKnowledgeAgentConfig(modelId?: string): AgentConfig {
  return {
    systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
    tools: knowledgeTools,
    modelId: modelId || '',
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -50
```

Expected: no errors related to new files (may have pre-existing errors in other files 鈥?ignore those).

- [ ] **Step 4: Commit**

```bash
git add app/src/services/core/ app/src/services/agents/
git commit -m "feat: add AgentRunner and KnowledgeAgent"
```

---


