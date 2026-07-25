### Task 3: Index knowledge articles in FTS5 + add summaries command

**Files:**
- Modify: `app/src-tauri/src/commands/knowledge.rs`
- Modify: `app/src-tauri/src/commands/resource.rs`
- Modify: `app/src-tauri/src/db/migrations.rs`

**Interfaces:**
- Consumes: `index_document()` from `commands/resource.rs` (already `pub fn`)
- Produces:
  - `get_article_summaries(project_id: String) -> Vec<ArticleSummary>` 鈥?Tauri command
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


