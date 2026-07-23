# External Link Sync & Favicon Design

## Overview

Add web content sync (Markdown snapshots) and automatic favicon fetching to the external links feature. Users can optionally configure a firecrawl API key for high-quality Markdown extraction; without it, the app falls back to direct HTTP scraping + built-in HTML-to-Markdown conversion.

Synced Markdown is stored in `last_snapshot` and injected into the AI system prompt. The AI retrieves full content via its existing `get_resource` tool (type="link").

## 1. New Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `reqwest` | 0.12 | HTTP client (web fetch, favicon, firecrawl API) |
| `scraper` | 0.21 | HTML parsing for fallback extraction and favicon resolution |
| `serde_json` | already present | Parse firecrawl JSON response |

Features: `reqwest` with `rustls-tls`.

## 2. Web Content Sync

### 2.1 Two-tier strategy (user chooses)

| Tier | Method | Quality | Requirement |
|------|--------|---------|-------------|
| 1 | firecrawl API (`POST api.firecrawl.dev/v1/scrape`) | Clean Markdown, handles SPAs | firecrawl API key in settings |
| 2 (fallback) | Direct HTTP GET + built-in HTML-to-Markdown converter | Basic Markdown, static pages only | None |

### 2.2 Command: `sync_link(id: String) -> Result<ExternalLink, String>`

1. Read link from DB (url, link_type, ai_skill)
2. Read firecrawl API key from `settings` table (key: `firecrawl_api_key`)
3. Dispatch by link_type:

#### web / github
```
if firecrawl_key exists:
  POST https://api.firecrawl.dev/v1/scrape
    body: { url, formats: ["markdown"] }
     → extract markdown from response
     → save as last_snapshot
else (fallback):
  GET url → HTML body
  → built-in HTML-to-Markdown converter (scraper DOM walker)
  → save as last_snapshot
```

#### figma / canva / notion
```
if token (from ai_skill field):
  → stub: "此类型的 API 同步即将支持"
else:
  → "需要配置 API Token"
```

### 2.3 Built-in HTML-to-Markdown converter (fallback)

DOM walker using `scraper`:
- `<title>` → `# Title` at document top
- `<h1>-<h6>` → `# `-`###### ` headings
- `<p>` → paragraphs, `<br>` → newline
- `<a>` → `[text](url)`
- `<strong>/<b>` → `**text**`, `<em>/<i>` → `*text*`
- `<ul>/<ol>/<li>` → markdown lists
- `<img>` → `![alt](src)`
- `<code>` → inline code, `<pre>` → fenced code block
- `<blockquote>` → `> ` quotes
- `<hr>` → `---`
- Strip: `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`
- Output limited to ~500KB

### 2.4 Sync result
- Success → `sync_status='synced'`, `last_synced_at=now`, `last_snapshot=<markdown>`
- Error → `sync_status='error'`, store error message with specific reason
- Timeout: 15 seconds for firecrawl, 10 seconds for direct fetch

## 3. Favicon Auto-Fetch

### Flow
```
create_external_link()
  → INSERT link record (favicon='')
  → async: GET link.url
  → parse HTML for <link rel="icon"> / <link rel="shortcut icon">
  → fallback: GET {origin}/favicon.ico
  → download favicon, base64 encode → data:image/...;base64,...
  → UPDATE favicon field
  → return link
```

- `create_external_link` becomes `async fn`
- 3-second timeout per request
- Failure → return link with empty favicon (non-blocking)

## 4. AI Context Injection

Synced links are NOT indexed in FTS5. They are injected into the AI system prompt alongside existing file summaries.

### aiService.ts changes
```
import { useLinkStore } from '@/stores/linkStore'

// After file injection block:
const links = useLinkStore.getState().links
if (links.length > 0) {
  ctx += `\n\n外部链接 (${links.length} 个):`
  for (const l of links.slice(0, 15)) {
    let desc = ` — ${l.url}`
    if (l.description) desc += ` | ${l.description}`
    if (l.sync_status === 'synced') desc += ' [已同步]'
    ctx += `\n- [${l.title}] 类型: ${l.link_type} | ID: ${l.id}${desc}`
  }
}
```

AI retrieves full Markdown via: `get_resource({ type: "link", id: "..." })` → `resource.rs` already handles this.

## 5. Fix: `get_external_links` Read Sync Fields

SELECT all 14 columns. Currently hardcodes `sync_status="idle"`, `last_synced_at=None`, `last_snapshot=None`.

## 6. Settings: firecrawl API key

New setting key `firecrawl_api_key` — stored in the `settings` table. Read at sync time. UI: add a settings field in the AI/settings page (or a simple config section).

## 7. Frontend Changes

### 7.1 TypeScript Type (`types/share.ts`)
Add `ai_skill: string` to `ExternalLink`.

### 7.2 Link Store (`stores/linkStore.ts`)
- `createLink`: pass `aiSkill` parameter
- `updateLink`: pass `aiSkill` parameter
- `syncLink`: already exists, backend now responds

### 7.3 AI Service (`services/aiService.ts`)
- Import `useLinkStore`
- Inject link summaries into system prompt

### 7.4 Link Page UI (`pages/WhiteboardPage.tsx`)
- Link list items: favicon `<img src={l.favicon}>` (16x16), sync status dot
- Edit form: API Token field (visible when link_type is figma/canva/notion)
- Sync button on all link types, triggers sync

## 8. Rust Code Structure

| File | Change |
|------|--------|
| `commands/link.rs` | `create_external_link` → async + favicon; new `sync_link` command |
| `commands/link.rs` or new `html2md.rs` | Built-in HTML-to-Markdown converter |
| `db/models.rs` | `ExternalLink.snapshot` already `Option<String>` (no change) |
| `lib.rs` | Register `sync_link` |
| `Cargo.toml` | Add `reqwest`, `scraper` |

## 9. Test Verification

1. Create a web link → favicon appears after short delay
2. Sync link without firecrawl key → uses fallback HTML-to-MD, `last_snapshot` populated
3. Configure firecrawl key → sync → clean Markdown in `last_snapshot`
4. Open AI panel → system prompt includes link with ID + "[已同步]" tag
5. Ask AI "这个链接讲什么？" → AI calls `get_resource(type="link", id)` → returns Markdown
6. Create figma link → API Token field appears in form
7. Sync figma link without token → "需要配置 API Token"
