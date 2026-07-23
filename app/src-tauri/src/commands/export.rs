use regex::Regex;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn images_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("projects").join(project_id).join("images"))
}

fn try_pandoc(engine: &str, md_path: &PathBuf, output_path: &str, temp_dir: &PathBuf) -> Result<bool, String> {
    let mut cmd = Command::new("pandoc");
    cmd.arg(md_path)
        .arg("--from=markdown")
        .arg("-o")
        .arg(output_path)
        .arg("--pdf-engine")
        .arg(engine)
        .current_dir(temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if engine == "xelatex" {
        cmd.arg("-V").arg("CJKmainfont=SimSun");
    }

    let output = cmd.output().map_err(|e| format!("运行 Pandoc 失败: {}", e))?;
    Ok(output.status.success())
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
        return Err("Pandoc 未安装。请访问 https://pandoc.org/installing.html 安装后重试。".to_string());
    }

    // Resolve bindle-img references
    let re = Regex::new(r#"bindle-img:([^/\s]+)/([^\s)"\]]+)"#).map_err(|e| e.to_string())?;
    let mut resolved = markdown.clone();
    let temp_dir = std::env::temp_dir().join(format!("bindle_export_{}", Uuid::now_v7()));
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

    let md_path = temp_dir.join("article.md");
    std::fs::write(&md_path, &resolved).map_err(|e| format!("写入临时文件失败: {}", e))?;

    if format == "pdf" {
        // Try engines in order
        for engine in &["xelatex", "wkhtmltopdf", "pdflatex"] {
            match try_pandoc(engine, &md_path, &output_path, &temp_dir) {
                Ok(true) => {
                    let _ = std::fs::remove_dir_all(&temp_dir);
                    return Ok(output_path);
                }
                Ok(false) => continue, // try next engine
                Err(e) => {
                    let _ = std::fs::remove_dir_all(&temp_dir);
                    return Err(e);
                }
            }
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(
            "PDF 导出失败：未找到可用的 PDF 引擎。\n\n请安装以下之一：\n\
             1. MiKTeX (https://miktex.org) — 免费，支持中文\n\
             2. wkhtmltopdf (https://wkhtmltopdf.org)".to_string(),
        );
    }

    // DOCX export
    let result = Command::new("pandoc")
        .arg(&md_path)
        .arg("--from=markdown")
        .arg("-o")
        .arg(&output_path)
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("运行 Pandoc 失败: {}", e))?;

    let _ = std::fs::remove_dir_all(&temp_dir);

    if result.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(format!("Pandoc 导出失败: {}", stderr))
    }
}
