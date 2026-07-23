use crate::db::models::ExternalLink;
use crate::db::Database;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use scraper::{Html, Selector};
use tauri::State;
use uuid::Uuid;

async fn resolve_favicon(url: &str) -> Option<String> {
    let origin = if let Some(end) = url
        .find('/')
        .and_then(|_| url[8..].find('/').map(|j| 8 + j))
    {
        url[..end].to_string()
    } else {
        url.to_string()
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;

    let resp = client.get(url).send().await.ok()?;
    let html = resp.text().await.ok()?;

    let icon_url = {
        let document = Html::parse_document(&html);
        let icon_sel = Selector::parse("link[rel=\"icon\"], link[rel=\"shortcut icon\"]").ok()?;
        let mut url_opt = None;
        for el in document.select(&icon_sel) {
            if let Some(href) = el.value().attr("href") {
                if href.starts_with("http") {
                    url_opt = Some(href.to_string());
                } else if href.starts_with("//") {
                    url_opt = Some(format!("https:{}", href));
                } else if href.starts_with('/') {
                    url_opt = Some(format!("{}{}", origin, href));
                } else {
                    url_opt = Some(format!("{}/{}", origin, href));
                }
                break;
            }
        }
        url_opt.unwrap_or_else(|| format!("{}/favicon.ico", origin))
    };

    let icon_resp = client.get(&icon_url).send().await.ok()?;
    let bytes = icon_resp.bytes().await.ok()?;
    if bytes.is_empty() {
        return None;
    }

    let mime = if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8") {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        "image/svg+xml"
    } else {
        "image/x-icon"
    };

    Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

async fn fetch_page_markdown(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Mozilla/5.0 Bindle/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let html = resp
        .text()
        .await
        .map_err(|e| format!("Read response body failed: {}", e))?;
    // Extract body content only to avoid <head> meta/title noise
    let body_html = {
        let doc = Html::parse_document(&html);
        if let Ok(body_sel) = Selector::parse("body") {
            if let Some(body) = doc.select(&body_sel).next() {
                body.inner_html()
            } else {
                html
            }
        } else {
            html
        }
    };
    let result = html_to_markdown_rs::convert(&body_html, None)
        .map_err(|e| format!("HTML to Markdown conversion failed: {}", e))?;
    Ok(result.content.unwrap_or_default())
}

// --- Tauri commands ---

#[tauri::command]
pub async fn create_external_link(
    db: State<'_, Database>,
    project_id: String,
    title: String,
    url: String,
    description: String,
    link_type: String,
    ai_skill: String,
) -> Result<ExternalLink, String> {
    let id = Uuid::now_v7().to_string();
    let now = Utc::now().to_rfc3339();

    let max_order = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let max_order: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM external_links WHERE project_id = ?1 AND deleted_at IS NULL",
                rusqlite::params![project_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        conn.execute(
            "INSERT INTO external_links (id, project_id, title, url, description, link_type, favicon, ai_skill, sort_order, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,'',?7,?8,?9,?10)",
            rusqlite::params![id, project_id, title, url, description, link_type, ai_skill, max_order + 1, now, now],
        )
        .map_err(|e| e.to_string())?;

        max_order + 1
    };

    let favicon = resolve_favicon(&url).await.unwrap_or_default();

    if !favicon.is_empty() {
        if let Ok(conn) = db.conn.lock() {
            let _ = conn.execute(
                "UPDATE external_links SET favicon=?1 WHERE id=?2",
                rusqlite::params![favicon, id],
            );
        }
    }

    crate::commands::project::touch_project(&db, &project_id);

    Ok(ExternalLink {
        id,
        project_id,
        title,
        url,
        description,
        link_type,
        favicon,
        ai_skill,
        sort_order: max_order,
        sync_status: "idle".to_string(),
        last_synced_at: None,
        last_snapshot: None,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
    })
}

#[tauri::command]
pub fn get_external_links(
    db: State<'_, Database>,
    project_id: String,
) -> Result<Vec<ExternalLink>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, title, url, description, link_type, favicon, ai_skill, sync_status, last_synced_at, last_snapshot, sort_order, created_at, updated_at, deleted_at FROM external_links WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;

    let links = stmt
        .query_map(rusqlite::params![project_id], |row| {
            Ok(ExternalLink {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                url: row.get(3)?,
                description: row.get(4)?,
                link_type: row.get(5)?,
                favicon: row.get(6)?,
                ai_skill: row.get(7)?,
                sync_status: row
                    .get::<_, Option<String>>(8)?
                    .unwrap_or_else(|| "idle".to_string()),
                last_synced_at: row.get(9)?,
                last_snapshot: row.get(10)?,
                sort_order: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
                deleted_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(links)
}

#[tauri::command]
pub fn update_external_link(
    db: State<'_, Database>,
    id: String,
    title: String,
    url: String,
    description: String,
    link_type: String,
    ai_skill: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE external_links SET title=?1, url=?2, description=?3, link_type=?4, ai_skill=?5, updated_at=?6 WHERE id=?7",
        rusqlite::params![title, url, description, link_type, ai_skill, now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_external_link(
    db: State<'_, Database>,
    id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE external_links SET deleted_at = ?1 WHERE id = ?2",
        rusqlite::params![now, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_link(
    db: State<'_, Database>,
    id: String,
) -> Result<ExternalLink, String> {
    let (project_id, url, title, link_type, ai_skill, description, favicon, sort_order, created_at) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT project_id, url, title, link_type, ai_skill, description, favicon, sort_order, created_at FROM external_links WHERE id=?1 AND deleted_at IS NULL",
            rusqlite::params![id],
            |row| Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i32>(7)?,
                row.get::<_, String>(8)?,
            )),
        ).map_err(|e| format!("Link not found: {}", e))?
    };

    let now = Utc::now().to_rfc3339();

    match link_type.as_str() {
        "web" | "github" => {
            let markdown = fetch_page_markdown(&url).await.unwrap_or_else(|e| {
                format!("同步失败: {}", e)
            });
            let is_error = markdown.starts_with("同步失败:");

            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE external_links SET last_snapshot=?1, sync_status=?2, last_synced_at=?3, updated_at=?4 WHERE id=?5",
                rusqlite::params![markdown, if is_error { "error" } else { "synced" }, now, now, id],
            )
            .map_err(|e| e.to_string())?;
            drop(conn);

            crate::commands::project::touch_project(&db, &project_id);

            Ok(ExternalLink {
                id,
                project_id,
                title,
                url,
                description,
                link_type,
                favicon,
                ai_skill,
                sort_order,
                sync_status: if is_error {
                    "error".to_string()
                } else {
                    "synced".to_string()
                },
                last_synced_at: Some(now.clone()),
                last_snapshot: Some(markdown),
                created_at,
                updated_at: now,
                deleted_at: None,
            })
        }
        "figma" | "canva" | "notion" => {
            let msg = if ai_skill.is_empty() {
                "需要配置 API Token".to_string()
            } else {
                format!("此类型({})的 API 同步即将支持", link_type)
            };

            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE external_links SET sync_status='error', last_snapshot=?1, last_synced_at=?2, updated_at=?3 WHERE id=?4",
                rusqlite::params![format!("同步失败: {}", msg), now, now, id],
            )
            .map_err(|e| e.to_string())?;

            let link = conn.query_row(
                "SELECT project_id, url, title, description, link_type, favicon, ai_skill, sort_order, created_at FROM external_links WHERE id=?1",
                rusqlite::params![id],
                |row| Ok(ExternalLink {
                    id: id.clone(),
                    project_id: row.get(0)?,
                    title: row.get(1)?,
                    url: row.get(2)?,
                    description: row.get(3)?,
                    link_type: row.get(4)?,
                    favicon: row.get(5)?,
                    ai_skill: row.get(6)?,
                    sort_order: row.get(7)?,
                    sync_status: "error".to_string(),
                    last_synced_at: Some(now.clone()),
                    last_snapshot: Some(format!("同步失败: {}", msg)),
                    created_at: row.get(8)?,
                    updated_at: now.clone(),
                    deleted_at: None,
                }),
            )
            .map_err(|e| e.to_string())?;
            drop(conn);

            Ok(link)
        }
        _ => {
            // Treat unknown as web
            let markdown = fetch_page_markdown(&url).await.unwrap_or_else(|e| {
                format!("同步失败: {}", e)
            });
            let is_error = markdown.starts_with("同步失败:");

            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE external_links SET last_snapshot=?1, sync_status=?2, last_synced_at=?3, updated_at=?4 WHERE id=?5",
                rusqlite::params![markdown, if is_error { "error" } else { "synced" }, now, now, id],
            )
            .map_err(|e| e.to_string())?;
            drop(conn);

            crate::commands::project::touch_project(&db, &project_id);

            Ok(ExternalLink {
                id,
                project_id,
                title,
                url,
                description,
                link_type,
                favicon,
                ai_skill,
                sort_order,
                sync_status: if is_error {
                    "error".to_string()
                } else {
                    "synced".to_string()
                },
                last_synced_at: Some(now.clone()),
                last_snapshot: Some(markdown),
                created_at,
                updated_at: now,
                deleted_at: None,
            })
        }
    }
}
