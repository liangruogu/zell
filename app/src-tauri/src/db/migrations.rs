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
            snapshot    BLOB DEFAULT NULL,
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
        ",
    )?;

    Ok(())
}
