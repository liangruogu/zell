use crate::db::models::ExternalLink;
use std::fs;
use std::path::Path;

pub struct ResourceSnapshot {
    pub extracted_text: String,
    pub metadata: String,
}

pub trait ResourceProvider: Send + 'static {
    fn resource_type() -> &'static str
    where
        Self: Sized;

    fn sync(&self, link: &ExternalLink) -> Result<ResourceSnapshot, String>;
}

// ── LocalFileProvider ──────────────────────────────────────────────

pub struct LocalFileProvider;

impl ResourceProvider for LocalFileProvider {
    fn resource_type() -> &'static str {
        "file"
    }

    fn sync(&self, link: &ExternalLink) -> Result<ResourceSnapshot, String> {
        let path = Path::new(&link.url);
        if !path.exists() {
            return Err("File not found".into());
        }

        let text = extract_text(path)?;
        let metadata = serde_json::json!({
            "size": path.metadata().map(|m| m.len()).unwrap_or(0),
            "modified": path.metadata().ok().and_then(|m| m.modified().ok()).map(|t| {
                chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
            }),
        })
        .to_string();

        Ok(ResourceSnapshot {
            extracted_text: text,
            metadata,
        })
    }
}

fn extract_text(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "txt" | "md" | "markdown" | "json" | "csv" | "xml" | "html" | "htm" | "css"
        | "js" | "ts" | "rs" | "go" | "py" | "java" | "c" | "cpp" | "h" => {
            fs::read_to_string(path).map_err(|e| format!("Read failed: {}", e))
        }
        "pdf" => {
            pdf_extract::extract_text(path).map_err(|e| format!("PDF extract failed: {}", e))
        }
        "docx" | "pptx" | "xlsx" => {
            // Future: zip+xml parsing
            Ok(String::new())
        }
        _ => Ok(String::new()),
    }
}
