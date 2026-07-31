package repository

import (
	"time"
)

func (db *DB) migrateProjects() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS projects (
			id                TEXT PRIMARY KEY,
			name              TEXT DEFAULT '',
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
		`CREATE TABLE IF NOT EXISTS rejected_clients (
			project_id TEXT NOT NULL,
			client_id  TEXT NOT NULL,
			rejected_at TEXT NOT NULL,
			PRIMARY KEY (project_id, client_id)
		)`,
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	// Add columns that may be missing from older DBs
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN name TEXT DEFAULT ''`)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN description TEXT DEFAULT ''`)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN owner_token TEXT DEFAULT ''`)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active'`)
	db.conn.Exec(`ALTER TABLE project_members ADD COLUMN status TEXT DEFAULT 'active'`)
	return nil
}

func (db *DB) EnsureProject(projectID string) error {
	_, err := db.conn.Exec(
		`INSERT OR IGNORE INTO projects (id, collab_enabled) VALUES (?, 0)`, projectID,
	)
	return err
}

func (db *DB) SetCollabEnabled(projectID string, enabled bool, ownerToken string, name string) error {
	if err := db.EnsureProject(projectID); err != nil {
		return err
	}
	inviteCode := ""
	inviteUpdatedAt := ""
	if enabled {
		inviteCode = generateCode(projectID)
		inviteUpdatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := db.conn.Exec(
		`UPDATE projects SET name = ?, collab_enabled = ?, invite_code = ?, invite_updated_at = ?, owner_token = ? WHERE id = ?`,
		name, boolToInt(enabled), inviteCode, inviteUpdatedAt, ownerToken, projectID,
	)
	return err
}

func (db *DB) GetProject(projectID string) (*struct {
	Name            string
	Description     string
	CollabEnabled   bool
	InviteCode      string
	InviteUpdatedAt string
	OwnerToken      string
	Status          string
}, error) {
	db.EnsureProject(projectID)
	var enabled int
	var code, updatedAt, ownerToken, name, description, status string
	err := db.conn.QueryRow(
		`SELECT COALESCE(name,''), COALESCE(description,''), collab_enabled, invite_code, invite_updated_at, COALESCE(owner_token,''), COALESCE(status,'active') FROM projects WHERE id = ?`, projectID,
	).Scan(&name, &description, &enabled, &code, &updatedAt, &ownerToken, &status)
	if err != nil {
		return nil, err
	}
	return &struct {
		Name            string
		Description     string
		CollabEnabled   bool
		InviteCode      string
		InviteUpdatedAt string
		OwnerToken      string
		Status          string
	}{name, description, enabled == 1, code, updatedAt, ownerToken, status}, nil
}

func (db *DB) SetCollabDeleted(projectID string) error {
	if err := db.EnsureProject(projectID); err != nil {
		return err
	}
	_, err := db.conn.Exec(`UPDATE projects SET status = 'deleted', collab_enabled = 0, invite_code = '' WHERE id = ?`, projectID)
	return err
}

func (db *DB) UpdateProjectInfo(projectID, name, description string) error {
	_, err := db.conn.Exec(`UPDATE projects SET name = ?, description = ? WHERE id = ?`, name, description, projectID)
	return err
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
		`SELECT id FROM projects WHERE invite_code = ? AND collab_enabled = 1 AND COALESCE(status,'active') = 'active'`, code,
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
		 ON CONFLICT(project_id, client_id) DO UPDATE SET display_name = excluded.display_name, status = 'active'`,
		projectID, clientID, displayName,
	)
	return err
}

func (db *DB) IsMember(projectID, clientID string) (bool, error) {
	var count int
	err := db.conn.QueryRow(
		`SELECT COUNT(*) FROM project_members WHERE project_id = ? AND client_id = ? AND COALESCE(status,'active') = 'active'`,
		projectID, clientID).Scan(&count)
	return count > 0, err
}

func (db *DB) RemoveMember(projectID, clientID string) error {
	_, err := db.conn.Exec(`UPDATE project_members SET status = 'removed' WHERE project_id = ? AND client_id = ?`, projectID, clientID)
	return err
}

func (db *DB) GetMemberStatus(projectID, clientID string) (string, error) {
	var status string
	err := db.conn.QueryRow(
		`SELECT COALESCE(status,'active') FROM project_members WHERE project_id = ? AND client_id = ?`,
		projectID, clientID).Scan(&status)
	if err != nil {
		return "", err
	}
	return status, nil
}

func (db *DB) RemoveAllMembers(projectID string) error {
	_, err := db.conn.Exec(`UPDATE project_members SET status = 'removed' WHERE project_id = ? AND status = 'active'`, projectID)
	return err
}

func (db *DB) ListMemberIDs(projectID string) ([]string, error) {
	rows, err := db.conn.Query(`SELECT client_id FROM project_members WHERE project_id = ? AND status = 'active'`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
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
	Status      string `json:"status"`
}, error) {
	rows, err := db.conn.Query(`SELECT client_id, display_name, online, COALESCE(status,'active') FROM project_members WHERE project_id = ? AND COALESCE(status,'active') = 'active'`, projectID)
	if err != nil { return nil, err }
	defer rows.Close()
	var list []struct {
		ClientID    string `json:"client_id"`
		DisplayName string `json:"display_name"`
		Online      bool   `json:"online"`
		Status      string `json:"status"`
	}
	for rows.Next() {
		var m struct {
			ClientID    string `json:"client_id"`
			DisplayName string `json:"display_name"`
			Online      bool   `json:"online"`
			Status      string `json:"status"`
		}
		var o int
		var s string
		if err := rows.Scan(&m.ClientID, &m.DisplayName, &o, &s); err != nil { return nil, err }
		m.Online = o == 1
		m.Status = s
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

func (db *DB) IsPending(projectID, clientID string) (bool, error) {
	var count int
	err := db.conn.QueryRow(
		`SELECT COUNT(*) FROM pending_members WHERE project_id = ? AND client_id = ?`,
		projectID, clientID).Scan(&count)
	return count > 0, err
}

func (db *DB) AddRejected(projectID, clientID string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`INSERT OR REPLACE INTO rejected_clients (project_id, client_id, rejected_at) VALUES (?, ?, ?)`,
		projectID, clientID, now,
	)
	return err
}

func (db *DB) IsRejected(projectID, clientID string) (bool, error) {
	var count int
	err := db.conn.QueryRow(
		`SELECT COUNT(*) FROM rejected_clients WHERE project_id = ? AND client_id = ?`,
		projectID, clientID).Scan(&count)
	return count > 0, err
}

func (db *DB) IsDisplayNameTaken(projectID, displayName string) (bool, error) {
	var count int
	err := db.conn.QueryRow(
		`SELECT COUNT(*) FROM project_members WHERE project_id = ? AND status = 'active' AND display_name = ?`,
		projectID, displayName).Scan(&count)
	return count > 0, err
}

func (db *DB) RemoveRejected(projectID, clientID string) error {
	_, err := db.conn.Exec(`DELETE FROM rejected_clients WHERE project_id = ? AND client_id = ?`, projectID, clientID)
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
