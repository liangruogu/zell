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
			invite_updated_at TEXT DEFAULT '',
			owner_token       TEXT DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS project_members (
			project_id  TEXT NOT NULL,
			client_id   TEXT NOT NULL,
			display_name TEXT NOT NULL,
			online      INTEGER DEFAULT 1,
			PRIMARY KEY (project_id, client_id)
		)`,
		`CREATE TABLE IF NOT EXISTS pending_members (
			project_id   TEXT NOT NULL,
			client_id    TEXT NOT NULL,
			display_name TEXT NOT NULL,
			created_at   TEXT NOT NULL,
			PRIMARY KEY (project_id, client_id)
		)`,
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	// Add columns that may be missing from older DBs (SQLite has no ADD COLUMN IF NOT EXISTS)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN owner_token TEXT DEFAULT ''`)
	return nil
}

func (db *DB) EnsureProject(projectID string) error {
	_, err := db.conn.Exec(
		`INSERT OR IGNORE INTO projects (id, collab_enabled) VALUES (?, 0)`, projectID,
	)
	return err
}

func (db *DB) SetCollabEnabled(projectID string, enabled bool, ownerToken string) error {
	db.EnsureProject(projectID)
	inviteCode := ""
	inviteUpdatedAt := ""
	if enabled {
		inviteCode = generateCode(projectID)
		inviteUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := db.conn.Exec(
		`UPDATE projects SET collab_enabled = ?, invite_code = ?, invite_updated_at = ?, owner_token = ? WHERE id = ?`,
		boolToInt(enabled), inviteCode, inviteUpdatedAt, ownerToken, projectID,
	)
	return err
}

func (db *DB) GetProject(projectID string) (*struct {
	CollabEnabled   bool
	InviteCode      string
	InviteUpdatedAt string
	OwnerToken      string
}, error) {
	db.EnsureProject(projectID)
	var enabled int
	var code, updatedAt, ownerToken string
	err := db.conn.QueryRow(
		`SELECT collab_enabled, invite_code, invite_updated_at, COALESCE(owner_token,'') FROM projects WHERE id = ?`, projectID,
	).Scan(&enabled, &code, &updatedAt, &ownerToken)
	if err != nil {
		return nil, err
	}
	return &struct {
		CollabEnabled   bool
		InviteCode      string
		InviteUpdatedAt string
		OwnerToken      string
	}{enabled == 1, code, updatedAt, ownerToken}, nil
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

// ── Members ──────────────────────────────────────────────────────────────

func (db *DB) AddMember(projectID, clientID, displayName string) error {
	_, err := db.conn.Exec(
		`INSERT INTO project_members (project_id, client_id, display_name, online) VALUES (?, ?, ?, 0)
		 ON CONFLICT(project_id, client_id) DO UPDATE SET display_name = excluded.display_name`,
		projectID, clientID, displayName,
	)
	return err
}

func (db *DB) RemoveMember(projectID, clientID string) error {
	_, err := db.conn.Exec(`DELETE FROM project_members WHERE project_id = ? AND client_id = ?`, projectID, clientID)
	return err
}

func (db *DB) SetMemberOnline(projectID, clientID string, online bool) error {
	val := 0
	if online { val = 1 }
	_, err := db.conn.Exec(`UPDATE project_members SET online = ? WHERE project_id = ? AND client_id = ?`, val, projectID, clientID)
	return err
}

func (db *DB) ListMembers(projectID string) ([]struct {
	ClientID    string `json:"client_id"`
	DisplayName string `json:"display_name"`
	Online      bool   `json:"online"`
}, error) {
	rows, err := db.conn.Query(`SELECT client_id, display_name, online FROM project_members WHERE project_id = ?`, projectID)
	if err != nil { return nil, err }
	defer rows.Close()
	var list []struct {
		ClientID    string `json:"client_id"`
		DisplayName string `json:"display_name"`
		Online      bool   `json:"online"`
	}
	for rows.Next() {
		var m struct {
			ClientID    string `json:"client_id"`
			DisplayName string `json:"display_name"`
			Online      bool   `json:"online"`
		}
		var o int
		if err := rows.Scan(&m.ClientID, &m.DisplayName, &o); err != nil { return nil, err }
		m.Online = o == 1
		list = append(list, m)
	}
	return list, nil
}

// ── Pending ──────────────────────────────────────────────────────────────

func (db *DB) AddPending(projectID, clientID, displayName string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`INSERT OR IGNORE INTO pending_members (project_id, client_id, display_name, created_at) VALUES (?, ?, ?, ?)`,
		projectID, clientID, displayName, now,
	)
	return err
}

func (db *DB) RemovePending(projectID, clientID string) error {
	_, err := db.conn.Exec(`DELETE FROM pending_members WHERE project_id = ? AND client_id = ?`, projectID, clientID)
	return err
}

func (db *DB) ListPending(projectID string) ([]struct {
	ClientID    string `json:"client_id"`
	DisplayName string `json:"display_name"`
	CreatedAt   string `json:"created_at"`
}, error) {
	rows, err := db.conn.Query(`SELECT client_id, display_name, created_at FROM pending_members WHERE project_id = ?`, projectID)
	if err != nil { return nil, err }
	defer rows.Close()
	var list []struct {
		ClientID    string `json:"client_id"`
		DisplayName string `json:"display_name"`
		CreatedAt   string `json:"created_at"`
	}
	for rows.Next() {
		var p struct {
			ClientID    string `json:"client_id"`
			DisplayName string `json:"display_name"`
			CreatedAt   string `json:"created_at"`
		}
		if err := rows.Scan(&p.ClientID, &p.DisplayName, &p.CreatedAt); err != nil { return nil, err }
		list = append(list, p)
	}
	return list, nil
}

func boolToInt(b bool) int {
	if b { return 1 }
	return 0
}
