## Task 7 Report: Rewrite aiService.ts to use AgentRunner

**Status:** Done

**Commit:** `c83ecc6` — `refactor: rewrite aiService to use Vercel AI SDK AgentRunner`

**TSC Check Summary:**
- `aiService.ts`: 0 errors
- `agentRunner.ts`: 4 pre-existing errors (TS2339 on `toolCallId`, `toolName`, `args`, `result` — TypeScript 6.0.3 narrows `event.toolResults` to `never`, unrelated to this task)
- No other files affected

**Changes:**
- Removed all hand-rolled SSE logic (SYSTEM_PROMPT, TOOLS, searchDocs, StreamState, fetch+reader loop)
- Removed unused imports (`invoke`, `SearchResult`, `useProjectStore`)
- `sendMessage()` now calls `runAgent()` with `createKnowledgeAgentConfig()` and streaming callbacks
- `getProviders()`, `getActiveProviderId()`, `testProviderConnection()`, `AIProvider` interface — unchanged
- External API preserved: `AIPanel.tsx` and `SettingsDialog.tsx` imports unchanged

**Concern:**
`agentRunner.ts` defines `onToolCall` in `AgentStreamCallbacks` interface but never invokes it inside `runAgent()`. Only `onStepFinish` → `onToolResult` is wired up. This means the `onToolCall` handler in `sendMessage()` (showing "正在调用工具" status) will never fire. Tool results will still display via `onToolResult` after each step completes. This is a pre-existing issue in `agentRunner.ts`, not introduced by this task.
