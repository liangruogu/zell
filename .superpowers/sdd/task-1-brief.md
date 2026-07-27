### Task 1: Type definitions — PublishSettings

**Files:**
- Modify: `app/src/types/project.ts`

**Interfaces:**
- Produces: `PublishSettings` interface, updated `ProjectSettings` interface

- [ ] **Step 1: Add PublishSettings type and update ProjectSettings**

In `app/src/types/project.ts`, add after the existing `ProjectSettings` interface:

```ts
export interface PublishSettings {
  enabled: boolean
  wiki: string[]   // article IDs
  ppt: string[]    // whiteboard IDs
  ui: string[]     // whiteboard IDs
  mood: string[]   // whiteboard IDs
}
```

Update `ProjectSettings` to include the new field:

```ts
export interface ProjectSettings {
  status?: ProjectStatus
  ai?: {
    text_provider?: string
    text_model?: string
    text_api_key?: string
    image_provider?: string
    image_model?: string
    local_ollama_url?: string
    local_ollama_model?: string
    fallback_to_local?: boolean
  }
  publish?: PublishSettings
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/project.ts
git commit -m "feat: add PublishSettings type to ProjectSettings"
```
