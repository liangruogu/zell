use std::process::{Child, Command};
use std::sync::Mutex;

pub struct ServerState {
    pub child: Mutex<Option<Child>>,
    pub path: Mutex<String>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            path: Mutex::new(String::new()),
        }
    }
}

#[tauri::command]
pub fn start_server(
    state: tauri::State<'_, ServerState>,
    path: Option<String>,
) -> Result<String, String> {
    let mut child = state.child.lock().map_err(|e| e.to_string())?;

    // If already running, return the existing status
    if let Some(ref mut c) = *child {
        match c.try_wait() {
            Ok(Some(_)) => {
                // Process exited, clear it
                *child = None;
            }
            Ok(None) => {
                return Err("服务器已在运行中".into());
            }
            Err(e) => {
                return Err(format!("检查进程状态失败: {}", e));
            }
        }
    }

    // Determine binary path
    let bin_path = path.unwrap_or_else(|| {
        #[cfg(target_os = "windows")]
        { "bindle-server.exe".to_string() }
        #[cfg(not(target_os = "windows"))]
        { "bindle-server".to_string() }
    });

    let mut state_path = state.path.lock().map_err(|e| e.to_string())?;
    *state_path = bin_path.clone();
    drop(state_path);

    let child_process = Command::new(&bin_path)
        .spawn()
        .map_err(|e| format!("启动服务器失败: {}。请确认 {} 文件存在", e, bin_path))?;

    let pid = child_process.id();
    *child = Some(child_process);

    Ok(format!("服务器已启动 (PID: {})", pid))
}

#[tauri::command]
pub fn stop_server(
    state: tauri::State<'_, ServerState>,
) -> Result<String, String> {
    let mut child = state.child.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut c) = *child {
        // Try graceful shutdown first
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(["/PID", &c.id().to_string(), "/F"])
                .creation_flags(0x08000000)
                .spawn();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = c.kill();
        }

        match c.wait() {
            Ok(status) => {
                *child = None;
                Ok(format!("服务器已停止 (退出码: {:?})", status.code()))
            }
            Err(e) => {
                *child = None;
                Err(format!("服务器已停止，但等待退出时出错: {}", e))
            }
        }
    } else {
        Err("服务器未在运行".into())
    }
}

#[tauri::command]
pub fn get_server_status(
    state: tauri::State<'_, ServerState>,
) -> Result<serde_json::Value, String> {
    let mut child = state.child.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut c) = *child {
        match c.try_wait() {
            Ok(Some(status)) => {
                let code = status.code();
                *child = None;
                Ok(serde_json::json!({
                    "running": false,
                    "pid": null,
                    "exit_code": code,
                }))
            }
            Ok(None) => {
                Ok(serde_json::json!({
                    "running": true,
                    "pid": c.id(),
                    "exit_code": null,
                }))
            }
            Err(_) => {
                Ok(serde_json::json!({
                    "running": true,
                    "pid": c.id(),
                    "exit_code": null,
                }))
            }
        }
    } else {
        Ok(serde_json::json!({
            "running": false,
            "pid": null,
            "exit_code": null,
        }))
    }
}
