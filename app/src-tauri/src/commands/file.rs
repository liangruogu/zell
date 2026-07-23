use crate::db::models::ProjectFile;
use crate::db::Database;
use crate::commands::resource;
use base64::Engine as _;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn files_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(app_data
        .join("projects")
        .join(project_id)
        .join("files"))
}

fn mime_from_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        _ => "application/octet-stream",
    }
}

fn detect_file_type(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "pdf" => "pdf",
        "doc" | "docx" => "docx",
        "ppt" | "pptx" => "pptx",
        "txt" => "txt",
        "md" => "md",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => "image",
        _ => "other",
    }
}

fn extract_text(path: &Path, file_type: &str) -> Result<String, String> {
    match file_type {
        "txt" | "md" => {
            fs::read_to_string(path).map_err(|e| format!("Read failed: {}", e))
        }
        "pdf" => {
            use pdf_oxide::PdfDocument;
            use pdf_oxide::pipeline::{TextPipeline, TextPipelineConfig};
            use pdf_oxide::pipeline::converters::MarkdownOutputConverter;
            use pdf_oxide::pipeline::converters::OutputConverter;
            let path_str = path.to_string_lossy().to_string();
            let mut doc = PdfDocument::open(&path_str).map_err(|e| format!("PDF open failed: {}", e))?;
            let mut all_md = String::new();
            for page_num in 0..doc.page_count().map_err(|e| format!("PDF page count failed: {}", e))? {
                let spans = doc.extract_spans(page_num)
                    .map_err(|e| format!("PDF extract spans failed on page {}: {}", page_num, e))?;
                let config = TextPipelineConfig::default();
                let pipeline = TextPipeline::with_config(config.clone());
                let ordered = pipeline.process(spans, Default::default())
                    .map_err(|e| format!("PDF pipeline failed: {}", e))?;
                let converter = MarkdownOutputConverter::new();
                let md = converter.convert(&ordered, &config)
                    .map_err(|e| format!("PDF markdown convert failed: {}", e))?;
                if page_num > 0 { all_md.push_str("\n\n---\n\n"); }
                all_md.push_str(&md);
            }
            Ok(all_md)
        }
        "docx" | "pptx" => {
            let path_str = path.to_string_lossy().to_string();
            undoc::extract_text(&path_str).map_err(|e| format!("Extract failed: {}", e))
        }
        _ => Ok(String::new()),
    }
}

#[tauri::command]
pub fn import_project_file(
    app: AppHandle,
    db: tauri::State<Database>,
    project_id: String,
    source_path: String,
) -> Result<ProjectFile, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("Source file does not exist".into());
    }
    if !source.is_file() {
        return Err("Source path is not a file".into());
    }

    let original_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let file_type = detect_file_type(&ext).to_string();
    let file_size = source
        .metadata()
        .map(|m| m.len() as i64)
        .unwrap_or(0);

    let dir = files_dir(&app, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stored_name = format!("{}.{}", Uuid::now_v7(), ext);
    let dest = dir.join(&stored_name);
    fs::copy(&source, &dest).map_err(|e| format!("Copy failed: {}", e))?;

    let extracted_text = extract_text(&dest, &file_type).unwrap_or_default();

    let now = Utc::now().to_rfc3339();
    let id = Uuid::now_v7().to_string();

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO project_files (id, project_id, file_name, original_name, file_type, file_size, extracted_text, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        rusqlite::params![id, project_id, stored_name, original_name, file_type, file_size, extracted_text, now],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    // Index document in FTS5
    if !extracted_text.is_empty() {
        let _ = resource::index_document(&db, &project_id, "file", &id, &original_name, &extracted_text);
    }

    crate::commands::project::touch_project(&db, &project_id);

    Ok(ProjectFile {
        id,
        project_id,
        file_name: stored_name,
        original_name,
        file_type,
        file_size,
        extracted_text,
        description: String::new(),
        sort_order: 0,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub fn get_project_files(
    db: tauri::State<Database>,
    project_id: String,
) -> Result<Vec<ProjectFile>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, file_name, original_name, file_type, file_size,
                    extracted_text, description, sort_order,
                    created_at, updated_at, deleted_at
             FROM project_files WHERE project_id = ?1 AND deleted_at IS NULL
             ORDER BY sort_order, created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let files = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(ProjectFile {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_name: row.get(2)?,
                original_name: row.get(3)?,
                file_type: row.get(4)?,
                file_size: row.get(5)?,
                extracted_text: row.get(6)?,
                description: row.get(7)?,
                sort_order: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                deleted_at: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(files)
}

#[tauri::command]
pub fn resolve_project_file(
    app: AppHandle,
    project_id: String,
    file_name: String,
) -> Result<String, String> {
    let dir = files_dir(&app, &project_id)?;
    let path = dir.join(&file_name);

    let bytes = fs::read(&path).map_err(|e| format!("File not found: {}", e))?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let mime = mime_from_ext(ext);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn get_project_file_path(
    app: AppHandle,
    project_id: String,
    file_name: String,
) -> Result<String, String> {
    let dir = files_dir(&app, &project_id)?;
    let path = dir.join(&file_name);
    if !path.exists() {
        return Err("File not found".into());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn update_project_file(
    db: tauri::State<Database>,
    id: String,
    description: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE project_files SET description = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![description, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_project_file(
    app: AppHandle,
    db: tauri::State<Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (project_id, file_name): (String, String) = conn
        .query_row(
            "SELECT project_id, file_name FROM project_files WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let dir = files_dir(&app, &project_id)?;
    let path = dir.join(&file_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Delete file failed: {}", e))?;
    }

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE project_files SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;

    let _ = resource::delete_document_index(&db, "file", &id);

    Ok(())
}

#[tauri::command]
pub fn re_extract_file_text(
    app: AppHandle,
    db: tauri::State<Database>,
    id: String,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let (project_id, file_name, file_type, original_name): (String, String, String, String) = conn
        .query_row(
            "SELECT project_id, file_name, file_type, original_name FROM project_files WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let dir = files_dir(&app, &project_id)?;
    let path = dir.join(&file_name);
    let text = extract_text(&path, &file_type).unwrap_or_default();

    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE project_files SET extracted_text = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![text, now, id],
    )
    .map_err(|e| e.to_string())?;
    drop(conn);

    if !text.is_empty() {
        let _ = resource::index_document(&db, &project_id, "file", &id, &original_name, &text);
    } else {
        let _ = resource::delete_document_index(&db, "file", &id);
    }

    Ok(text)
}

#[tauri::command]
pub fn rename_project_file(
    db: tauri::State<Database>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE project_files SET original_name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_name, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
