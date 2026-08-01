use crate::db::models::AiConversation;
use crate::db::Database;
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

pub fn create_ai_conversation_core(
    db: &Database,
    project_id: String,
    source_type: String,
) -> Result<AiConversation, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ai_conversations (id, project_id, source_type, messages, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5)",
        rusqlite::params![id, project_id, source_type, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(AiConversation {
        id,
        project_id,
        source_type,
        source_id: None,
        selected_text: None,
        messages: "[]".to_string(),
        title: String::new(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub fn create_ai_conversation(
    db: State<'_, Database>,
    project_id: String,
    source_type: String,
) -> Result<AiConversation, String> {
    create_ai_conversation_core(&db, project_id, source_type)
}

pub fn get_ai_conversations_core(
    db: &Database,
    project_id: &str,
) -> Result<Vec<AiConversation>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, source_type, source_id, selected_text, messages, title, created_at, updated_at FROM ai_conversations WHERE project_id = ?1 ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let conversations = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(AiConversation {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_type: row.get(2)?,
                source_id: row.get(3)?,
                selected_text: row.get(4)?,
                messages: row.get(5)?,
                title: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(conversations)
}

#[tauri::command]
pub fn get_ai_conversations(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<AiConversation>, String> {
    get_ai_conversations_core(&db, &project_id)
}

pub fn save_ai_conversation_core(
    db: &Database,
    id: &str,
    messages_json: String,
    title: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE ai_conversations SET messages = ?1, title = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![messages_json, title, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_ai_conversation(
    db: State<'_, Database>,
    id: String,
    messages_json: String,
    title: String,
) -> Result<(), String> {
    save_ai_conversation_core(&db, &id, messages_json, title)
}

pub fn delete_ai_conversation_core(
    db: &Database,
    id: &str,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM ai_conversations WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_ai_conversation(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    delete_ai_conversation_core(&db, &id)
}

pub fn get_ai_conversation_core(
    db: &Database,
    id: &str,
) -> Result<AiConversation, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, project_id, source_type, source_id, selected_text, messages, title, created_at, updated_at FROM ai_conversations WHERE id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(AiConversation {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_type: row.get(2)?,
                source_id: row.get(3)?,
                selected_text: row.get(4)?,
                messages: row.get(5)?,
                title: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_conversation(
    db: State<'_, Database>,
    id: String,
) -> Result<AiConversation, String> {
    get_ai_conversation_core(&db, &id)
}
