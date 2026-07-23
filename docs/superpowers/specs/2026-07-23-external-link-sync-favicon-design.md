# External Link Sync & Favicon Design

## Overview

Add web content sync (full-text indexable snapshots) and automatic favicon fetching to the external links feature. Different link types (web, github, figma, canva, notion) get type-specific sync strategies and form fields.

## 1. New Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| `reqwest` | 0.12 | HTTP client for fetching web pages and favicons |
| `scraper` | 0.21 | HTML parsing for text extraction and favicon resolution |

Features: `reqwest` with `rustls-tls` (no native OpenSSL requirement).

## 2. Favicon Auto-Fetch

### Flow
```
create_external_link()
  → INSERT link record (favicon='')
  → async: GET link.url
  → parse HTML for <link rel="icon">
  → fallback: GET {origin}/favicon.ico
  → download favicon, base64 encode
  → UPDATE favicon field
  → return link (now with favicon)
```

### Implementation
- `create_external_link` becomes `async fn`
- `reqwest::Client` with 3-second timeout
- Helper: `resolve_favicon(client, url) -> Option<String>` returns base64 data URL or None
- Favicon stored as `data:image/...;base64,...` in the `favicon` TEXT column

### Error Handling
- Network error → return link with empty favicon (non-blocking)
- Timeout after 3s → skip favicon
- Invalid image → skip favicon

## 3. Link Content Sync

### Command: `sync_link(id: String) -> Result<ExternalLink, String>`

Dispatch based on `link_type`:

| link_type | Strategy | Status |
|-----------|----------|--------|
| `web` | HTTP GET → scraper text extraction → save as snapshot | Implement now |
| `github` | HTTP GET → scraper text extraction → save as snapshot | Implement now (same as web) |
| `figma` | Figma REST API with token from `ai_skill` field | Stub only |
| `canva` | Canva API with token | Stub only |
| `notion` | Notion API with token | Stub only |

### Web/GitHub Sync Flow
1. Read `url` from DB
2. `reqwest` GET with 10-second timeout
3. `scraper` HTML parse: select `<body>`, strip `<script>`, `<style>`, `<nav>`, `<footer>`
4. Extract remaining text, trim whitespace, limit to ~100KB
5. Save to `last_snapshot` column
6. Set `sync_status='synced'`, `last_synced_at=now`
7. Call `index_document(&db, project_id, "link", &id, &title, &snapshot)` for FTS5
8. Return updated `ExternalLink`

### Stub Types (figma/canva/notion)
- Read token from `ai_skill` field
- If no token → set `sync_status='error'` with message "需要配置 API Token"
- If token present → set `sync_status='error'` with message "此类型的 API 同步即将支持"

### Error Handling
- Network timeout → `sync_status='error'` with "网络超时"
- HTTP 4xx/5xx → `sync_status='error'` with status code
- Text extraction empty → `sync_status='synced'` with empty snapshot (valid for SPAs)

## 4. Fix: `get_external_links` Read Sync Fields

Currently `get_external_links` queries only 11 columns and hardcodes `sync_status="idle"`, `last_synced_at=None`, `last_snapshot=None`. Fix to include all 14 columns in the SELECT.

## 5. Fix: `update_external_link` Support API Config

Add ability to update the `ai_skill` field (used as API config storage). The form needs to show/hide an API Token input based on link_type.

## 6. Frontend Changes

### 6.1 TypeScript Type Update (`types/share.ts`)
Add `ai_skill: string` field to `ExternalLink` interface. Add `sync_status`, `last_synced_at`, `last_snapshot` (they exist in Rust model, solidify in TS).

### 6.2 Link Store Updates (`stores/linkStore.ts`)
- `createLink`: pass `aiSkill` parameter
- `updateLink`: pass `aiSkill` parameter
- `syncLink`: already calls `invoke('sync_link', { id })` — now backend will respond

### 6.3 Link Page UI (`pages/WhiteboardPage.tsx`)
- Link list items: show `<img>` from favicon data URL, show sync status dot
- Link edit form: add "API Token" field, visible only when `link_type` is `figma`/`canva`/`notion`
- Sync button: visible for all link types, shows status during sync

### 6.4 Favicon Display
```
[icon] Title                    [type badge] [sync dot]
[16px]  Subtitle/URL
```
Use `<img src={link.favicon}>` with 16x16 size, fallback to Link2 icon on empty.

## 7. Tauri Command Registration

Add to `lib.rs`:
```rust
commands::link::sync_link,
```

## 8. Test Verification

1. Create a web link → verify favicon appears after short delay
2. Click "Sync" on web link → verify `last_snapshot` populated, FTS5 searchable
3. Create figma link → verify API Token field appears in form
4. Sync figma link without token → verify "需要配置 API Token" error
5. Search in AI panel → verify synced link content is included in results
