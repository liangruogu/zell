# Bindle Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written SSE AI service with Vercel AI SDK-based Agent that supports stable streaming + tool calling for knowledge base operations.

**Architecture:** Vercel AI SDK `streamText` as the streaming/tool-calling engine, KnowledgeAgent with 6 read-only tools (get_project_context, list_articles, search_knowledge, search_resources, get_article, get_resource), Rust FTS5 indexing extended to knowledge articles.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`), Tauri 2.x Rust (rusqlite FTS5), React 19 + Zustand 5, TypeScript 6.

## Global Constraints

- Must not break existing `ai_providers` / `ai_active_provider` settings format
- Existing `AIPanel` UI structure (Provider dropdown, reference bar, message edit/delete) preserved
- No new Rust dependencies; only existing rusqlite FTS5
- TypeScript: follow existing Zustand store patterns; use `invoke<T>()` for Tauri commands
- CSP must allow fetch to arbitrary AI provider URLs

---

## File Structure

```
app/
├── package.json                                    # Modify: add ai SDK deps
├── src/
│   ├── types/ai.ts                                 # Modify: add ToolCall types
│   ├── lib/constants.ts                            # Modify: add AI error messages
│   ├── services/
│   │   ├── aiService.ts                            # Rewrite: use agentRunner
│   │   └── core/
│   │       └── agentRunner.ts                      # Create: unified Agent runner
│   │   └── agents/
│   │       └── knowledgeAgent.ts                   # Create: KnowledgeAgent config
│   │   └── tools/
│   │       ├── index.ts                            # Create: tool registry
│   │       ├── getProjectContext.ts                # Create
│   │       ├── listArticles.ts                     # Create
│   │       ├── searchKnowledge.ts                  # Create
│   │       ├── searchResources.ts                  # Create
│   │       ├── getArticle.ts                       # Create
│   │       └── getResource.ts                      # Create
│   ├── stores/aiStore.ts                           # Modify: add toolInvocations
│   └── components/editor/AIPanel.tsx               # Modify: tool call UI states
├── src-tauri/
│   ├── tauri.conf.json                             # Modify: relax CSP connect-src
│   └── src/
│       ├── lib.rs                                  # Modify: register 4 new commands
│       ├── commands/
│       │   ├── knowledge.rs                        # Modify: add FTS5 indexing + summaries
│       │   └── resource.rs                         # Modify: add search_knowledge + search_resources + get_resource_content
│       └── db/
│           └── migrations.rs                       # Modify: re-index existing knowledge articles
```

---

### Task 1: Install Vercel AI SDK dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Consumes: none
- Produces: npm packages `ai`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible` available for import

- [ ] **Step 1: Add dependencies to package.json**

Read the current `app/package.json` dependencies, then add:

```json
"ai": "^4.3.0",
"@ai-sdk/openai": "^1.3.0",
"@ai-sdk/openai-compatible": "^0.2.0"
```

- [ ] **Step 2: Install packages**

```bash
cd app && pnpm install
```

- [ ] **Step 3: Verify installation**

```bash
cd app && pnpm ls ai @ai-sdk/openai @ai-sdk/openai-compatible
```

Expected: all three packages listed with versions.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/pnpm-lock.yaml
git commit -m "chore: add vercel ai sdk dependencies"
```

---

### Task 2: Relax CSP for AI provider API calls

**Files:**
- Modify: `app/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: none
- Produces: `connect-src` CSP directive allows fetch to external AI provider URLs

- [ ] **Step 1: Update CSP in tauri.conf.json**

Change the `security.csp` line from:
```
"csp": "default-src 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline'"
```
To:
```
"csp": "default-src 'self'; img-src * data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' http://* https://*"
```

- [ ] **Step 2: Verify syntax**

```bash
cd app && node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'))" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/tauri.conf.json
git commit -m "fix: relax CSP connect-src for AI provider API calls"
```

---

### Task 3: Index knowledge articles in FTS5 + add summaries command

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs`
- Modify: `app/src-tauri/src/commands/resource.rs`
- Modify: `app/src-tauri/src/db/migrations.rs`

**Interfaces:**
- Consumes: `index_document()` from `commands/resource.rs` (already `pub fn`)
- Produces:
  - `get_article_summaries(project_id: String) -> Vec<ArticleSummary>` — Tauri command
  - `ArticleSummary` struct: `{ id, title, preview, updated_at }`
  - Knowledge articles indexed into FTS5 `document_search` on create/update
  - Existing knowledge articles re-indexed on migration

- [ ] **Step 1: Add FTS5 indexing to create_knowledge_article**

In `app/src-tauri/src/commands/knowledge.rs`, after the `INSERT` statement and before returning `Ok(...)`, add:

```rust
// Index in FTS5
let _ = crate::commands::resource::index_document(
    &db, &project_id, "knowledge", &id, &title, &content,
);
```

- [ ] **Step 2: Add FTS5 indexing to update_knowledge_article**

In `app/src-tauri/src/commands/knowledge.rs`, after the `UPDATE` statement and before `drop(conn)`, add:

```rust
let _ = crate::commands::resource::index_document(
    &db, &project_id, "knowledge", &id, &title, &content,
);
```

Note: `project_id` is not directly available in `update_knowledge_article`. First query the article to get `project_id`:

```rust
let project_id: String = conn.query_row(
    "SELECT project_id FROM knowledge_articles WHERE id = ?1",
    rusqlite::params![id],
    |row| row.get(0),
).map_err(|e| e.to_string())?;
```

Then index after update.

- [ ] **Step 3: Add FTS5 cleanup to delete_knowledge_article**

After the soft-delete `UPDATE`, add:

```rust
let _ = crate::commands::resource::delete_document_index(&db, "knowledge", &id);
```

- [ ] **Step 4: Add ArticleSummary struct and get_article_summaries command**

At the top of `knowledge.rs`, add:

```rust
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ArticleSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub updated_at: String,
}
```

Add the command at the bottom of `knowledge.rs`:

```rust
#[tauri::command]
pub fn get_article_summaries(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ArticleSummary>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, updated_at
             FROM knowledge_articles
             WHERE project_id = ?1 AND deleted_at IS NULL
             ORDER BY sort_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let summaries = stmt
        .query_map(rusqlite::params![project_id], |row| {
            let content: String = row.get(2)?;
            // Strip common Markdown markers and truncate to 300 chars
            let plain = content
                .replace('#', " ")
                .replace('*', "")
                .replace('`', "")
                .replace('[', "")
                .replace(']', "")
                .replace('(', "")
                .replace(')', "")
                .replace("___", "")
                .replace("---", "")
                .replace(">", " ");
            let preview: String = plain
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(300)
                .collect();
            Ok(ArticleSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                preview: if preview.len() >= 300 {
                    format!("{}...", preview)
                } else {
                    preview
                },
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(summaries)
}
```

- [ ] **Step 5: Add migration to re-index existing knowledge articles**

In `app/src-tauri/src/db/migrations.rs`, add at the end of `run_migrations` (before `Ok(())`):

```rust
// Migration: re-index existing knowledge articles into FTS5
{
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, content FROM knowledge_articles WHERE deleted_at IS NULL",
    )?;
    let rows: Vec<(String, String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();

    for (id, project_id, title, content) in rows {
        // Delete old entry then insert
        conn.execute(
            "DELETE FROM document_search WHERE source_type='knowledge' AND source_id=?1",
            rusqlite::params![id],
        ).ok();
        conn.execute(
            "INSERT INTO document_search (title, content, source_type, source_id, project_id) VALUES (?1, ?2, 'knowledge', ?3, ?4)",
            rusqlite::params![title, content, id, project_id],
        ).ok();
    }
}
```

- [ ] **Step 6: Verify build**

```bash
cd app/src-tauri && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/src-tauri/src/commands/knowledge.rs app/src-tauri/src/db/migrations.rs
git commit -m "feat: add FTS5 indexing for knowledge articles and get_article_summaries command"
```

---

### Task 4: Add search_knowledge, search_resources, get_resource_content commands

**Files:**
- Modify: `app/src-tauri/src/commands/resource.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Produces (Rust commands):
  - `search_knowledge(project_id: String, query: String, limit: Option<usize>) -> Vec<SearchResult>` — FTS5 search with source_type='knowledge'
  - `search_resources(project_id: String, query: String, limit: Option<usize>) -> Vec<SearchResult>` — FTS5 search with source_type IN ('file','link')
  - `get_resource_content(resource_type: String, id: String) -> ResourceContent` — returns full text
- Produces (structs):
  - `ResourceContent { id: String, name: String, text: String, resource_type: String, url: Option<String> }`

- [ ] **Step 1: Add ResourceContent struct and search_knowledge command**

At the top of `resource.rs`, after the `SearchResult` struct, add:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct ResourceContent {
    pub id: String,
    pub name: String,
    pub text: String,
    pub resource_type: String,
    pub url: Option<String>,
}
```

Add `search_knowledge` command after the `search_documents` command:

```rust
#[tauri::command]
pub fn search_knowledge(
    db: State<'_, Database>,
    project_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(5);
    let mut stmt = conn
        .prepare(
            "SELECT title, snippet(document_search, 2, '<b>', '</b>', '...', 32) as snippet,
                    source_type, source_id, project_id, rank
             FROM document_search
             WHERE document_search MATCH ?1 AND project_id = ?2 AND source_type = 'knowledge'
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![query, project_id, limit as i64], |row| {
            Ok(SearchResult {
                title: row.get(0)?, snippet: row.get(1)?,
                source_type: row.get(2)?, source_id: row.get(3)?,
                project_id: row.get(4)?, rank: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}
```

- [ ] **Step 2: Add search_resources command**

```rust
#[tauri::command]
pub fn search_resources(
    db: State<'_, Database>,
    project_id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(5);
    let mut stmt = conn
        .prepare(
            "SELECT title, snippet(document_search, 2, '<b>', '</b>', '...', 32) as snippet,
                    source_type, source_id, project_id, rank
             FROM document_search
             WHERE document_search MATCH ?1 AND project_id = ?2 AND (source_type = 'file' OR source_type = 'link')
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![query, project_id, limit as i64], |row| {
            Ok(SearchResult {
                title: row.get(0)?, snippet: row.get(1)?,
                source_type: row.get(2)?, source_id: row.get(3)?,
                project_id: row.get(4)?, rank: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}
```

- [ ] **Step 3: Add get_resource_content command**

```rust
#[tauri::command]
pub fn get_resource_content(
    db: State<'_, Database>,
    resource_type: String,
    id: String,
) -> Result<ResourceContent, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    match resource_type.as_str() {
        "file" => {
            let (original_name, extracted_text, file_type) = conn
                .query_row(
                    "SELECT original_name, extracted_text, file_type FROM project_files WHERE id=?1 AND deleted_at IS NULL",
                    params![id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                )
                .map_err(|e| format!("File not found: {}", e))?;
            Ok(ResourceContent {
                id, name: original_name, text: extracted_text,
                resource_type: format!("file/{}", file_type), url: None,
            })
        }
        "link" => {
            let (title, description, last_snapshot, url) = conn
                .query_row(
                    "SELECT title, description, last_snapshot, url FROM external_links WHERE id=?1 AND deleted_at IS NULL",
                    params![id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
                )
                .map_err(|e| format!("Link not found: {}", e))?;
            let text = if let Some(ref snap) = last_snapshot {
                if snap.is_empty() { description } else { snap.clone() }
            } else {
                description
            };
            Ok(ResourceContent {
                id, name: title, text,
                resource_type: "link".into(), url: Some(url),
            })
        }
        _ => Err(format!("Unknown resource type: {}", resource_type)),
    }
}
```

- [ ] **Step 4: Register new commands in lib.rs**

In `app/src-tauri/src/lib.rs`, add to the `invoke_handler`:

```rust
commands::knowledge::get_article_summaries,
commands::resource::search_knowledge,
commands::resource::search_resources,
commands::resource::get_resource_content,
```

- [ ] **Step 5: Verify build**

```bash
cd app/src-tauri && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/src-tauri/src/commands/resource.rs app/src-tauri/src/lib.rs
git commit -m "feat: add search_knowledge, search_resources, get_resource_content commands"
```

---

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
  description: '获取当前项目的基本信息和背景。返回项目名称、背景描述和状态。',
  parameters: z.object({}),
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    let status = '未设置'
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
  description: '列出知识库中所有文章的标题和内容预览。用于快速了解有哪些文档，判断需要深入阅读哪篇。',
  parameters: z.object({}),
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const summaries = await invoke<ArticleSummary[]>('get_article_summaries', { projectId: project.id })
    if (summaries.length === 0) return '知识库中还没有任何文章。'
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
  description: '全文搜索知识库文章内容。根据关键词返回匹配的文章标题和内容片段。适合查找特定主题或概念。',
  parameters: z.object({ query: z.string().describe('搜索关键词') }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_knowledge', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的知识库文章。可以尝试 search_resources 搜索外部资源。'
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
  description: '搜索外部资源（PDF、Word文档、PPT、网页提取文本）的内容。用于查找项目文件中的信息。',
  parameters: z.object({ query: z.string().describe('搜索关键词') }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_resources', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的外部资源。'
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
  description: '获取指定知识库文章的完整 Markdown 内容。需要提供文章 ID（从 list_articles 或 search_knowledge 获取）。',
  parameters: z.object({ id: z.string().describe('文章ID') }),
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
  description: '获取外部资源的完整提取文本。type 为 "file"（项目文件）或 "link"（外部链接），id 从 search_resources 结果获取。',
  parameters: z.object({
    type: z.enum(['file', 'link']).describe('资源类型'),
    id: z.string().describe('资源ID'),
  }),
  execute: async ({ type, id }) => {
    const resource = await invoke<ResourceContent>('get_resource_content', { resourceType: type, id })
    return JSON.stringify({
      name: resource.name,
      text: resource.text || '(无提取文本)',
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

No change needed — `linkStore.ts` `SearchResult` is still used by existing search UI. We import it directly in our tool files.

- [ ] **Step 9: Commit**

```bash
git add app/src/services/tools/
git commit -m "feat: add 6 AI Agent tools for knowledge base operations"
```

---

### Task 6: Create AgentRunner and KnowledgeAgent

**Files:**
- Create: `app/src/services/core/agentRunner.ts`
- Create: `app/src/services/agents/knowledgeAgent.ts`

**Interfaces:**
- Consumes: `knowledgeTools` from `services/tools/index.ts`, `useSettingsStore`, `useProjectStore`
- Produces:
  - `agentRunner.run(messages, agentConfig)` — returns async generator of text deltas + tool call events
  - `knowledgeAgentConfig` — `{ systemPrompt, tools, getProvider }`

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
    callbacks.onError?.('请先在设置中配置 AI 服务。')
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
    callbacks.onError?.(`AI 请求失败: ${e.message || String(e)}`)
  }
}
```

- [ ] **Step 2: Create knowledgeAgent.ts**

```typescript
// services/agents/knowledgeAgent.ts
import type { AgentConfig } from '@/services/core/agentRunner'
import { knowledgeTools } from '@/services/tools'

export const KNOWLEDGE_SYSTEM_PROMPT = `你是一个项目知识库助手，运行在 Bindle 应用中。
你有以下能力：
- 获取项目背景信息（get_project_context）
- 浏览所有文章列表（list_articles）：返回标题和内容预览
- 搜索知识库文章（search_knowledge）：关键词全文搜索
- 搜索外部资源（search_resources）：搜索 PDF、Word、PPT、网页等文件的提取文本
- 读取完整文章内容（get_article）：需要提供文章 ID
- 获取外部资源详细内容（get_resource）：需要提供资源类型和 ID

使用原则：
1. 用户提问时，先用 get_project_context 了解项目背景
2. 需要查找信息时，根据关键词和意图选择 search_knowledge（搜文章）或 search_resources（搜外部文件）
3. 拿到搜索结果后，根据片段判断是否需要 get_article 或 get_resource 获取完整内容
4. 回答时引用具体来源（文章标题、资源名称）
5. 用中文回答，简洁准确
6. 如果找不到相关信息，诚实告知并建议用户补充资料`

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

Expected: no errors related to new files (may have pre-existing errors in other files — ignore those).

- [ ] **Step 4: Commit**

```bash
git add app/src/services/core/ app/src/services/agents/
git commit -m "feat: add AgentRunner and KnowledgeAgent"
```

---

### Task 7: Rewrite aiService.ts to use AgentRunner

**Files:**
- Rewrite: `app/src/services/aiService.ts`

**Interfaces:**
- Consumes: `runAgent` from `agentRunner.ts`, `createKnowledgeAgentConfig` from `knowledgeAgent.ts`
- Produces: Same external interface — `sendMessage(userContent)`, `getProviders()`, `getActiveProviderId()`, `testProviderConnection()`

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
    if (r.ok) return { ok: true, message: '连接成功' }
    const t = await r.text()
    return { ok: false, message: `HTTP ${r.status}: ${t.slice(0, 200)}` }
  } catch (e: any) { return { ok: false, message: `网络错误: ${e.message || String(e)}` } }
}

export async function sendMessage(userContent: string) {
  const store = useAIStore.getState()
  const providers = getProviders()
  if (providers.length === 0) {
    store.addMessage({ role: 'assistant', content: '请先在设置中配置 AI 服务。' })
    return
  }

  const refText = store.selectedText
  const apiContent = refText
    ? `用户选择了以下内容：\n"""\n${refText}\n"""\n\n${userContent}`
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
      const status = `\n\n🔍 正在调用工具: \`${tc.toolName}\`...\n`
      useAIStore.getState().updateMessage(msgIdx, accumulated + status)
    },
    onToolResult(tc: AgentToolCall) {
      // Update message after tool result
      const status = `\n✅ 工具 \`${tc.toolName}\` 完成\n`
      useAIStore.getState().updateMessage(msgIdx, accumulated + status)
    },
    onError(error) {
      useAIStore.getState().updateMessage(msgIdx, accumulated || error)
    },
  })

  if (!accumulated) {
    useAIStore.getState().updateMessage(msgIdx, '(空响应)')
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

The current `aiStore.ts` uses `{ role, content }` messages. The new `aiService.ts` still adds messages in the same format. No store changes required — `toolInvocations` is optional and can be added later when AIPanel supports rendering them.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/ai.ts
git commit -m "feat: add ToolInvocation types for Agent tool calls"
```

---

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
    <span>AI 思考中...</span>
  </div>
)}
```

With:

```tsx
{streaming && (
  <div className="flex items-center gap-2 text-gray-400 text-sm px-1 py-1">
    <Sparkles size={14} className="animate-pulse text-bindle-400" />
    <span>AI 思考中...</span>
  </div>
)}
```

- [ ] **Step 2: Verify AIPanel still works with new aiService**

The `sendMessage` function signature and the aiStore API remain unchanged. No further AIPanel changes needed — the tool status messages are already embedded in the assistant message content as text (e.g., "🔍 正在调用工具: search_knowledge...").

- [ ] **Step 3: Commit**

```bash
git add app/src/components/editor/AIPanel.tsx
git commit -m "feat: enhance AI streaming indicator in AIPanel"
```

---

### Task 10: Integration test — verify build and basic functionality

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Full Rust build check**

```bash
cd app/src-tauri && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 2: Frontend type check**

```bash
cd app && npx tsc --noEmit 2>&1
```

Expected: no new errors from our files.

- [ ] **Step 3: Full Tauri build (dev mode)**

```bash
cd app && pnpm tauri dev 2>&1
```

Manual verification:
1. Open a project, go to Knowledge Base
2. Press `Ctrl+Shift+K` to open AI panel
3. Ask: "这个项目的背景是什么？"
4. Verify: streaming response appears, tool calls show as status text
5. Ask: "帮我搜索关于 XXX 的文章"
6. Verify: AI uses search_knowledge tool, returns relevant results
7. Verify: existing AI settings (Provider config, test connection) still work

- [ ] **Step 4: Commit (if any fixes needed during testing)**

If fixes were needed during testing, commit them.

---

### Task 11: End-to-end verification and cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Verify all tool calls work end-to-end**

Manual test checklist in dev mode:
- [ ] `get_project_context` — AI can tell you project name and background
- [ ] `list_articles` — AI can list existing articles
- [ ] `search_knowledge` — AI can search knowledge base
- [ ] `search_resources` — AI can search external file text
- [ ] `get_article` — AI can read full article content
- [ ] `get_resource` — AI can read full resource text
- [ ] Multi-turn tool use — AI can chain tools (e.g., list → get → answer)
- [ ] Error handling — AI gracefully handles empty results
- [ ] Provider switching — changing AI provider in settings works
- [ ] Abort/stop — closing the panel or sending new message stops the stream

- [ ] **Step 2: Check console for errors**

```bash
cd app && pnpm tauri dev 2>&1 | Select-String "error|Error|ERROR"
```

Expected: no unexpected errors.

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments for Agent integration"
```
