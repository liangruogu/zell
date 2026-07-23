use regex::Regex;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn images_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("projects").join(project_id).join("images"))
}

#[tauri::command]
pub fn export_article(
    app: AppHandle,
    markdown: String,
    output_path: String,
    format: String,
) -> Result<String, String> {
    // Check pandoc is installed
    let check = Command::new("pandoc").arg("--version").output();
    if check.is_err() {
        return Err(
            "Pandoc 未安装。请访问 https://pandoc.org/installing.html 安装后重试。".to_string(),
        );
    }

    // Resolve bindle-img references
    let re = Regex::new(r#"bindle-img:([^/\s]+)/([^\s)"\]]+)"#).map_err(|e| e.to_string())?;
    let mut resolved = markdown.clone();
    let temp_dir =
        std::env::temp_dir().join(format!("bindle_export_{}", Uuid::now_v7()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    for cap in re.captures_iter(&markdown) {
        let proj_id = &cap[1];
        let file_name = &cap[2];
        let bindle_ref = &cap[0];

        if let Ok(img_dir) = images_dir(&app, proj_id) {
            let src = img_dir.join(file_name);
            if src.exists() {
                let ext = file_name.split('.').last().unwrap_or("png");
                let temp_name = format!("img_{}.{}", Uuid::now_v7(), ext);
                let dest = temp_dir.join(&temp_name);
                if std::fs::copy(&src, &dest).is_ok() {
                    resolved = resolved.replace(bindle_ref, &temp_name);
                }
            }
        }
    }

    // Write resolved markdown to temp file
    let md_path = temp_dir.join("article.md");
    std::fs::write(&md_path, &resolved).map_err(|e| format!("写入临时文件失败: {}", e))?;

    // Run pandoc from the temp directory so relative image paths resolve
    let mut cmd = Command::new("pandoc");
    cmd.arg(&md_path)
        .arg("--from=markdown")
        .arg("-o")
        .arg(&output_path)
        .current_dir(&temp_dir);

    if format == "pdf" {
        cmd.arg("--pdf-engine=xelatex");
    }

    let result = cmd.output();

    // Clean up temp files
    let _ = std::fs::remove_dir_all(&temp_dir);

    match result {
        Ok(output) => {
            if output.status.success() {
                // Verify output file exists and is non-empty
                let meta =
                    std::fs::metadata(&output_path).map_err(|e| format!("输出文件未生成: {}", e))?;
                if meta.len() == 0 {
                    return Err("Pandoc 生成了空文件，请确认已安装必要的 PDF 引擎（如 xelatex）".to_string());
                }
                Ok(output_path)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                let msg = if stderr.is_empty() { stdout } else { stderr };
                Err(format!("Pandoc 导出失败:\n{}", msg))
            }
        }
        Err(e) => Err(format!("运行 Pandoc 失败: {}", e)),
    }
}
