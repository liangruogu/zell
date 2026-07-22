### Task 9: Update AIPanel for tool call status display

**Files:**
- Modify: `app/src/components/editor/AIPanel.tsx`

**Interfaces:**
- Consumes: `useAIStore` (unchanged API)
- Produces: Visual tool call status indicators during Agent execution

- [ ] **Step 1: Enhance streaming indicator in AIPanel**

In `AIPanel.tsx`, replace the existing streaming indicator (lines 214-218):

```tsx
{streaming && (
  <div className="flex items-center gap-2 text-gray-400 text-sm px-1 py-1">
    <span className="inline-block w-2 h-2 bg-bindle-400 rounded-full animate-pulse" />
    <span>AI 鎬濊€冧腑...</span>
  </div>
)}
```

With:

```tsx
{streaming && (
  <div className="flex items-center gap-2 text-gray-400 text-sm px-1 py-1">
    <Sparkles size={14} className="animate-pulse text-bindle-400" />
    <span>AI 鎬濊€冧腑...</span>
  </div>
)}
```

- [ ] **Step 2: Verify AIPanel still works with new aiService**

The `sendMessage` function signature and the aiStore API remain unchanged. No further AIPanel changes needed 鈥?the tool status messages are already embedded in the assistant message content as text (e.g., "馃攳 姝ｅ湪璋冪敤宸ュ叿: search_knowledge...").

- [ ] **Step 3: Commit**

```bash
git add app/src/components/editor/AIPanel.tsx
git commit -m "feat: enhance AI streaming indicator in AIPanel"
```

---


