use crate::db::models::ExternalLink;
use crate::db::Database;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn create_external_link(
    db: State<'_, Database>,
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

    crate::commands::project::touch_project(&db, &project_id);

    Ok(ExternalLink {
        id, project_id, title, url, description, link_type,
        favicon: String::new(), ai_skill, sort_order: max_order + 1,
        sync_status: "idle".to_string(), last_synced_at: None, last_snapshot: None,
        created_at: now.clone(), updated_at: now, deleted_at: None,
    })
}

#[tauri::command]
pub fn get_external_links(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ExternalLink>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, title, url, description, link_type, favicon, ai_skill, sort_order, created_at, updated_at, deleted_at FROM external_links WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;

    let links = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(ExternalLink {
                id: row.get(0)?, project_id: row.get(1)?, title: row.get(2)?,
                url: row.get(3)?, description: row.get(4)?, link_type: row.get(5)?,
                favicon: row.get(6)?, ai_skill: row.get(7)?, sort_order: row.get(8)?,
                sync_status: "idle".to_string(), last_synced_at: None, last_snapshot: None,
                created_at: row.get(9)?, updated_at: row.get(10)?, deleted_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(links)
}

#[tauri::command]
pub fn update_external_link(
    db: State<'_, Database>,
    id: String,
    title: String,
    url: String,
    description: String,
    link_type: String,
    ai_skill: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE external_links SET title=?1, url=?2, description=?3, link_type=?4, ai_skill=?5, updated_at=?6 WHERE id=?7",
        rusqlite::params![title, url, description, link_type, ai_skill, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_external_link(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE external_links SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
