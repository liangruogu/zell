use base64::Engine as _;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn images_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("projects").join(project_id).join("images"))
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

#[derive(Debug, Clone, Serialize)]
pub struct SavedImage {
    pub file_name: String,
}

#[tauri::command]
pub fn save_project_image(
    app: AppHandle,
    project_id: String,
    source_path: String,
) -> Result<SavedImage, String> {
    let source = std::path::Path::new(&source_path);
    if !source.exists() {
        return Err("Source file does not exist".into());
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let dir = images_dir(&app, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stored_name = format!("{}.{}", Uuid::now_v7(), ext);
    let dest = dir.join(&stored_name);
    fs::copy(&source, &dest).map_err(|e| format!("Copy failed: {}", e))?;

    Ok(SavedImage {
        file_name: stored_name,
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

    let bytes = fs::read(&path).map_err(|e| format!("File not found: {}", e))?;
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
        fs::remove_file(&path).map_err(|e| format!("Delete failed: {}", e))?;
    }
    Ok(())
}
