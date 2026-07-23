# External Link Sync & Favicon Design

## Overview

Add web content sync (Markdown snapshots) and automatic favicon fetching to the external links feature. Synced content is stored as Markdown in `last_snapshot` and injected into the AI system prompt for context awareness — the AI retrieves full content via its existing `get_resource` tool (type="link").

## 1. New Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `reqwest` | 0.12 | HTTP client for fetching web pages and favicons |
| `scraper` | 0.21 | HTML parsing for Markdown conversion and favicon resolution |

Features: `reqwest` with `rustls-tls` (no native OpenSSL requirement).

## 2. Favicon Auto-Fetch

### Flow
```
create_external_link()
  → INSERT link record (favicon='')
  → async: GET link.url
  → parse HTML for <link rel="icon">
  → fallback: GET {origin}/favicon.ico
  → download favicon, base64 encode → data:image/...;base64,...
  → UPDATE favicon field
  → return link
```

### Implementation
- `create_external_link` becomes `async fn`
- `reqwest::Client` with 3-second timeout
- Helper: `resolve_favicon(client, url) -> Option<String>` returns base64 data URL or None

### Error Handling
- Network error / timeout / invalid image → return link with empty favicon (non-blocking)

## 3. Link Content Sync

### Command: `sync_link(id: String) -> Result<ExternalLink, String>`

Dispatch based on `link_type`:

| link_type | Strategy | Status |
|-----------|----------|--------|
| `web` | HTTP GET → HTML to Markdown → save as `last_snapshot` | Implement now |
| `github` | Same as web (scrape rendered page) | Implement now |
| `figma` | Figma REST API with token from `ai_skill` | Stub |
| `canva` | Canva API with token | Stub |
| `notion` | Notion API with token | Stub |

### Web/GitHub Sync Flow
1. Read `url` from DB
2. `reqwest` GET with 10-second timeout
3. **HTML to Markdown conversion** via `scraper` DOM walker:
   - Select `<body>` content, skip `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`
   - Map: `<h1>-<h6>` → `# ` headings, `<p>` → paragraphs, `<a>` → `[text](url)`
   - `<strong>/<b>` → `**text**`, `<em>/<i>` → `*text*`
   - `<ul>/<ol>/<li>` → markdown lists, `<img>` → `![alt](src)`
   - `<code>/<pre>` → code blocks, `<blockquote>` → `> ` quotes
   - `<hr>` → `---`, `<br>` → newline
4. Title from `<title>` tag → `# Title` at top
5. Limit output to ~500KB
6. Save to `last_snapshot` column
7. Set `sync_status='synced'`, `last_synced_at=now`
8. Return updated `ExternalLink`

### Stub Types (figma/canva/notion)
- Read token from `ai_skill` field
- No token → `sync_status='error'` with "需要配置 API Token"
- Token present → `sync_status='error'` with "此类型的 API 同步即将支持"

### Error Handling
- Network timeout → `sync_status='error'` with "网络超时"
- HTTP 4xx/5xx → `sync_status='error'` with HTTP status
- Empty body → `sync_status='synced'` with empty snapshot

## 4. AI Context Injection (NOT FTS5)

Synced links are NOT indexed in FTS5. Instead, they are injected into the AI's system prompt so the AI knows they exist and can retrieve full Markdown via `get_resource(type="link", id)`.

### Injection into `aiService.ts`

After the existing file injection block, add link context:
```typescript
// Add external links with sync status
const links = useLinkStore.getState().links
if (links.length > 0) {
  ctx += `\n\n外部链接 (${links.length} 个):`
  for (const l of links.slice(0, 15)) {
    let desc = ` — ${l.url}`
    if (l.description) desc += ` | ${l.description}`
    if (l.sync_status === 'synced') desc += ` (已同步, 可读取内容)`
    ctx += `\n- [${l.title}] ID: ${l.id} ${desc}`
  }
}
```

### AI access flow
1. System prompt lists links with their IDs and sync status
2. AI calls `search_resources` if topic relevant, or directly calls `get_resource({ type: "link", id })` with the ID from the context
3. `get_resource_content` in `resource.rs` already handles `resource_type: "link"` → reads `last_snapshot` → returns Markdown text

## 5. Fix: `get_external_links` Read Sync Fields

Currently hardcodes `sync_status="idle"`, `last_synced_at=None`, `last_snapshot=None`. Fix to SELECT all 14 columns and read actual values.

## 6. Fix: `update_external_link` Support API Config

Add `ai_skill` parameter (used as API token storage). Only write it when link_type is figma/canva/notion.

## 7. Frontend Changes

### 7.1 TypeScript Type Update (`types/share.ts`)
Add `ai_skill: string` to `ExternalLink`. Ensure `sync_status`, `last_synced_at`, `last_snapshot` are present.

### 7.2 Link Store Updates (`stores/linkStore.ts`)
- `createLink`: pass `aiSkill` parameter
- `updateLink`: pass `aiSkill` parameter
- `syncLink`: already exists, backend will now respond

### 7.3 AI Service (`services/aiService.ts`)
- Inject link summaries into system prompt alongside existing file summaries
- Import `useLinkStore` for link access

### 7.4 Link Page UI (`pages/WhiteboardPage.tsx`)
- Link list: show `<img>` from favicon (16x16), show sync status dot (green=synced, red=error, gray=idle)
- Edit form: show "API Token" field when `link_type` is figma/canva/notion
- Sync button visible on all link types

## 8. Tauri Command Registration

Add to `lib.rs`: `commands::link::sync_link`

## 9. Test Verification

1. Create a web link → favicon appears after short delay
2. Click "Sync" on web link → `last_snapshot` populated with Markdown
3. Open AI panel → system prompt includes link summary with ID
4. Ask AI "这个链接讲什么？" → AI calls `get_resource(type="link", id)` → returns Markdown
5. Create figma link → API Token field appears
6. Sync figma link without token → "需要配置 API Token" error
