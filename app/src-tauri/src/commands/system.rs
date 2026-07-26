use std::net::UdpSocket;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn open_in_system(file_path: String) -> Result<(), String> {
    opener::open(&file_path).map_err(|e| format!("Failed to open file: {}", e))
}

#[tauri::command]
pub fn get_local_ip() -> Result<String, String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    socket.connect("8.8.8.8:80").map_err(|e| e.to_string())?;
    let addr = socket.local_addr().map_err(|e| e.to_string())?;
    Ok(addr.ip().to_string())
}

#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    let font_dirs = if cfg!(target_os = "windows") {
        vec![Path::new("C:\\Windows\\Fonts").to_path_buf()]
    } else if cfg!(target_os = "macos") {
        vec![
            Path::new("/System/Library/Fonts").to_path_buf(),
            Path::new("/Library/Fonts").to_path_buf(),
            Path::new(&format!("{}/Library/Fonts", std::env::var("HOME").unwrap_or_default())).to_path_buf(),
        ]
    } else {
        vec![
            Path::new("/usr/share/fonts").to_path_buf(),
            Path::new("/usr/local/share/fonts").to_path_buf(),
            Path::new(&format!("{}/.fonts", std::env::var("HOME").unwrap_or_default())).to_path_buf(),
        ]
    };

    let mut fonts = Vec::new();
    for dir in &font_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    let ext = ext.to_string_lossy().to_lowercase();
                    if ext == "ttf" || ext == "otf" || ext == "ttc" {
                        let name = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();
                        if !fonts.contains(&name) {
                            fonts.push(name);
                        }
                    }
                }
            }
        }
    }
    fonts.sort();
    Ok(fonts)
}
