package repository

import (
	"time"
)

func (db *DB) migrateProjects() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS projects (
			id                TEXT PRIMARY KEY,
			collab_enabled    INTEGER DEFAULT 0,
			invite_code       TEXT DEFAULT '',
			invite_updated_at TEXT DEFAULT ''
		)`,
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

func (db *DB) EnsureProject(projectID string) error {
	_, err := db.conn.Exec(
		`INSERT OR IGNORE INTO projects (id, collab_enabled) VALUES (?, 0)`, projectID,
	)
	return err
}

func (db *DB) SetCollabEnabled(projectID string, enabled bool) error {
	db.EnsureProject(projectID)
	inviteCode := ""
	inviteUpdatedAt := ""
	if enabled {
		inviteCode = generateCode(projectID)
		inviteUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := db.conn.Exec(
		`UPDATE projects SET collab_enabled = ?, invite_code = ?, invite_updated_at = ? WHERE id = ?`,
		boolToInt(enabled), inviteCode, inviteUpdatedAt, projectID,
	)
	return err
}

func (db *DB) GetProject(projectID string) (*struct {
	CollabEnabled   bool
	InviteCode      string
	InviteUpdatedAt string
}, error) {
	db.EnsureProject(projectID)
	var enabled int
	var code, updatedAt string
	err := db.conn.QueryRow(
		`SELECT collab_enabled, invite_code, invite_updated_at FROM projects WHERE id = ?`, projectID,
	).Scan(&enabled, &code, &updatedAt)
	if err != nil {
		return nil, err
	}
	return &struct {
		CollabEnabled   bool
		InviteCode      string
		InviteUpdatedAt string
	}{enabled == 1, code, updatedAt}, nil
}

func (db *DB) RotateInviteCode(projectID string) (string, error) {
	code := generateCode(projectID)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`UPDATE projects SET invite_code = ?, invite_updated_at = ? WHERE id = ? AND collab_enabled = 1`,
		code, now, projectID,
	)
	if err != nil {
		return "", err
	}
	return code, nil
}

func (db *DB) ValidateInviteCode(code string) (string, error) {
	var projectID string
	err := db.conn.QueryRow(
		`SELECT id FROM projects WHERE invite_code = ? AND collab_enabled = 1`, code,
	).Scan(&projectID)
	if err != nil {
		return "", err
	}
	return projectID, nil
}

func boolToInt(b bool) int {
	if b { return 1 }
	return 0
}
