### Task 3: Integrate Publish tab into ProjectPage

**Files:**
- Modify: `app/src/pages/ProjectPage.tsx`

**Interfaces:**
- Consumes: `PublishSettings` component from Task 2 (at `@/components/project/PublishSettings`)
- Produces: Updated ProjectPage with tabbed settings UI (概览 / 发布)

**Requirements:**
1. Add `import { PublishSettings } from '@/components/project/PublishSettings'` at the top
2. Add tab state: `const [settingsTab, setSettingsTab] = useState<'overview' | 'publish'>('overview')`
3. Replace `<div className="flex-1 overflow-auto p-6 space-y-6">` through the closing `</div>` before `{/* Edit Dialog */}` with a tabbed layout:
   - Left sidebar with two tab buttons (概览 / 发布)
   - Right content area that shows either the existing overview content or `<PublishSettings />`

**New content area structure:**
```tsx
<div className="flex-1 flex min-h-0">
  {/* Left: Settings tabs */}
  <div className="w-36 border-r border-gray-200 p-3 space-y-1 shrink-0">
    <button onClick={() => setSettingsTab('overview')}
      className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
        settingsTab === 'overview' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
      概览
    </button>
    <button onClick={() => setSettingsTab('publish')}
      className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
        settingsTab === 'publish' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
      发布
    </button>
  </div>

  {/* Right: Tab content */}
  <div className="flex-1 overflow-auto">
    {settingsTab === 'overview' ? (
      <div className="p-6 space-y-6">
        {/* EXISTING overview content: 项目信息 Card, 项目背景 Card, 团队协作 Card */}
        {/* Copy-paste from the current file - keep exactly the same */}
      </div>
    ) : (
      <PublishSettings />
    )}
  </div>
</div>
```

**Key points:**
- The overview tab should contain EXACTLY the same content as current (项目信息, 项目背景, 团队协作 cards)
- The publish tab renders `<PublishSettings />`
- The Edit Dialog and Delete Dialog remain unchanged (they're outside the replaced area)
- `Users` and `Copy` icons are already imported in the current file

**Steps:**
1. Read the current file at `app/src/pages/ProjectPage.tsx` to understand the structure
2. Add the import and state
3. Replace the main content area with the tabbed layout, preserving all existing overview content
4. Run `pnpm run lint` (workdir: F:\freeMind\zell\app)
5. Run `npx tsc --noEmit` (workdir: F:\freeMind\zell\app)
6. Commit with message "feat: add publish tab to ProjectPage settings"
