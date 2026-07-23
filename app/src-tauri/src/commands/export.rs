use std::process::Command;

#[tauri::command]
pub fn export_article(
    markdown: String,
    output_path: String,
    format: String,
) -> Result<String, String> {
    // Check pandoc is installed
    let check = Command::new("pandoc").arg("--version").output();
    if check.is_err() {
        return Err("Pandoc 未安装。请访问 https://pandoc.org/installing.html 安装后重试。".to_string());
    }

    // Write markdown to temp file
    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join(format!("bindle_export_{}.md", uuid::Uuid::now_v7()));
    std::fs::write(&temp_path, &markdown).map_err(|e| format!("写入临时文件失败: {}", e))?;

    let result = match format.as_str() {
        "pdf" => Command::new("pandoc")
            .arg(temp_path.to_str().unwrap_or(""))
            .arg("-o")
            .arg(&output_path)
            .arg("--pdf-engine=xelatex")
            .output(),
        "docx" => Command::new("pandoc")
            .arg(temp_path.to_str().unwrap_or(""))
            .arg("-o")
            .arg(&output_path)
            .output(),
        _ => return Err(format!("不支持的格式: {}", format)),
    };

    // Clean up temp file
    let _ = std::fs::remove_file(&temp_path);

    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(output_path)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Pandoc 导出失败: {}", stderr))
            }
        }
        Err(e) => Err(format!("运行 Pandoc 失败: {}", e)),
    }
}
