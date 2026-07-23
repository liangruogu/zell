#[tauri::command]
pub fn open_in_system(file_path: String) -> Result<(), String> {
    opener::open(&file_path).map_err(|e| format!("Failed to open file: {}", e))
}
