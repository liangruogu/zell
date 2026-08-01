package repository

import (
	"testing"

	"zell-server/internal/model"
)

func TestCreateInvite(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	invite, err := db.CreateInvite("p1", "Test Invite", "editor")
	if err != nil {
		t.Fatalf("CreateInvite failed: %v", err)
	}
	if invite.ID == "" {
		t.Error("expected invite ID to be set")
	}
	if invite.Code == "" {
		t.Error("expected invite code to be set")
	}
	if invite.ProjectID != "p1" {
		t.Errorf("expected project_id 'p1', got '%s'", invite.ProjectID)
	}
	if invite.DisplayName != "Test Invite" {
		t.Errorf("expected display_name 'Test Invite', got '%s'", invite.DisplayName)
	}
	if invite.Role != "editor" {
		t.Errorf("expected role 'editor', got '%s'", invite.Role)
	}
	if invite.CreatedAt == "" {
		t.Error("expected CreatedAt to be set")
	}
}

func TestGetInviteByCode(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")
	proj, _ := db.GetProject("p1")

	invite, err := db.GetInviteByCode(proj.InviteCode)
	if err != nil {
		t.Fatalf("GetInviteByCode failed: %v", err)
	}
	if invite.ProjectID != "p1" {
		t.Errorf("expected project_id 'p1', got '%s'", invite.ProjectID)
	}
	if invite.Code != proj.InviteCode {
		t.Errorf("expected code '%s', got '%s'", proj.InviteCode, invite.Code)
	}
}

func TestGetInviteByCodeNotFound(t *testing.T) {
	db := setupTestDB(t)

	_, err := db.GetInviteByCode("INVALID-CODE")
	if err == nil {
		t.Error("expected error for nonexistent invite code")
	}
}

func TestListInvites(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	db.CreateInvite("p1", "Invite 1", "editor")
	db.CreateInvite("p1", "Invite 2", "viewer")
	db.CreateInvite("p2", "Invite 3", "editor")

	invites, err := db.ListInvites("p1")
	if err != nil {
		t.Fatalf("ListInvites failed: %v", err)
	}
	if len(invites) != 2 {
		t.Fatalf("expected 2 invites, got %d", len(invites))
	}
}

func TestListInvitesEmpty(t *testing.T) {
	db := setupTestDB(t)

	invites, err := db.ListInvites("empty-project")
	if err != nil {
		t.Fatalf("ListInvites failed: %v", err)
	}
	if len(invites) != 0 {
		t.Errorf("expected 0 invites, got %d", len(invites))
	}
}

func TestDeleteInvite(t *testing.T) {
	db := setupTestDB(t)

	invite, err := db.CreateInvite("p1", "Test", "editor")
	if err != nil {
		t.Fatalf("CreateInvite failed: %v", err)
	}

	err = db.DeleteInvite(invite.ID)
	if err != nil {
		t.Fatalf("DeleteInvite failed: %v", err)
	}

	invites, _ := db.ListInvites("p1")
	if len(invites) != 0 {
		t.Errorf("expected 0 invites after delete, got %d", len(invites))
	}
}

func TestCreateSession(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	invite, _ := db.CreateInvite("p1", "Test", "editor")
	session, err := db.CreateSession(invite.ID, "client1", "test-token", "Alice")
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}
	if session.ID == "" {
		t.Error("expected session ID to be set")
	}
	if session.InviteCodeID != invite.ID {
		t.Errorf("expected invite_code_id '%s', got '%s'", invite.ID, session.InviteCodeID)
	}
	if session.ClientID != "client1" {
		t.Errorf("expected client_id 'client1', got '%s'", session.ClientID)
	}
	if session.Token != "test-token" {
		t.Errorf("expected token 'test-token', got '%s'", session.Token)
	}
	if session.DisplayName != "Alice" {
		t.Errorf("expected display_name 'Alice', got '%s'", session.DisplayName)
	}
	if session.CreatedAt == "" || session.LastSeen == "" {
		t.Error("expected CreatedAt and LastSeen to be set")
	}
}

func TestGetSessionByToken(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	invite, _ := db.CreateInvite("p1", "Test", "editor")
	created, _ := db.CreateSession(invite.ID, "client1", "unique-token", "Alice")

	session, err := db.GetSessionByToken("unique-token")
	if err != nil {
		t.Fatalf("GetSessionByToken failed: %v", err)
	}
	if session.ID != created.ID {
		t.Errorf("expected session ID '%s', got '%s'", created.ID, session.ID)
	}
	if session.ClientID != "client1" {
		t.Errorf("expected client_id 'client1', got '%s'", session.ClientID)
	}
}

func TestGetSessionByTokenNotFound(t *testing.T) {
	db := setupTestDB(t)

	_, err := db.GetSessionByToken("nonexistent-token")
	if err == nil {
		t.Error("expected error for nonexistent session token")
	}
}

func TestSaveAndGetSnapshot(t *testing.T) {
	db := setupTestDB(t)

	state := []byte(`{"yjs":"state"}`)
	err := db.SaveSnapshot("doc1", state)
	if err != nil {
		t.Fatalf("SaveSnapshot failed: %v", err)
	}

	got, err := db.GetSnapshot("doc1")
	if err != nil {
		t.Fatalf("GetSnapshot failed: %v", err)
	}
	if string(got) != string(state) {
		t.Errorf("expected state '%s', got '%s'", string(state), string(got))
	}
}

func TestGetSnapshotNotFound(t *testing.T) {
	db := setupTestDB(t)

	state, err := db.GetSnapshot("nonexistent")
	if err != nil {
		t.Fatalf("GetSnapshot failed: %v", err)
	}
	if state != nil {
		t.Errorf("expected nil state for nonexistent snapshot, got '%v'", state)
	}
}

func TestSaveSnapshotUpdate(t *testing.T) {
	db := setupTestDB(t)

	db.SaveSnapshot("doc1", []byte(`v1`))
	db.SaveSnapshot("doc1", []byte(`v2`))

	got, _ := db.GetSnapshot("doc1")
	if string(got) != "v2" {
		t.Errorf("expected 'v2', got '%s'", string(got))
	}
}

func TestInviteCodeFormat(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	invite, _ := db.CreateInvite("p1", "Test", "editor")
	if len(invite.Code) < 8 {
		t.Errorf("expected invite code length >= 8, got %d", len(invite.Code))
	}
}

func TestSessionFields(t *testing.T) {
	db := setupTestDB(t)
	db.SetCollabEnabled("p1", true, "token1", "Test")

	invite, _ := db.CreateInvite("p1", "Test", "editor")
	session, err := db.CreateSession(invite.ID, "client1", "token-session", "Bob")
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	var s model.Session
	err = db.conn.QueryRow(
		`SELECT id, invite_code_id, client_id, token, display_name, last_seen, created_at FROM sessions WHERE id = ?`,
		session.ID).
		Scan(&s.ID, &s.InviteCodeID, &s.ClientID, &s.Token, &s.DisplayName, &s.LastSeen, &s.CreatedAt)
	if err != nil {
		t.Fatalf("failed to read session from DB: %v", err)
	}
	if s.ID != session.ID {
		t.Error("mismatched session ID")
	}
	if s.LastSeen != s.CreatedAt {
		t.Error("expected LastSeen to equal CreatedAt on creation")
	}
}
