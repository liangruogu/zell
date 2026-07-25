package repository

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"zell-server/internal/model"
)

func generateCode(projectPrefix string) string {
	b := make([]byte, 4)
	rand.Read(b)
	hash := sha256.Sum256([]byte(projectPrefix + time.Now().UTC().Format("20060102")))
	prefix := hex.EncodeToString(hash[:])[:3]
	suffix := strings.TrimRight(base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b), "=")[:4]
	return fmt.Sprintf("BNDL-%s-%s", prefix, suffix)
}

func (db *DB) CreateInvite(projectID, displayName, role string) (*model.InviteCode, error) {
	prefix := projectID
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	code := generateCode(prefix)
	now := time.Now().UTC().Format(time.RFC3339)
	id := code
	invite := &model.InviteCode{
		ID:          id,
		ProjectID:   projectID,
		Code:        code,
		DisplayName: displayName,
		Role:        role,
		CreatedAt:   now,
	}
	_, err := db.conn.Exec(
		`INSERT INTO invite_codes (id, project_id, code, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
		invite.ID, invite.ProjectID, invite.Code, invite.DisplayName, invite.Role, invite.CreatedAt)
	return invite, err
}

func (db *DB) GetInviteByCode(code string) (*model.InviteCode, error) {
	projectID, err := db.ValidateInviteCode(code)
	if err != nil {
		return nil, err
	}
	return &model.InviteCode{
		ID:        code,
		ProjectID: projectID,
		Code:      code,
		Role:      "editor",
	}, nil
}

func (db *DB) ListInvites(projectID string) ([]model.InviteCode, error) {
	rows, err := db.conn.Query(
		`SELECT id, project_id, code, display_name, role, created_at, expires_at
		 FROM invite_codes WHERE project_id = ? ORDER BY created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invites []model.InviteCode
	for rows.Next() {
		var i model.InviteCode
		if err := rows.Scan(&i.ID, &i.ProjectID, &i.Code, &i.DisplayName, &i.Role, &i.CreatedAt, &i.ExpiresAt); err != nil {
			return nil, err
		}
		invites = append(invites, i)
	}
	if invites == nil {
		invites = []model.InviteCode{}
	}
	return invites, nil
}

func (db *DB) DeleteInvite(id string) error {
	_, err := db.conn.Exec(`DELETE FROM invite_codes WHERE id = ?`, id)
	return err
}

func (db *DB) CreateSession(inviteCodeID, clientID, token, displayName string) (*model.Session, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	id := generateCode("session")
	s := &model.Session{
		ID:           id,
		InviteCodeID: inviteCodeID,
		ClientID:     clientID,
		Token:        token,
		DisplayName:  displayName,
		LastSeen:     now,
		CreatedAt:    now,
	}
	_, err := db.conn.Exec(
		`INSERT INTO sessions (id, invite_code_id, client_id, token, display_name, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.InviteCodeID, s.ClientID, s.Token, s.DisplayName, s.LastSeen, s.CreatedAt)
	return s, err
}

func (db *DB) GetSessionByToken(token string) (*model.Session, error) {
	var s model.Session
	err := db.conn.QueryRow(
		`SELECT id, invite_code_id, client_id, token, display_name, last_seen, created_at FROM sessions WHERE token = ?`, token).
		Scan(&s.ID, &s.InviteCodeID, &s.ClientID, &s.Token, &s.DisplayName, &s.LastSeen, &s.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (db *DB) SaveSnapshot(docID string, state []byte) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`INSERT INTO yjs_snapshots (doc_id, state, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(doc_id) DO UPDATE SET state = ?, updated_at = ?`,
		docID, state, now, state, now)
	return err
}

func (db *DB) GetSnapshot(docID string) ([]byte, error) {
	var state []byte
	err := db.conn.QueryRow(`SELECT state FROM yjs_snapshots WHERE doc_id = ?`, docID).Scan(&state)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return state, err
}
