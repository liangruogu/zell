### Task 8: Update aiStore and types for tool call support

**Files:**
- Modify: `app/src/stores/aiStore.ts`
- Modify: `app/src/types/ai.ts`

**Interfaces:**
- Produces: `aiStore` keeps existing API + adds streaming state that works with the new Agent
- `types/ai.ts` updated for extended message model

- [ ] **Step 1: Update types/ai.ts**

```typescript
// types/ai.ts
export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolInvocations?: ToolInvocation[]
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  state: 'call' | 'result'
  args?: Record<string, unknown>
  result?: unknown
}

export interface AIChatOptions {
  sourceType: 'knowledge' | 'whiteboard'
  sourceId?: string
  selectedText?: string
}

export interface AIConversation {
  id: string
  project_id: string
  source_type: string
  source_id: string | null
  selected_text: string | null
  messages: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Verify no store changes needed**

The current `aiStore.ts` uses `{ role, content }` messages. The new `aiService.ts` still adds messages in the same format. No store changes required 鈥?`toolInvocations` is optional and can be added later when AIPanel supports rendering them.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/ai.ts
git commit -m "feat: add ToolInvocation types for Agent tool calls"
```

---


