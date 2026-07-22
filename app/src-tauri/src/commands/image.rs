use base64::Engine as _;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn images_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(app_data
        .join("projects")
        .join(project_id)
        .join("images"))
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
        _ => "application/octet-stream",
    }
}

pub fn detect_media_type_name(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" => "image",
        "mp4" | "mov" | "webm" | "avi" | "mkv" => "video",
        "mp3" | "wav" | "ogg" | "flac" | "aac" => "audio",
        "pdf" => "pdf",
        "doc" | "docx" => "docx",
        "ppt" | "pptx" => "pptx",
        "txt" => "txt",
        "md" => "md",
        _ => "other",
    }
}

#[derive(serde::Serialize)]
pub struct SaveImageResult {
    pub file_name: String,
    pub data_url: String,
}

#[tauri::command]
pub fn save_project_image(
    app: AppHandle,
    project_id: String,
    data: String,
    ext: String,
) -> Result<SaveImageResult, String> {
    let dir = images_dir(&app, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| e.to_string())?;

    let file_name = format!("{}.{}", Uuid::now_v7(), ext);
    let path = dir.join(&file_name);
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;

    let mime = mime_from_ext(&ext);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    Ok(SaveImageResult {
        file_name,
        data_url,
    })
}

#[tauri::command]
pub fn resolve_project_image(
    app: AppHandle,
    project_id: String,
    file_name: String,
) -> Result<String, String> {
    let dir = images_dir(&app, &project_id)?;
    let path = dir.join(&file_name);

    let bytes = fs::read(&path).map_err(|e| format!("Image not found: {}", e))?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = mime_from_ext(ext);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn delete_project_image(
    app: AppHandle,
    project_id: String,
    file_name: String,
) -> Result<(), String> {
    let dir = images_dir(&app, &project_id)?;
    let path = dir.join(&file_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileBase64Result {
    pub base64: String,
    pub ext: String,
    pub mime_type: String,
    pub file_size: u64,
}

#[tauri::command]
pub fn read_file_base64(source_path: String) -> Result<FileBase64Result, String> {
    let path = Path::new(&source_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let bytes = fs::read(&path).map_err(|e| format!("Read failed: {}", e))?;
    let file_size = bytes.len() as u64;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = mime_from_ext(&ext).to_string();

    Ok(FileBase64Result {
        base64: b64,
        ext,
        mime_type,
        file_size,
    })
}

#[derive(serde::Serialize)]
pub struct ImportMediaResult {
    pub file_name: String,
    pub data_url: String,
    pub media_type: String,      // image | video | audio | document | other
    pub original_name: String,
    pub file_size: u64,
    pub project_file_id: Option<String>,
}

#[tauri::command]
pub fn import_whiteboard_media(
    app: AppHandle,
    project_id: String,
    source_path: String,
) -> Result<ImportMediaResult, String> {
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("File does not exist".into());
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

    let bytes = fs::read(&source).map_err(|e| format!("Read failed: {}", e))?;
    let file_size = bytes.len() as u64;
    let media_type = detect_media_type_name(&ext).to_string();
    let stored_name = format!("{}.{}", Uuid::now_v7(), ext);

    if media_type == "image" {
        let dir = images_dir(&app, &project_id)?;
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let dest = dir.join(&stored_name);
        fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

        let mime = mime_from_ext(&ext);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let data_url = format!("data:{};base64,{}", mime, b64);

        Ok(ImportMediaResult {
            file_name: stored_name,
            data_url,
            media_type,
            original_name,
            file_size,
            project_file_id: None,
        })
    } else {
        // For non-image files: copy to files dir + insert into project_files table
        let db = app.try_state::<crate::db::Database>();
        if let Some(db) = db {
            let files_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("projects")
                .join(&project_id)
                .join("files");
            fs::create_dir_all(&files_dir).map_err(|e| e.to_string())?;
            let dest = files_dir.join(&stored_name);
            fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

            let now = chrono::Utc::now().to_rfc3339();
            let id = Uuid::now_v7().to_string();
            let file_type = if media_type == "video" || media_type == "audio" {
                media_type.clone()
            } else {
                ext.clone()
            };

            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO project_files (id, project_id, file_name, original_name, file_type, file_size, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                rusqlite::params![id, project_id, stored_name, original_name, file_type, file_size as i64, now],
            )
            .map_err(|e| e.to_string())?;

            Ok(ImportMediaResult {
                file_name: stored_name,
                data_url: String::new(),
                media_type,
                original_name,
                file_size,
                project_file_id: Some(id),
            })
        } else {
            // Fallback: just copy to files dir without DB record
            let files_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("projects")
                .join(&project_id)
                .join("files");
            fs::create_dir_all(&files_dir).map_err(|e| e.to_string())?;
            let dest = files_dir.join(&stored_name);
            fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

            Ok(ImportMediaResult {
                file_name: stored_name,
                data_url: String::new(),
                media_type,
                original_name,
                file_size,
                project_file_id: None,
            })
        }
    }
}
