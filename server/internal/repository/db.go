package repository

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func New(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_synchronous=NORMAL")
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		return nil, err
	}
	if err := db.migrateProjects(); err != nil {
		return nil, err
	}
	if err := db.migrateNotifications(); err != nil {
		return nil, err
	}
	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS articles (
			id           TEXT PRIMARY KEY,
			project_id   TEXT NOT NULL,
			title        TEXT NOT NULL,
			content      TEXT DEFAULT '',
			content_json TEXT DEFAULT '',
			parent_id    TEXT DEFAULT NULL,
			sort_order   INTEGER DEFAULT 0,
			version      INTEGER DEFAULT 0,
			created_at   TEXT NOT NULL,
			updated_at   TEXT NOT NULL,
			deleted_at   TEXT DEFAULT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_articles_project ON articles(project_id)`,
		`CREATE TABLE IF NOT EXISTS invite_codes (
			id           TEXT PRIMARY KEY,
			project_id   TEXT NOT NULL,
			code         TEXT NOT NULL UNIQUE,
			display_name TEXT NOT NULL,
			role         TEXT DEFAULT 'editor',
			created_at   TEXT NOT NULL,
			expires_at   TEXT DEFAULT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_invites_project ON invite_codes(project_id)`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id              TEXT PRIMARY KEY,
			invite_code_id  TEXT NOT NULL,
			client_id       TEXT NOT NULL UNIQUE,
			token           TEXT NOT NULL,
			display_name    TEXT NOT NULL,
			last_seen       TEXT NOT NULL,
			created_at      TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS yjs_snapshots (
			doc_id     TEXT PRIMARY KEY,
			state      BLOB NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS publish_config (
			project_id TEXT PRIMARY KEY,
			data       TEXT NOT NULL DEFAULT '{}',
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS publish_articles (
			id           TEXT PRIMARY KEY,
			project_id   TEXT NOT NULL,
			title        TEXT NOT NULL,
			content_html TEXT NOT NULL DEFAULT '',
			updated_at   TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pub_articles_project ON publish_articles(project_id)`,
		`CREATE TABLE IF NOT EXISTS publish_whiteboards (
			id         TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			name       TEXT NOT NULL,
			wb_type    TEXT NOT NULL,
			snapshot   TEXT NOT NULL DEFAULT '{}',
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pub_whiteboards_project ON publish_whiteboards(project_id)`,
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	return nil
}
