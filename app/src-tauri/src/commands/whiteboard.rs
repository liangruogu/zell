use crate::db::models::Whiteboard;
use crate::db::Database;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn create_whiteboard(
    db: State<'_, Database>,
    project_id: String,
    name: String,
) -> Result<Whiteboard, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO whiteboards (id, project_id, name, snapshot, created_at, updated_at) VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
        rusqlite::params![id, project_id, name, now, now],
    )
    .map_err(|e| e.to_string())?;

    crate::commands::project::touch_project(&db, &project_id);

    Ok(Whiteboard {
        id,
        project_id,
        name,
        snapshot: None,
        update_log: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub fn get_whiteboards(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<Whiteboard>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, snapshot, update_log, created_at, updated_at, deleted_at FROM whiteboards WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;

    let boards = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(Whiteboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                snapshot: row.get(3)?,
                update_log: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(boards)
}

#[tauri::command]
pub fn get_whiteboard(
    db: State<'_, Database>,
    id: String,
) -> Result<Whiteboard, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, project_id, name, snapshot, update_log, created_at, updated_at, deleted_at FROM whiteboards WHERE id = ?1 AND deleted_at IS NULL",
        rusqlite::params![id],
        |row| {
            Ok(Whiteboard {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                snapshot: row.get(3)?,
                update_log: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                deleted_at: row.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_whiteboard_snapshot(
    db: State<'_, Database>,
    id: String,
    snapshot: Vec<u8>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE whiteboards SET snapshot = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![snapshot, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_whiteboard(
    db: State<'_, Database>,
    id: String,
    name: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE whiteboards SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_whiteboard(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE whiteboards SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
