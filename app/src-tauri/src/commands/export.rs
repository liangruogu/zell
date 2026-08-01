use regex::Regex;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri::Manager;
use uuid::Uuid;

fn run_with_timeout(cmd: &mut Command, timeout_secs: u64) -> Result<bool, String> {
    let mut child = cmd.spawn().map_err(|e| format!("启动进程失败: {}", e))?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status.success()),
            Ok(None) => {
                if start.elapsed().as_secs() > timeout_secs {
                    let _ = child.kill();
                    return Ok(false);
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(e) => return Err(format!("等待进程失败: {}", e)),
        }
    }
}

fn images_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data.join("projects").join(project_id).join("images"))
}

fn try_pandoc(engine: &str, md_path: &PathBuf, output_path: &str, temp_dir: &PathBuf) -> Result<bool, String> {
    let mut cmd = Command::new("pandoc");
    cmd.arg(md_path)
        .arg("--from=markdown+smart")
        .arg("-o")
        .arg(output_path)
        .arg("--pdf-engine")
        .arg(engine)
        .arg("-V")
        .arg("geometry:margin=2.5cm")
        .arg("-V")
        .arg("linkcolor=blue")
        .current_dir(temp_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if engine == "xelatex" {
        cmd.arg("-V").arg("CJKmainfont=Noto Serif CJK SC")
           .arg("-V").arg("mainfont=Noto Serif")
           .arg("-V").arg("monofont=Noto Sans Mono");
    }

    run_with_timeout(&mut cmd, 30)
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

    // Resolve zell-img references
    let re = Regex::new(r#"zell-img:([^/\s]+)/([^\s)"\]]+)"#).map_err(|e| e.to_string())?;
    let mut resolved = markdown.clone();
    let temp_dir = std::env::temp_dir().join(format!("zell_export_{}", Uuid::now_v7()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    for cap in re.captures_iter(&markdown) {
        let proj_id = &cap[1];
        let file_name = &cap[2];
        let img_ref = &cap[0];
        if let Ok(img_dir) = images_dir(&app, proj_id) {
            let src = img_dir.join(file_name);
            if src.exists() {
                let ext = file_name.split('.').last().unwrap_or("png");
                let temp_name = format!("img_{}.{}", Uuid::now_v7(), ext);
                let dest = temp_dir.join(&temp_name);
                if std::fs::copy(&src, &dest).is_ok() {
                    resolved = resolved.replace(img_ref, &temp_name);
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
                Ok(false) => continue,
                Err(e) => {
                    let _ = std::fs::remove_dir_all(&temp_dir);
                    return Err(e);
                }
            }
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Err(
            "PDF 导出失败。\n\n请安装以下工具之一：\n\n\
             WeasyPrint（推荐，样式和编辑器一致）\n   https://weasyprint.org\n\n\
             Pandoc + TeX 引擎（降级方案）\n   https://pandoc.org/installing.html\n\n\
             Windows 用户可直接下载 .exe 安装包。".to_string(),
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

#[tauri::command]
pub fn export_html_to_pdf(
    html: String,
    output_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join(format!("zell_export_{}", Uuid::now_v7()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let html_path = temp_dir.join("article.html");
    std::fs::write(&html_path, &html).map_err(|e| format!("写入临时文件失败: {}", e))?;

    // Try Chrome headless first (best visual fidelity)
    for chrome in &["google-chrome-stable", "chromium", "chromium-browser", "google-chrome"] {
        let mut cmd = Command::new(chrome);
        cmd.arg("--headless")
            .arg("--disable-gpu")
            .arg("--no-sandbox")
            .arg("--disable-extensions")
            .arg("--disable-dev-shm-usage")
            .arg(format!("--print-to-pdf={}", output_path))
            .arg(html_path.to_str().unwrap_or(""))
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match run_with_timeout(&mut cmd, 15) {
            Ok(true) => {
                let _ = std::fs::remove_dir_all(&temp_dir);
                return Ok(output_path);
            }
            Ok(false) => continue,
            Err(_) => continue,
        }
    }

    // Fallback: weasyprint
    let mut ws_cmd = Command::new("weasyprint");
    ws_cmd.arg(&html_path).arg(&output_path).stdout(Stdio::null()).stderr(Stdio::null());
    if let Ok(true) = run_with_timeout(&mut ws_cmd, 30) {
        let _ = std::fs::remove_dir_all(&temp_dir);
        return Ok(output_path);
    }

    // Fallback: pandoc from stripped HTML
    let text = strip_html(&html);
    let md_path = temp_dir.join("article.md");
    std::fs::write(&md_path, &text).map_err(|e| format!("写入临时文件失败: {}", e))?;

    for engine in &["xelatex", "pdflatex"] {
        if let Ok(true) = try_pandoc(engine, &md_path, &output_path, &temp_dir) {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Ok(output_path);
        }
    }

    let _ = std::fs::remove_dir_all(&temp_dir);
    Err(
        "PDF 导出失败。\n\n请安装以下工具之一：\n\n\
         Google Chrome / Chromium（推荐，样式和编辑器一致）\n\
         WeasyPrint（降级方案）\n   https://weasyprint.org\n\n\
         Windows 用户可直接下载 .exe 安装包。".to_string(),
    )
}

#[tauri::command]
pub fn export_html_to_docx(
    html: String,
    output_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join(format!("zell_export_{}", Uuid::now_v7()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let html_path = temp_dir.join("article.html");
    std::fs::write(&html_path, &html).map_err(|e| format!("写入临时文件失败: {}", e))?;

    let result = Command::new("pandoc")
        .arg(&html_path)
        .arg("--from=html")
        .arg("-o")
        .arg(&output_path)
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!(
            "Pandoc 未安装。\n\n请访问 https://pandoc.org/installing.html 下载安装。\nWindows 用户可直接下载 .exe 安装包。\n\n错误: {}", e))?;

    let _ = std::fs::remove_dir_all(&temp_dir);

    if result.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        Err(format!("DOCX 导出失败: {}", stderr))
    }
}

fn strip_html(html: &str) -> String {
    // Basic HTML tag stripper
    let re_br = Regex::new(r"<br\s*/?>").unwrap();
    let re_tag = Regex::new(r"<[^>]+>").unwrap();
    let text = re_br.replace_all(html, "\n").to_string();
    let text = re_tag.replace_all(&text, "").to_string();
    // Decode common entities
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}
