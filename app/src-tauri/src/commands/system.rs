use std::net::UdpSocket;

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
