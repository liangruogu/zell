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

fn find_pdf_engine() -> Option<&'static str> {
    // Check available engines in preference order
    for engine in &["xelatex", "wkhtmltopdf", "pdflatex"] {
        let check = if *engine == "wkhtmltopdf" {
            Command::new("wkhtmltopdf").arg("--version").output()
        } else {
            Command::new(engine).arg("--version").output()
        };
        if check.is_ok() && check.unwrap().status.success() {
            if *engine == "xelatex" {
                // xelatex: auto-detect available Chinese fonts
                return Some("xelatex");
            }
            return Some(engine);
        }
    }
    None
}

fn run_pandoc(md_path: &PathBuf, output_path: &str, temp_dir: &PathBuf, format: &str) -> Result<(), String> {
    if format == "pdf" {
        let engine = find_pdf_engine().ok_or_else(|| {
            "未找到可用的 PDF 引擎。请安装以下之一：\n\
             - MiKTeX (https://miktex.org) — 推荐，支持中文\n\
             - wkhtmltopdf (https://wkhtmltopdf.org)".to_string()
        })?;

        let mut cmd = Command::new("pandoc");
        cmd.arg(md_path)
            .arg("--from=markdown")
            .arg("-o")
            .arg(output_path)
            .arg("--pdf-engine")
            .arg(engine)
            .current_dir(temp_dir);

        if engine == "xelatex" {
            cmd.arg("-V").arg("CJKmainfont=SimSun");
        }

        let result = cmd.output().map_err(|e| format!("运行 Pandoc 失败: {}", e))?;
        if result.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(format!("PDF 导出失败 (引擎: {}):\n{}", engine, stderr.trim()));
    }

    let result = Command::new("pandoc")
        .arg(md_path)
        .arg("--from=markdown")
        .arg("-o")
        .arg(output_path)
        .current_dir(temp_dir)
        .output()
        .map_err(|e| format!("运行 Pandoc 失败: {}", e))?;
    if result.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&result.stderr);
    Err(format!("Pandoc 导出失败: {}", stderr))
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
            "Pandoc 未安装。请访问 https://pandoc.org/installing.html 安装后重试。\n\n安装步骤：\n1. 下载 pandoc 安装包\n2. 运行安装程序\n3. 如需导出 PDF，还需安装 MiKTeX 或 wkhtmltopdf\n4. 重启 Bindle".to_string(),
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

    run_pandoc(&md_path, &output_path, &temp_dir, &format)?;

    // Clean up temp files
    let _ = std::fs::remove_dir_all(&temp_dir);

    // Verify output
    let meta =
        std::fs::metadata(&output_path).map_err(|e| format!("输出文件未生成: {}", e))?;
    if meta.len() == 0 {
        return Err("Pandoc 生成了空文件".to_string());
    }
    Ok(output_path)
}
