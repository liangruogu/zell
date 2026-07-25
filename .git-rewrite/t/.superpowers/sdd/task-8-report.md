### Task 8 — Complete: AI types updated for tool call support

**Commit:** `ebc878c`

**Changes:**
- `app/src/types/ai.ts` — added `ToolInvocation` interface and extended `AIMessage` with optional `toolInvocations` field.
- No store changes were needed; `aiStore.ts` continues to work with `{ role, content }` messages as before.

**Diff:**
```diff
+  toolInvocations?: ToolInvocation[]
+
+export interface ToolInvocation {
+  toolCallId: string
+  toolName: string
+  state: 'call' | 'result'
+  args?: Record<string, unknown>
+  result?: unknown
+}
```
