### Task 3 Report: Index knowledge articles in FTS5 + add summaries command

**Status:** DONE

**Cargo check output:**
```
warning: struct `Vault` is never constructed
warning: associated function `new` is never used
warning: struct `AiConversation` is never constructed
warning: struct `InviteCode` is never constructed
warning: struct `AppSetting` is never constructed
warning: associated function `resource_type` is never used
Finished `dev` profile [unoptimized + debuginfo] target(s) in 7.42s
```

All warnings are pre-existing. No errors introduced.

**Changes made:**

1. **`commands/knowledge.rs`**:
   - Added `use serde::Serialize;` and `ArticleSummary` struct (id, title, preview, updated_at)
   - `create_knowledge_article`: drops `conn` before calling `index_document()` to avoid Mutex deadlock (since `index_document` internally locks the same `db.conn` Mutex)
   - `update_knowledge_article`: queries `project_id` before the UPDATE, drops `conn`, then calls `index_document()` — same deadlock avoidance
   - `delete_knowledge_article`: drops `conn` before calling `delete_document_index()` — same deadlock avoidance
   - Added `get_article_summaries` Tauri command — queries articles, strips Markdown markers, truncates to 300 chars, returns `Vec<ArticleSummary>` sorted by `sort_order ASC`

2. **`db/migrations.rs`**: Added migration block to re-index existing knowledge_articles into the `document_search` FTS5 table (delete old + insert fresh for each non-deleted article)

3. **`lib.rs`**: Registered `commands::knowledge::get_article_summaries` in invoke_handler

**Concerns:** None — the deadlock risk was addressed by dropping `conn` before all FTS5 helper calls.
