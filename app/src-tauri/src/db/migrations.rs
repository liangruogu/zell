use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            description TEXT DEFAULT '',
            background  TEXT DEFAULT '',
            icon        TEXT DEFAULT '',
            settings    TEXT DEFAULT '{}',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS knowledge_articles (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id),
            title       TEXT NOT NULL,
            content     TEXT DEFAULT '',
            content_json TEXT DEFAULT '{}',
            parent_id   TEXT DEFAULT NULL,
            sort_order  INTEGER DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT DEFAULT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_articles(project_id);

        CREATE TABLE IF NOT EXISTS external_links (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id),
            title       TEXT NOT NULL,
            url         TEXT NOT NULL,
            description TEXT DEFAULT '',
            link_type   TEXT DEFAULT 'web',
            favicon     TEXT DEFAULT '',
            ai_skill    TEXT DEFAULT '',
            sort_order  INTEGER DEFAULT 0,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT DEFAULT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_links_project ON external_links(project_id);

        CREATE TABLE IF NOT EXISTS whiteboards (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id),
            name        TEXT NOT NULL,
            snapshot    TEXT DEFAULT NULL,
            update_log  BLOB DEFAULT NULL,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            deleted_at  TEXT DEFAULT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_whiteboard_project ON whiteboards(project_id);

        CREATE TABLE IF NOT EXISTS ai_conversations (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id),
            source_type TEXT NOT NULL,
            source_id   TEXT DEFAULT NULL,
            selected_text TEXT DEFAULT NULL,
            messages    TEXT DEFAULT '[]',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_project ON ai_conversations(project_id);

        CREATE TABLE IF NOT EXISTS invite_codes (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL REFERENCES projects(id),
            code        TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            role        TEXT DEFAULT 'editor',
            created_at  TEXT NOT NULL,
            expires_at  TEXT DEFAULT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_invite_project ON invite_codes(project_id);

        CREATE TABLE IF NOT EXISTS settings (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_files (
            id              TEXT PRIMARY KEY,
            project_id      TEXT NOT NULL REFERENCES projects(id),
            file_name       TEXT NOT NULL,
            original_name  TEXT NOT NULL,
            file_type       TEXT NOT NULL,
            file_size       INTEGER DEFAULT 0,
            extracted_text  TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            ai_skill        TEXT DEFAULT '',
            sort_order      INTEGER DEFAULT 0,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL,
            deleted_at      TEXT DEFAULT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);
        ",
    )?;

    // FTS5 full-text search for documents
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS document_search USING fts5(
            title,
            content,
            source_type,
            source_id UNINDEXED,
            project_id UNINDEXED,
            tokenize='unicode61'
        );",
    )
    .or_else(|_| Ok::<_, rusqlite::Error>(()))?;

    // Migration: add sync fields to external_links
    conn.execute_batch(
        "
        ALTER TABLE external_links ADD COLUMN sync_status TEXT DEFAULT 'idle';
        ALTER TABLE external_links ADD COLUMN last_synced_at TEXT DEFAULT NULL;
        ALTER TABLE external_links ADD COLUMN last_snapshot TEXT DEFAULT NULL;
        ",
    )
    .or_else(|_| {
        // columns may already exist, ignore
        Ok::<_, rusqlite::Error>(())
    })?;

    // Migration: add watch folder column to projects
    conn.execute_batch(
        "ALTER TABLE projects ADD COLUMN watch_folder TEXT DEFAULT NULL;",
    )
    .or_else(|_| Ok::<_, rusqlite::Error>(()))?;

    // Migration: re-index existing knowledge articles into FTS5
    {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, content FROM knowledge_articles WHERE deleted_at IS NULL",
        )?;
        let rows: Vec<(String, String, String, String)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();

        for (id, project_id, title, content) in rows {
            // Delete old entry then insert
            conn.execute(
                "DELETE FROM document_search WHERE source_type='knowledge' AND source_id=?1",
                rusqlite::params![id],
            )
            .ok();
            conn.execute(
                "INSERT INTO document_search (title, content, source_type, source_id, project_id) VALUES (?1, ?2, 'knowledge', ?3, ?4)",
                rusqlite::params![title, content, id, project_id],
            )
            .ok();
        }
    }

    // Migration: add title column to ai_conversations
    conn.execute_batch(
        "ALTER TABLE ai_conversations ADD COLUMN title TEXT DEFAULT '';",
    )
    .or_else(|_| {
        // column may already exist, ignore
        Ok::<_, rusqlite::Error>(())
    })?;

    Ok(())
}
