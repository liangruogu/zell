use crate::db::models::KnowledgeArticle;
use crate::db::Database;
use chrono::Utc;
use serde::Serialize;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct ArticleSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub updated_at: String,
}

pub fn create_knowledge_article_core(
    db: &Database,
    project_id: String,
    title: String,
    content: String,
    parent_id: Option<String>,
    id: Option<String>,
    content_json: Option<String>,
) -> Result<KnowledgeArticle, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = id.unwrap_or_else(|| Uuid::now_v7().to_string());
    let cj = content_json.unwrap_or_else(|| "{}".to_string());
    let now = Utc::now().to_rfc3339();

    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM knowledge_articles WHERE project_id = ?1 AND deleted_at IS NULL",
            rusqlite::params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    conn.execute(
        "INSERT INTO knowledge_articles (id, project_id, title, content, content_json, parent_id, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![id, project_id, title, content, cj, parent_id, max_order + 1, now, now],
    )
    .map_err(|e| e.to_string())?;

    drop(conn);

    let _ = crate::commands::resource::index_document(
        db, &project_id, "knowledge", &id, &title, &content,
    );
    crate::commands::project::touch_project(db, &project_id);

    Ok(KnowledgeArticle {
        id,
        project_id,
        title,
        content,
        content_json: cj,
        parent_id,
        sort_order: max_order + 1,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub fn create_knowledge_article(
    db: State<'_, Database>,
    project_id: String,
    title: String,
    content: String,
    parent_id: Option<String>,
    id: Option<String>,
    content_json: Option<String>,
) -> Result<KnowledgeArticle, String> {
    create_knowledge_article_core(&db, project_id, title, content, parent_id, id, content_json)
}

pub fn get_knowledge_articles_core(
    db: &Database,
    project_id: &str,
) -> Result<Vec<KnowledgeArticle>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, title, content, content_json, parent_id, sort_order, created_at, updated_at, deleted_at FROM knowledge_articles WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;

    let articles = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(KnowledgeArticle {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_json: row.get(4)?,
                parent_id: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                deleted_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(articles)
}

#[tauri::command]
pub fn get_knowledge_articles(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<KnowledgeArticle>, String> {
    get_knowledge_articles_core(&db, &project_id)
}

pub fn get_knowledge_article_core(
    db: &Database,
    id: &str,
) -> Result<KnowledgeArticle, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, project_id, title, content, content_json, parent_id, sort_order, created_at, updated_at, deleted_at FROM knowledge_articles WHERE id = ?1 AND deleted_at IS NULL",
        rusqlite::params![id],
        |row| {
            Ok(KnowledgeArticle {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                content_json: row.get(4)?,
                parent_id: row.get(5)?,
                sort_order: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                deleted_at: row.get(9)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_knowledge_article(
    db: State<'_, Database>,
    id: String,
) -> Result<KnowledgeArticle, String> {
    get_knowledge_article_core(&db, &id)
}

pub fn update_knowledge_article_core(
    db: &Database,
    id: &str,
    title: String,
    content: String,
    content_json: String,
) -> Result<KnowledgeArticle, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();

    let project_id: String = conn
        .query_row(
            "SELECT project_id FROM knowledge_articles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE knowledge_articles SET title = ?1, content = ?2, content_json = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![title, content, content_json, now, id],
    )
    .map_err(|e| e.to_string())?;

    drop(conn);

    let _ = crate::commands::resource::index_document(
        db, &project_id, "knowledge", id, &title, &content,
    );
    crate::commands::project::touch_project(db, &project_id);

    get_knowledge_article_core(db, id)
}

#[tauri::command]
pub fn update_knowledge_article(
    db: State<'_, Database>,
    id: String,
    title: String,
    content: String,
    content_json: String,
) -> Result<KnowledgeArticle, String> {
    update_knowledge_article_core(&db, &id, title, content, content_json)
}

pub fn delete_knowledge_article_core(
    db: &Database,
    id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE knowledge_articles SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;

    drop(conn);

    let _ = crate::commands::resource::delete_document_index(db, "knowledge", id);

    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let pid: Option<String> = conn.query_row(
            "SELECT project_id FROM knowledge_articles WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        ).ok();
        drop(conn);
        if let Some(pid) = pid {
            crate::commands::project::touch_project(db, &pid);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn delete_knowledge_article(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    delete_knowledge_article_core(&db, &id)
}

pub fn reorder_knowledge_articles_core(
    db: &Database,
    article_ids: &[String],
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    for (i, aid) in article_ids.iter().enumerate() {
        conn.execute(
            "UPDATE knowledge_articles SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![i as i32, aid],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_knowledge_articles(
    db: State<'_, Database>,
    article_ids: Vec<String>,
) -> Result<(), String> {
    reorder_knowledge_articles_core(&db, &article_ids)
}

pub fn get_article_summaries_core(
    db: &Database,
    project_id: &str,
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
                .replace('>', " ");
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

#[tauri::command]
pub fn get_article_summaries(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ArticleSummary>, String> {
    get_article_summaries_core(&db, &project_id)
}
