# External Link Sync & Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic favicon fetching, web content sync (firecrawl optional + built-in HTML-to-Markdown fallback), and AI context injection for external links.

**Architecture:** Two-tier sync: firecrawl API (if key configured) → clean Markdown, else fallback to direct HTTP fetch + built-in HTML-to-Markdown DOM converter. Markdown stored in `last_snapshot`, link summaries injected into AI system prompt, full content retrievable via existing `get_resource(type="link", id)`. Favicon auto-fetched at link creation time.

**Tech Stack:** Rust (reqwest 0.12, scraper 0.21), React 19 + TypeScript, Zustand 5

## Global Constraints

- `reqwest` features: `rustls-tls` (no OpenSSL)
- Timeouts: favicon 3s, firecrawl 15s, direct fetch 10s
- Markdown output capped at 500KB
- System prompt lists max 15 links
- No FTS5 indexing for synced links

---

### Task 1: Add Rust Dependencies

**Files:**
- Modify: `app/src-tauri/Cargo.toml`

**Interfaces:**
- Produces: `reqwest` (HTTP client), `scraper` (HTML parsing) available to all subsequent Rust tasks

- [ ] **Step 1: Add `reqwest` and `scraper` to Cargo.toml**

```toml
reqwest = { version = "0.12", features = ["rustls-tls"], default-features = false }
scraper = "0.21"
```

Add after `uuid` dependency line in `Cargo.toml`.

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: `Finished dev profile ...` (no errors)

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock
git commit -m "chore: add reqwest and scraper dependencies"
```

---

### Task 2: Built-in HTML-to-Markdown Converter

**Files:**
- Create: `app/src-tauri/src/commands/html2md.rs`

**Interfaces:**
- Produces: `pub fn html_to_markdown(html: &str, page_url: &str) -> String` — takes raw HTML and source URL, returns Markdown string

- [ ] **Step 1: Create `html2md.rs` with the HTML-to-Markdown converter**

```rust
use scraper::{Html, Selector};

pub fn html_to_markdown(html: &str, page_url: &str) -> String {
    let document = Html::parse_document(html);
    let mut md = String::with_capacity(html.len() / 2);

    // Extract page title
    if let Ok(title_sel) = Selector::parse("title") {
        if let Some(title) = document.select(&title_sel).next() {
            let t = title.text().collect::<Vec<_>>().join(" ").trim().to_string();
            if !t.is_empty() {
                md.push_str("# ");
                md.push_str(&t);
                md.push('\n');
                md.push('\n');
            }
        }
    }

    // Get body, skip unwanted tags
    if let Ok(body_sel) = Selector::parse("body") {
        if let Some(body) = document.select(&body_sel).next() {
            let mut list_depth: Vec<u8> = Vec::new(); // 1=ul, 2=ol
            let mut output = String::new();
            walk_children(body, &mut output, page_url, &mut list_depth);
            md.push_str(&output);
        }
    }

    // Trim and limit to 500KB
    let trimmed = md.trim().to_string();
    if trimmed.len() > 512000 {
        let cut = trimmed.char_indices().take(512000).last().map(|(i, _)| i).unwrap_or(0);
        trimmed[..cut].to_string() + "\n\n...(内容已截断)"
    } else {
        trimmed
    }
}

fn walk_children(
    parent: scraper::ElementRef,
    out: &mut String,
    base_url: &str,
    list_depth: &mut Vec<u8>,
) {
    for child in parent.children() {
        match child.value() {
            scraper::node::Node::Text(text) => {
                let t = text.text.trim();
                if !t.is_empty() {
                    out.push_str(t);
                    out.push(' ');
                }
            }
            scraper::node::Node::Element(el) => {
                let name = el.name.local.as_ref();
                // Skip unwanted elements
                if matches!(name, "script" | "style" | "nav" | "footer" | "header" | "noscript" | "iframe") {
                    continue;
                }
                match name {
                    "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                        let level = name[1..].parse::<usize>().unwrap_or(1);
                        let prefix = "#".repeat(level);
                        out.push('\n');
                        out.push_str(&prefix);
                        out.push(' ');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push('\n');
                        out.push('\n');
                    }
                    "p" => {
                        out.push('\n');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push('\n');
                        out.push('\n');
                    }
                    "br" => {
                        out.push('\n');
                    }
                    "hr" => {
                        out.push_str("\n---\n\n");
                    }
                    "a" => {
                        let href = el.attrs.iter().find(|a| a.name.local.as_ref() == "href")
                            .map(|a| resolve_url(a.value.to_string(), base_url))
                            .unwrap_or_default();
                        let mut inner = String::new();
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, &mut inner, base_url);
                        }
                        let inner = inner.trim();
                        if !inner.is_empty() && !href.is_empty() {
                            out.push('[');
                            out.push_str(inner);
                            out.push_str("](");
                            out.push_str(&href);
                            out.push(')');
                        } else if !inner.is_empty() {
                            out.push_str(inner);
                        }
                    }
                    "strong" | "b" => {
                        out.push_str("**");
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push_str("**");
                    }
                    "em" | "i" => {
                        out.push('*');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push('*');
                    }
                    "code" => {
                        // Check parent for <pre>
                        let in_pre = is_in_pre(&child);
                        if in_pre {
                            // handled by <pre>
                        } else {
                            out.push('`');
                            if let Some(er) = scraper::ElementRef::wrap(child) {
                                walk_inline(er, out, base_url);
                            }
                            out.push('`');
                        }
                    }
                    "pre" => {
                        out.push_str("\n```\n");
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push_str("\n```\n\n");
                    }
                    "blockquote" => {
                        let mut inner = String::new();
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_children(er, &mut inner, base_url, list_depth);
                        }
                        for line in inner.lines() {
                            out.push_str("> ");
                            out.push_str(line);
                            out.push('\n');
                        }
                        out.push('\n');
                    }
                    "ul" => {
                        list_depth.push(1);
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_children(er, out, base_url, list_depth);
                        }
                        list_depth.pop();
                        out.push('\n');
                    }
                    "ol" => {
                        list_depth.push(2);
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_children(er, out, base_url, list_depth);
                        }
                        list_depth.pop();
                        out.push('\n');
                    }
                    "li" => {
                        let indent = "  ".repeat(list_depth.len().saturating_sub(1));
                        let prefix = if list_depth.last() == Some(&2) { "1. " } else { "- " };
                        out.push('\n');
                        out.push_str(indent);
                        out.push_str(prefix);
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                    }
                    "img" => {
                        let src = el.attrs.iter().find(|a| a.name.local.as_ref() == "src")
                            .map(|a| resolve_url(a.value.to_string(), base_url))
                            .unwrap_or_default();
                        let alt = el.attrs.iter().find(|a| a.name.local.as_ref() == "alt")
                            .map(|a| a.value.to_string())
                            .unwrap_or_default();
                        if !src.is_empty() {
                            out.push_str("\n![");
                            out.push_str(&alt);
                            out.push_str("](");
                            out.push_str(&src);
                            out.push_str(")\n\n");
                        }
                    }
                    "div" | "span" | "section" | "article" | "main" | "table" | "tr" | "td" | "th" | "thead" | "tbody" => {
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_children(er, out, base_url, list_depth);
                        }
                    }
                    _ => {
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_children(er, out, base_url, list_depth);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn walk_inline(parent: scraper::ElementRef, out: &mut String, base_url: &str) {
    for child in parent.children() {
        match child.value() {
            scraper::node::Node::Text(text) => {
                out.push_str(text.text.trim());
                out.push(' ');
            }
            scraper::node::Node::Element(el) => {
                let name = el.name.local.as_ref();
                match name {
                    "a" => {
                        let href = el.attrs.iter().find(|a| a.name.local.as_ref() == "href")
                            .map(|a| resolve_url(a.value.to_string(), base_url))
                            .unwrap_or_default();
                        out.push('[');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        let inner = out.trim_end().to_string();
                        out.push_str("](");
                        out.push_str(&href);
                        out.push(')');
                        out.push(' ');
                    }
                    "strong" | "b" => {
                        out.push_str("**");
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push_str("**");
                    }
                    "em" | "i" => {
                        out.push('*');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push('*');
                    }
                    "code" => {
                        out.push('`');
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                        out.push('`');
                    }
                    "br" => { out.push('\n'); }
                    "img" => {
                        let src = el.attrs.iter().find(|a| a.name.local.as_ref() == "src")
                            .map(|a| resolve_url(a.value.to_string(), base_url))
                            .unwrap_or_default();
                        let alt = el.attrs.iter().find(|a| a.name.local.as_ref() == "alt")
                            .map(|a| a.value.to_string())
                            .unwrap_or_default();
                        if !src.is_empty() {
                            out.push_str("![");
                            out.push_str(&alt);
                            out.push_str("](");
                            out.push_str(&src);
                            out.push(')');
                        }
                    }
                    _ => {
                        if let Some(er) = scraper::ElementRef::wrap(child) {
                            walk_inline(er, out, base_url);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

fn resolve_url(href: String, base_url: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href
    } else if href.starts_with("//") {
        format!("https:{}", href)
    } else if href.starts_with('/') {
        // Extract origin from base_url
        if let Some(end) = base_url.find("/").and_then(|i| base_url[8..].find('/').map(|j| 8 + j)) {
            format!("{}{}", &base_url[..end], href)
        } else {
            format!("{}{}", base_url, href)
        }
    } else {
        href // relative — keep as-is
    }
}

fn is_in_pre(node: &scraper::node::Node) -> bool {
    false // simplified: always false since we don't track parent chain
}
```

- [ ] **Step 2: Compute correct module path and verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: no errors

- [ ] **Step 3: Fix `is_in_pre` with actual parent tracking**

Replace the `is_in_pre` stub with actual logic:

```rust
fn is_in_pre(node: &scraper::node::Node) -> bool {
    if let Some(parent) = node.parent() {
        if let Some(el) = parent.value().as_element() {
            if el.name.local.as_ref() == "pre" {
                return true;
            }
            return is_in_pre(&parent);
        }
    }
    false
}
```

Note: `scraper`'s `Node` doesn't expose `parent()`. Simplify: just detect `<pre>` by traversing the element chain in the walker function. Change `walk_inline` and `walk_children` to pass a `in_pre: bool` flag. When `name == "pre"`, pass `in_pre=true` to children; `name == "code"` with `in_pre==true` → skip inline code formatting.

Actually, for simplicity: `<code>` inside `<pre>` already gets handled because `<pre>` intercepts first and outputs as a fenced block. `<code>` not in `<pre>` renders as inline. Add an `in_pre` boolean parameter to `walk_inline` and set it true when processing `<pre>` children.

Update signatures:
```rust
fn walk_children(parent: scraper::ElementRef, out: &mut String, base_url: &str, list_depth: &mut Vec<u8>, in_pre: bool)
fn walk_inline(parent: scraper::ElementRef, out: &mut String, base_url: &str, in_pre: bool)
```

Then in `<code>` handling:
```rust
"code" => {
    if in_pre {
        if let Some(er) = scraper::ElementRef::wrap(child) {
            walk_inline(er, out, base_url, true);
        }
    } else {
        out.push('`');
        if let Some(er) = scraper::ElementRef::wrap(child) {
            walk_inline(er, out, base_url, false);
        }
        out.push('`');
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/commands/html2md.rs
git commit -m "feat: built-in HTML-to-Markdown converter for link sync fallback"
```

---

### Task 3: Favi-fetch for `create_external_link`

**Files:**
- Modify: `app/src-tauri/src/commands/link.rs:1-45`

**Interfaces:**
- Modifies: `create_external_link` — changed to `async fn`, auto-fetches favicon after insert
- Produces: `resolve_favicon(client: &reqwest::Client, url: &str) -> String` helper

- [ ] **Step 1: Add imports and favicon helper to link.rs**

Replace the imports block at top of `link.rs`:

```rust
use crate::db::models::ExternalLink;
use crate::db::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use scraper::{Html, Selector};
use tauri::State;
use uuid::Uuid;

async fn resolve_favicon(client: &reqwest::Client, url: &str) -> Option<String> {
    // Parse origin from URL
    let origin = if let Some(end) = url.find('/').and_then(|i| url[8..].find('/').map(|j| 8 + j)) {
        url[..end].to_string()
    } else {
        url.to_string()
    };

    // Step 1: GET page, parse <link rel="icon">
    let resp = client.get(url).timeout(std::time::Duration::from_secs(3)).send().await.ok()?;
    let html = resp.text().await.ok()?;
    let document = Html::parse_document(&html);

    let icon_sel = Selector::parse("link[rel=\"icon\"], link[rel=\"shortcut icon\"]").ok()?;
    let mut icon_url = None;
    for el in document.select(&icon_sel) {
        if let Some(href) = el.value().attr("href") {
            // Resolve relative URL
            if href.starts_with("http") {
                icon_url = Some(href.to_string());
            } else if href.starts_with("//") {
                icon_url = Some(format!("https:{}", href));
            } else if href.starts_with('/') {
                icon_url = Some(format!("{}{}", origin, href));
            } else {
                icon_url = Some(format!("{}/{}", origin, href));
            }
            break;
        }
    }

    // Step 2: Fallback to /favicon.ico
    let icon_url = icon_url.unwrap_or_else(|| format!("{}/favicon.ico", origin));

    // Step 3: Download and base64 encode
    let icon_resp = client.get(&icon_url).timeout(std::time::Duration::from_secs(3)).send().await.ok()?;
    let bytes = icon_resp.bytes().await.ok()?;
    if bytes.is_empty() { return None; }

    // Detect MIME from bytes
    let mime = if bytes.starts_with(b"\x89PNG") { "image/png" }
        else if bytes.starts_with(b"\xff\xd8") { "image/jpeg" }
        else if bytes.starts_with(b"GIF8") { "image/gif" }
        else if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") { "image/svg+xml" }
        else { "image/x-icon" };

    Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}
```

- [ ] **Step 2: Modify `create_external_link` to be async and fetch favicon**

Replace the entire `create_external_link` function:

```rust
#[tauri::command]
pub async fn create_external_link(
    db: State<'_, Database>,
    app: tauri::AppHandle,
    project_id: String,
    title: String,
    url: String,
    description: String,
    link_type: String,
    ai_skill: String,
) -> Result<ExternalLink, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();

    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM external_links WHERE project_id = ?1 AND deleted_at IS NULL",
            rusqlite::params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO external_links (id, project_id, title, url, description, link_type, favicon, ai_skill, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'',?7,?8,?9,?10)",
        rusqlite::params![id, project_id, title, url, description, link_type, ai_skill, max_order + 1, now, now],
    )
    .map_err(|e| e.to_string())?;

    drop(conn);

    // Fetch favicon in background (non-blocking)
    let favicon = {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .unwrap_or_default();
        resolve_favicon(&client, &url).await.unwrap_or_default()
    };

    if !favicon.is_empty() {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute("UPDATE external_links SET favicon=?1 WHERE id=?2", rusqlite::params![favicon, id]);
    }

    crate::commands::project::touch_project(&db, &project_id);

    Ok(ExternalLink {
        id, project_id, title, url, description, link_type,
        favicon, ai_skill, sort_order: max_order + 1,
        sync_status: "idle".to_string(), last_synced_at: None, last_snapshot: None,
        created_at: now.clone(), updated_at: now, deleted_at: None,
    })
}
```

- [ ] **Step 3: Verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/commands/link.rs
git commit -m "feat: async favicon auto-fetch on external link creation"
```

---

### Task 4: `sync_link` Command

**Files:**
- Modify: `app/src-tauri/src/commands/link.rs` — add `sync_link` function at end of file

**Interfaces:**
- Consumes: `html_to_markdown` from Task 2, `Settings` table read
- Produces: `pub async fn sync_link(db, id) -> Result<ExternalLink, String>`

- [ ] **Step 1: Add `sync_link` function to end of link.rs (before final closing brace if any)**

```rust
#[tauri::command]
pub async fn sync_link(
    db: State<'_, Database>,
    id: String,
) -> Result<ExternalLink, String> {
    // Read link from DB
    let (project_id, url, title, link_type, ai_skill, description, favicon, sort_order, created_at) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT project_id, url, title, link_type, ai_skill, description, favicon, sort_order, created_at FROM external_links WHERE id=?1 AND deleted_at IS NULL",
            rusqlite::params![id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, String>(8)?,
            )),
        ).map_err(|e| format!("Link not found: {}", e))?
    };

    let now = Utc::now().to_rfc3339();

    match link_type.as_str() {
        "web" | "github" => {
            sync_web_page(&db, &id, &project_id, &url, &title, &link_type, &description, &favicon, sort_order, &created_at, &now).await
        }
        "figma" | "canva" | "notion" => {
            if ai_skill.is_empty() {
                update_sync_error(&db, &id, "需要配置 API Token", &project_id, &now)
            } else {
                update_sync_error(&db, &id, &format!("此类型({})的 API 同步即将支持", link_type), &project_id, &now)
            }
        }
        _ => {
            // Treat unknown types as web
            sync_web_page(&db, &id, &project_id, &url, &title, &link_type, &description, &favicon, sort_order, &created_at, &now).await
        }
    }
}

async fn sync_web_page(
    db: &State<'_, Database>,
    id: &str, project_id: &str, url: &str, title: &str, link_type: &str,
    description: &str, favicon: &str, sort_order: i32, created_at: &str, now: &str,
) -> Result<ExternalLink, String> {
    // Try firecrawl first
    let fc_key = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT value FROM settings WHERE key='firecrawl_api_key'",
            [],
            |row| row.get::<_, String>(0),
        ).ok()
    };

    let markdown = if let Some(ref key) = fc_key {
        fetch_via_firecrawl(url, key).await.unwrap_or_else(|_| String::new())
    } else {
        String::new()
    };

    // Fallback: direct HTTP fetch + built-in converter
    let markdown = if markdown.is_empty() {
        fetch_via_direct(url).await.unwrap_or_else(|_| String::new())
    } else {
        markdown
    };

    if markdown.is_empty() {
        return update_sync_error(db, id, "无法提取网页内容（页面可能为空白或需要 JS 渲染，可尝试配置 firecrawl API Key）", project_id, now);
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE external_links SET last_snapshot=?1, sync_status='synced', last_synced_at=?2, updated_at=?3 WHERE id=?4",
        rusqlite::params![markdown, now, now, id],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    crate::commands::project::touch_project(db, project_id);

    Ok(ExternalLink {
        id: id.to_string(), project_id: project_id.to_string(),
        title: title.to_string(), url: url.to_string(),
        description: description.to_string(), link_type: link_type.to_string(),
        favicon: favicon.to_string(), ai_skill: String::new(),
        sort_order, sync_status: "synced".to_string(),
        last_synced_at: Some(now.to_string()), last_snapshot: Some(markdown),
        created_at: created_at.to_string(), updated_at: now.to_string(),
        deleted_at: None,
    })
}

async fn fetch_via_firecrawl(url: &str, api_key: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post("https://api.firecrawl.dev/v1/scrape")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "url": url,
            "formats": ["markdown"]
        }))
        .send()
        .await
        .map_err(|e| format!("firecrawl request failed: {}", e))?;
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("firecrawl response parse error: {}", e))?;
    body["data"]["markdown"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "firecrawl response missing markdown field".to_string())
}

async fn fetch_via_direct(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 Bindle/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| format!("HTTP request failed: {}", e))?;
    let html = resp.text().await.map_err(|e| format!("Read response body failed: {}", e))?;
    Ok(crate::commands::html2md::html_to_markdown(&html, url))
}

fn update_sync_error(db: &State<'_, Database>, id: &str, msg: &str, project_id: &str, now: &str) -> Result<ExternalLink, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // Store the error message in last_snapshot so user can see it
    conn.execute(
        "UPDATE external_links SET sync_status='error', last_snapshot=?1, last_synced_at=?2, updated_at=?3 WHERE id=?4",
        rusqlite::params![format!("同步失败: {}", msg), now, now, id],
    )
    .map_err(|e| e.to_string())?;

    let link = conn.query_row(
        "SELECT id, project_id, title, url, description, link_type, favicon, ai_skill, sort_order, created_at, updated_at FROM external_links WHERE id=?1",
        rusqlite::params![id],
        |row| Ok(ExternalLink {
            id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
            url: row.get(3)?, description: row.get(4)?, link_type: row.get(5)?,
            favicon: row.get(6)?, ai_skill: row.get(7)?, sort_order: row.get(8)?,
            sync_status: "error".to_string(),
            last_synced_at: Some(now.to_string()),
            last_snapshot: Some(format!("同步失败: {}", msg)),
            created_at: row.get(9)?, updated_at: now.to_string(),
            deleted_at: None,
        }),
    ).map_err(|e| e.to_string())?;
    drop(conn);
    // Don't call touch_project on error — don't bump project timestamp for failures
    Ok(link)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/src/commands/link.rs
git commit -m "feat: sync_link command with firecrawl + fallback HTML-to-MD"
```

---

### Task 5: Register Module and Command

**Files:**
- Modify: `app/src-tauri/src/commands/mod.rs` — add `pub mod html2md;`
- Modify: `app/src-tauri/src/lib.rs:57` — add `commands::link::sync_link,`

**Interfaces:**
- Consumes: `html2md` module (Task 2), `sync_link` function (Task 4)
- No new produce — enables existing functions

- [ ] **Step 1: Register `html2md` module**

Add line to `commands/mod.rs` (after existing `pub mod` lines):
```
pub mod html2md;
```

- [ ] **Step 2: Register `sync_link` command**

Add line to `lib.rs` in the `generate_handler!` macro, after `commands::link::delete_external_link,`:
```
            commands::link::sync_link,
```

- [ ] **Step 3: Verify build**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/commands/mod.rs app/src-tauri/src/lib.rs
git commit -m "feat: register html2md module and sync_link command"
```

---

### Task 6: Fix `get_external_links` — Read Sync Fields from DB

**Files:**
- Modify: `app/src-tauri/src/commands/link.rs:48-72`

**Interfaces:**
- Modifies: `get_external_links` — SELECT includes sync_status, last_synced_at, last_snapshot; reads actual values instead of hardcoding

- [ ] **Step 1: Update the SELECT query and row mapping**

Replace `get_external_links`:

```rust
#[tauri::command]
pub fn get_external_links(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ExternalLink>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, title, url, description, link_type, favicon, ai_skill, sync_status, last_synced_at, last_snapshot, sort_order, created_at, updated_at, deleted_at FROM external_links WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;

    let links = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(ExternalLink {
                id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
                url: row.get(3)?, description: row.get(4)?, link_type: row.get(5)?,
                favicon: row.get(6)?, ai_skill: row.get(7)?,
                sync_status: row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "idle".to_string()),
                last_synced_at: row.get(9)?,
                last_snapshot: row.get(10)?,
                sort_order: row.get(11)?,
                created_at: row.get(12)?, updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(links)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cargo check --manifest-path app/src-tauri/Cargo.toml`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/src/commands/link.rs
git commit -m "fix: get_external_links reads sync_status, last_synced_at, last_snapshot from DB"
```

---

### Task 7: Frontend Types and Store Updates

**Files:**
- Modify: `app/src/types/share.ts` — add `ai_skill: string`
- Modify: `app/src/stores/linkStore.ts` — add `aiSkill` parameter to create/update

**Interfaces:**
- Produces: `ExternalLink.ai_skill` field available; `createLink`/`updateLink` accept `aiSkill`

- [ ] **Step 1: Add `ai_skill` to TypeScript type**

Add field to `ExternalLink` interface in `share.ts`:

```typescript
export interface ExternalLink {
  id: string
  project_id: string
  title: string
  url: string
  description: string
  link_type: string
  favicon: string
  ai_skill: string
  sort_order: number
  sync_status: string
  last_synced_at: string | null
  last_snapshot: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
```

- [ ] **Step 2: Update linkStore `createLink` and `updateLink` to pass `aiSkill`**

```typescript
createLink: async (projectId, data) => {
  const link = await invoke<ExternalLink>('create_external_link', {
    projectId, title: data.title, url: data.url,
    description: data.description || '',
    linkType: data.linkType || 'web',
    aiSkill: data.aiSkill || '',
  })
  set((s) => ({ links: [...s.links, link] }))
  return link
},

updateLink: async (id, data) => {
  await invoke('update_external_link', {
    id, title: data.title, url: data.url,
    description: data.description, linkType: data.linkType,
    aiSkill: data.aiSkill || '',
  })
  set((s) => ({
    links: s.links.map((l) => l.id === id ? { ...l, ...data } : l),
    currentLink: s.currentLink?.id === id ? { ...s.currentLink, ...data } : s.currentLink,
  }))
},
```

Also update the interface types:
```typescript
createLink: (projectId: string, data: {
  title: string; url: string; description?: string; linkType?: string; aiSkill?: string
}) => Promise<ExternalLink>
updateLink: (id: string, data: {
  title: string; url: string; description: string; linkType: string; aiSkill?: string
}) => Promise<void>
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/src/types/share.ts app/src/stores/linkStore.ts
git commit -m "feat: add ai_skill field to external link types and store"
```

---

### Task 8: AI Context Injection

**Files:**
- Modify: `app/src/services/aiService.ts` — import `useLinkStore`, inject link summaries

**Interfaces:**
- Consumes: `useLinkStore` from stores, existing context injection block
- No new produce — augments system prompt

- [ ] **Step 1: Add import for `useLinkStore`**

```typescript
import { useLinkStore } from '@/stores/linkStore'
```

- [ ] **Step 2: Add link context injection after the existing file block**

After the file injection block (line ~115, after the closing `}` of the file context section):

```typescript
      // Add external links with sync status
      const links = useLinkStore.getState().links
      if (links.length > 0) {
        ctx += `\n\n外部链接 (${links.length} 个):`
        for (const l of links.slice(0, 15)) {
          let desc = ` — ${l.url}`
          if (l.description) desc += ` | ${l.description}`
          if (l.sync_status === 'synced') desc += ' [已同步]'
          ctx += `\n- [${l.title}] 类型: ${l.link_type} | ID: ${l.id}${desc}`
        }
        if (links.length > 15) ctx += `\n... 共 ${links.length} 个链接`
      }
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add app/src/services/aiService.ts
git commit -m "feat: inject external link summaries into AI system prompt"
```

---

### Task 9: UI — Favicon Display and Sync Status in Link List

**Files:**
- Modify: `app/src/pages/WhiteboardPage.tsx:310-338` — update link list item rendering

**Interfaces:**
- Consumes: `link.favicon` (base64 data URL), `link.sync_status`

- [ ] **Step 1: Update link list item to show favicon and sync status for all types**

Replace the link item JSX (lines 310-338):

```tsx
                  links.map((link) => (
                    <div
                      key={link.id}
                      className={cn(
                        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
                        currentLink?.id === link.id && !isNewLink
                          ? 'bg-bindle-100 text-bindle-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                      onClick={() => selectLink(link)}
                    >
                      {link.favicon ? (
                        <img src={link.favicon} alt="" className="w-4 h-4 rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      ) : (
                        <Link2 size={14} className="shrink-0 text-gray-400" />
                      )}
                      <span className="truncate flex-1">{link.title}</span>
                      {link.sync_status === 'synced' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="已同步" />
                      )}
                      {link.sync_status === 'syncing' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="同步中" />
                      )}
                      {link.sync_status === 'error' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="同步失败" />
                      )}
                      <span className="text-[10px] text-gray-400 shrink-0">{LINK_TYPE_LABELS[link.link_type] || link.link_type}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenUrl(link.url) }} className="p-0.5 rounded hover:bg-bindle-200" title="打开链接">
                          <ExternalLinkIcon size={13} className="text-gray-400 hover:text-bindle-600" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); confirmDelete(link) }} className="p-0.5 rounded hover:bg-red-100" title="删除">
                          <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))
```

Key change: always show sync status dot (not just for `link_type === 'file'`), show favicon when available.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/src/pages/WhiteboardPage.tsx
git commit -m "feat: show favicon and sync status dots for all link types"
```

---

### Task 10: UI — API Token Field and Sync Button

**Files:**
- Modify: `app/src/pages/WhiteboardPage.tsx` — form area and link CRUD handlers

**Interfaces:**
- Consumes: `link.ai_skill`, `link.link_type`

- [ ] **Step 1: Add `apiToken` state and wire all link form fields**

Add state variable near other form states (around line 49):
```tsx
  const [apiToken, setApiToken] = useState('')
```

- [ ] **Step 2: Update `selectLink` and `handleNewLink` to load/save `apiToken`**

Find the `selectLink` callback and update it, and `handleNewLink`:

```tsx
  const selectLink = useCallback((link: ExternalLink) => {
    setCurrentLink(link)
    setIsNewLink(false)
    setTitle(link.title)
    setUrl(link.url)
    setLinkDescription(link.description)
    setLinkType(link.link_type)
    setApiToken(link.ai_skill || '')
  }, [setCurrentLink])

  const handleNewLink = useCallback(() => {
    setCurrentLink(null)
    setIsNewLink(true)
    setTitle('')
    setUrl('')
    setLinkDescription('')
    setLinkType('web')
    setApiToken('')
  }, [setCurrentLink])
```

- [ ] **Step 3: Update `handleSaveLink` to pass `apiToken`**

Find `handleSaveLink` and update:

```tsx
  const handleSaveLink = useCallback(async () => {
    if (!projectId || !title.trim() || !url.trim()) return
    if (isNewLink) {
      const link = await createLink(projectId, { title: title.trim(), url: url.trim(), description: linkDescription.trim(), linkType, aiSkill: apiToken })
      setCurrentLink(link)
      setIsNewLink(false)
    } else if (currentLink) {
      await updateLink(currentLink.id, { title: title.trim(), url: url.trim(), description: linkDescription.trim(), linkType, aiSkill: apiToken })
      setCurrentLink({ ...currentLink, title, url, description: linkDescription, link_type: linkType, ai_skill: apiToken } as ExternalLink)
    }
  }, [projectId, isNewLink, currentLink, title, url, linkDescription, linkType, apiToken, createLink, updateLink, setCurrentLink])
```

- [ ] **Step 4: Add API Token field to form (conditionally visible)**

After the description textarea in the link edit form (before the sync status display), add:

```tsx
                {(linkType === 'figma' || linkType === 'canva' || linkType === 'notion') && (
                  <Input id="apiToken" label="API Token" placeholder="输入 API Token..." value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
                )}
```

- [ ] **Step 5: Update sync button to show for all link types**

Change the sync button condition from `currentLink.link_type === 'file'` to always show when `currentLink` exists:

```tsx
                      <Button variant="outline" onClick={() => syncLink(currentLink.id)}>
                        同步
                      </Button>
```

Remove the `currentLink.link_type === 'file'` guard around it.

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add app/src/pages/WhiteboardPage.tsx
git commit -m "feat: API token form field for figma/canva/notion, sync button for all types"
```

---

### Task 11: End-to-End Verification

**Test steps (manual):**

- [ ] **Step 1: Rebuild and run**
```bash
pnpm tauri dev
```

- [ ] **Step 2: Verify favicon auto-fetch**
1. Create a new web link (e.g., `https://github.com`)
2. After creation, the link list should show GitHub's favicon instead of the default Link2 icon

- [ ] **Step 3: Verify direct sync (without firecrawl)**
1. Create a web link to a simple page (e.g., `https://example.com`)
2. Click the link, then click "同步" button
3. After sync completes, `sync_status` should show green dot; `last_snapshot` should contain Markdown
4. Open the AI panel and send a message — system prompt should reference this link

- [ ] **Step 4: Verify firecrawl sync (if key available)**
1. Set `firecrawl_api_key` in settings: `invoke('set_setting', { key: 'firecrawl_api_key', value: '<your-key>' })`
2. Sync a link — Markdown quality should be higher (clean, no nav/footer noise)

- [ ] **Step 5: Verify API Token field**
1. Create or edit a link, set type to "Figma"
2. API Token input should appear below description
3. Save — token should persist

- [ ] **Step 6: Verify error handling**
1. Sync a figma link without token → should show "需要配置 API Token" error
2. Sync a figma link with token → should show "此类型(figma)的 API 同步即将支持"

- [ ] **Step 7: Commit final verification notes**
```bash
git commit --allow-empty -m "verify: external link sync + favicon end-to-end test completed"
```
