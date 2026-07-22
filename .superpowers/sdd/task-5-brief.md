### Task 5: Create tool implementations

**Files:**
- Create: `app/src/services/tools/getProjectContext.ts`
- Create: `app/src/services/tools/listArticles.ts`
- Create: `app/src/services/tools/searchKnowledge.ts`
- Create: `app/src/services/tools/searchResources.ts`
- Create: `app/src/services/tools/getArticle.ts`
- Create: `app/src/services/tools/getResource.ts`
- Create: `app/src/services/tools/index.ts`

**Interfaces:**
- Each file exports an object conforming to Vercel AI SDK `tool()` helper:
  ```typescript
  { description: string, parameters: ZodSchema, execute: (args) => Promise<any> }
  ```
- `index.ts` exports a `knowledgeTools` record: `Record<string, Tool>`
- Each tool calls Tauri `invoke<T>()` for its Rust command
- Consumes: Tauri commands from Tasks 3 and 4

- [ ] **Step 1: Create getProjectContext.ts**

```typescript
// services/tools/getProjectContext.ts
import { tool } from 'ai'
import { z } from 'zod'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types/project'

export const getProjectContext = tool({
  description: '鑾峰彇褰撳墠椤圭洰鐨勫熀鏈俊鎭拰鑳屾櫙銆傝繑鍥為」鐩悕绉般€佽儗鏅弿杩板拰鐘舵€併€?,
  parameters: z.object({}),
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '褰撳墠娌℃湁鎵撳紑鐨勯」鐩€?
    let status = '鏈缃?
    try {
      const s = JSON.parse(project.settings || '{}')
      if (s.status) status = s.status
    } catch { /* ignore */ }
    return JSON.stringify({
      name: project.name,
      description: project.description,
      background: project.background,
      status,
    })
  },
})
```

- [ ] **Step 2: Create listArticles.ts**

```typescript
// services/tools/listArticles.ts
import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface ArticleSummary { id: string; title: string; preview: string; updated_at: string }

export const listArticles = tool({
  description: '鍒楀嚭鐭ヨ瘑搴撲腑鎵€鏈夋枃绔犵殑鏍囬鍜屽唴瀹归瑙堛€傜敤浜庡揩閫熶簡瑙ｆ湁鍝簺鏂囨。锛屽垽鏂渶瑕佹繁鍏ラ槄璇诲摢绡囥€?,
  parameters: z.object({}),
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '褰撳墠娌℃湁鎵撳紑鐨勯」鐩€?
    const summaries = await invoke<ArticleSummary[]>('get_article_summaries', { projectId: project.id })
    if (summaries.length === 0) return '鐭ヨ瘑搴撲腑杩樻病鏈変换浣曟枃绔犮€?
    return JSON.stringify(summaries.map(s => ({
      id: s.id,
      title: s.title,
      preview: s.preview,
      updated_at: s.updated_at,
    })))
  },
})
```

- [ ] **Step 3: Create searchKnowledge.ts**

```typescript
// services/tools/searchKnowledge.ts
import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface SearchResult { title: string; snippet: string; source_type: string; source_id: string; project_id: string; rank: number }

export const searchKnowledge = tool({
  description: '鍏ㄦ枃鎼滅储鐭ヨ瘑搴撴枃绔犲唴瀹广€傛牴鎹叧閿瘝杩斿洖鍖归厤鐨勬枃绔犳爣棰樺拰鍐呭鐗囨銆傞€傚悎鏌ユ壘鐗瑰畾涓婚鎴栨蹇点€?,
  parameters: z.object({ query: z.string().describe('鎼滅储鍏抽敭璇?) }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '褰撳墠娌℃湁鎵撳紑鐨勯」鐩€?
    const results = await invoke<SearchResult[]>('search_knowledge', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '鏈壘鍒板尮閰嶇殑鐭ヨ瘑搴撴枃绔犮€傚彲浠ュ皾璇?search_resources 鎼滅储澶栭儴璧勬簮銆?
    return JSON.stringify(results.map(r => ({
      id: r.source_id,
      title: r.title,
      snippet: r.snippet.replace(/<\/?b>/g, ''),
    })))
  },
})
```

- [ ] **Step 4: Create searchResources.ts**

```typescript
// services/tools/searchResources.ts
import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface SearchResult { title: string; snippet: string; source_type: string; source_id: string; project_id: string; rank: number }

export const searchResources = tool({
  description: '鎼滅储澶栭儴璧勬簮锛圥DF銆乄ord鏂囨。銆丳PT銆佺綉椤垫彁鍙栨枃鏈級鐨勫唴瀹广€傜敤浜庢煡鎵鹃」鐩枃浠朵腑鐨勪俊鎭€?,
  parameters: z.object({ query: z.string().describe('鎼滅储鍏抽敭璇?) }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '褰撳墠娌℃湁鎵撳紑鐨勯」鐩€?
    const results = await invoke<SearchResult[]>('search_resources', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '鏈壘鍒板尮閰嶇殑澶栭儴璧勬簮銆?
    return JSON.stringify(results.map(r => ({
      id: r.source_id,
      name: r.title,
      type: r.source_type,
      snippet: r.snippet.replace(/<\/?b>/g, ''),
    })))
  },
})
```

- [ ] **Step 5: Create getArticle.ts**

```typescript
// services/tools/getArticle.ts
import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'

interface KnowledgeArticle { id: string; project_id: string; title: string; content: string; content_json: string; parent_id: string | null; sort_order: number; created_at: string; updated_at: string; deleted_at: string | null }

export const getArticle = tool({
  description: '鑾峰彇鎸囧畾鐭ヨ瘑搴撴枃绔犵殑瀹屾暣 Markdown 鍐呭銆傞渶瑕佹彁渚涙枃绔?ID锛堜粠 list_articles 鎴?search_knowledge 鑾峰彇锛夈€?,
  parameters: z.object({ id: z.string().describe('鏂囩珷ID') }),
  execute: async ({ id }) => {
    const article = await invoke<KnowledgeArticle>('get_knowledge_article', { id })
    return JSON.stringify({
      title: article.title,
      content: article.content,
      updated_at: article.updated_at,
    })
  },
})
```

- [ ] **Step 6: Create getResource.ts**

```typescript
// services/tools/getResource.ts
import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'

interface ResourceContent { id: string; name: string; text: string; resource_type: string; url: string | null }

export const getResource = tool({
  description: '鑾峰彇澶栭儴璧勬簮鐨勫畬鏁存彁鍙栨枃鏈€倀ype 涓?"file"锛堥」鐩枃浠讹級鎴?"link"锛堝閮ㄩ摼鎺ワ級锛宨d 浠?search_resources 缁撴灉鑾峰彇銆?,
  parameters: z.object({
    type: z.enum(['file', 'link']).describe('璧勬簮绫诲瀷'),
    id: z.string().describe('璧勬簮ID'),
  }),
  execute: async ({ type, id }) => {
    const resource = await invoke<ResourceContent>('get_resource_content', { resourceType: type, id })
    return JSON.stringify({
      name: resource.name,
      text: resource.text || '(鏃犳彁鍙栨枃鏈?',
      type: resource.resource_type,
      url: resource.url,
    })
  },
})
```

- [ ] **Step 7: Create tools/index.ts**

```typescript
// services/tools/index.ts
import { getProjectContext } from './getProjectContext'
import { listArticles } from './listArticles'
import { searchKnowledge } from './searchKnowledge'
import { searchResources } from './searchResources'
import { getArticle } from './getArticle'
import { getResource } from './getResource'

export const knowledgeTools = {
  get_project_context: getProjectContext,
  list_articles: listArticles,
  search_knowledge: searchKnowledge,
  search_resources: searchResources,
  get_article: getArticle,
  get_resource: getResource,
}
```

- [ ] **Step 8: Cleanup: remove old SearchResult import from linkStore if not used elsewhere**

No change needed 鈥?`linkStore.ts` `SearchResult` is still used by existing search UI. We import it directly in our tool files.

- [ ] **Step 9: Commit**

```bash
git add app/src/services/tools/
git commit -m "feat: add 6 AI Agent tools for knowledge base operations"
```

---


