use crate::db::models::ExternalLink;
use crate::db::resource_provider::{LocalFileProvider, ResourceProvider, ResourceSnapshot};
use crate::db::Database;
use chrono::Utc;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

// ── Search result type ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub snippet: String,
    pub source_type: String,
    pub source_id: String,
    pub project_id: String,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourceContent {
    pub id: String,
    pub name: String,
    pub text: String,
    pub resource_type: String,
    pub url: Option<String>,
}

// ── FTS5 helpers ───────────────────────────────────────────────────

pub fn index_document(
    db: &State<'_, Database>,
    project_id: &str,
    source_type: &str,
    source_id: &str,
    title: &str,
    content: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // Remove existing entry for this source
    conn.execute(
        "DELETE FROM document_search WHERE source_type=?1 AND source_id=?2",
        params![source_type, source_id],
    )
    .map_err(|e| e.to_string())?;
    // Insert new content
    conn.execute(
        "INSERT INTO document_search (title, content, source_type, source_id, project_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![title, content, source_type, source_id, project_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_document_index(
    db: &State<'_, Database>,
    source_type: &str,
    source_id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM document_search WHERE source_type=?1 AND source_id=?2",
        params![source_type, source_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────

fn update_link_from_snapshot(
    db: &State<'_, Database>,
    link_id: &str,
    snapshot: &ResourceSnapshot,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    let snap_json = serde_json::json!({
        "text": snapshot.extracted_text,
        "metadata": snapshot.metadata,
    })
    .to_string();
    conn.execute(
        "UPDATE external_links SET description=?1, last_snapshot=?2, sync_status='synced', last_synced_at=?3, updated_at=?4 WHERE id=?5",
        params![snapshot.extracted_text, snap_json, now, now, link_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn set_link_snapshot(
    db: &State<'_, Database>,
    link_id: &str,
    status: &str,
    snapshot: Option<&str>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE external_links SET sync_status=?1, last_synced_at=?2, last_snapshot=?3, updated_at=?4 WHERE id=?5",
        params![status, now, snapshot.unwrap_or(""), now, link_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tauri commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn sync_link(
    db: State<'_, Database>,
    id: String,
) -> Result<ExternalLink, String> {
    let link = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id,project_id,title,url,description,link_type,favicon,sort_order,sync_status,last_synced_at,last_snapshot,created_at,updated_at,deleted_at FROM external_links WHERE id=?1 AND deleted_at IS NULL")
            .map_err(|e| e.to_string())?;
        stmt.query_row(params![id], |row| {
            Ok(ExternalLink {
                id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
                url: row.get(3)?, description: row.get(4)?, link_type: row.get(5)?,
                favicon: row.get(6)?, ai_skill: String::new(), sort_order: row.get(7)?,
                sync_status: row.get(8)?, last_synced_at: row.get(9)?,
                last_snapshot: row.get(10)?, created_at: row.get(11)?,
                updated_at: row.get(12)?, deleted_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?
    };

    set_link_snapshot(&db, &link.id, "syncing", None)?;

    let provider = LocalFileProvider;
    match provider.sync(&link) {
        Ok(snapshot) => {
            update_link_from_snapshot(&db, &link.id, &snapshot)?;
        }
        Err(e) => {
            set_link_snapshot(&db, &link.id, "error", Some(&e))?;
        }
    }

    // Re-read the updated link
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id,project_id,title,url,description,link_type,favicon,sort_order,sync_status,last_synced_at,last_snapshot,created_at,updated_at,deleted_at FROM external_links WHERE id=?1")
        .map_err(|e| e.to_string())?;
    let updated = stmt.query_row(params![id], |row| {
        Ok(ExternalLink {
            id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
            url: row.get(3)?, description: row.get(4)?, link_type: row.get(5)?,
            favicon: row.get(6)?, ai_skill: String::new(), sort_order: row.get(7)?,
            sync_status: row.get(8)?, last_synced_at: row.get(9)?,
            last_snapshot: row.get(10)?, created_at: row.get(11)?,
            updated_at: row.get(12)?, deleted_at: row.get(13)?,
        })
    })
    .map_err(|e| e.to_string())?;

    // Index document content in FTS5
    if !updated.description.is_empty() {
        let _ = index_document(&db, &updated.project_id, "link", &updated.id, &updated.title, &updated.description);
    }

    Ok(updated)
}

#[tauri::command]
pub fn search_documents(
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
             WHERE document_search MATCH ?1 AND project_id = ?2
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;

    let results = stmt
        .query_map(params![query, project_id, limit as i64], |row| {
            Ok(SearchResult {
                title: row.get(0)?,
                snippet: row.get(1)?,
                source_type: row.get(2)?,
                source_id: row.get(3)?,
                project_id: row.get(4)?,
                rank: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(results)
}

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
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, String>(3)?)),
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
