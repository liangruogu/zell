### Task 4: Add search_knowledge, search_resources, get_resource_content commands

**Files:**
- Modify: `app/src-tauri/src/commands/resource.rs`
- Modify: `app/src-tauri/src/lib.rs`

**Interfaces:**
- Produces (Rust commands):
  - `search_knowledge(project_id: String, query: String, limit: Option<usize>) -> Vec<SearchResult>` 鈥?FTS5 search with source_type='knowledge'
  - `search_resources(project_id: String, query: String, limit: Option<usize>) -> Vec<SearchResult>` 鈥?FTS5 search with source_type IN ('file','link')
  - `get_resource_content(resource_type: String, id: String) -> ResourceContent` 鈥?returns full text
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


