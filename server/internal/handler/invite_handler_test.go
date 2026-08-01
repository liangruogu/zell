package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"zell-server/internal/config"
	"zell-server/internal/middleware"
	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func setupInviteTest(t *testing.T) (*gin.Engine, *repository.DB) {
	gin.SetMode(gin.TestMode)
	db, err := repository.NewInMemory()
	if err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	hub := ws.NewHub(nil, nil)
	go hub.Run()

	inviteH := NewInviteHandler(db, "test-secret", hub)

	r := gin.New()

	// JWT auth middleware for member-only endpoints
	auth := middleware.AuthMiddleware(&config.Config{JWTSecret: "test-secret"})

	r.POST("/api/v1/projects/:pid/collab", inviteH.CollabToggle)
	r.GET("/api/v1/projects/:pid/info", inviteH.GetProjectInfo)
	r.PUT("/api/v1/projects/:pid/info", inviteH.UpdateProjectInfo)
	r.GET("/api/v1/projects/:pid/invite", inviteH.GetInvite)
	r.GET("/api/v1/projects/:pid/invite-jwt", inviteH.GetInviteJWT)
	r.POST("/api/v1/projects/:pid/rotate-invite", inviteH.RotateInvite)
	r.POST("/api/v1/projects/:pid/join", inviteH.Join)

	member := r.Group("/api/v1/projects/:pid")
	member.Use(auth)
	{
		member.GET("/members", inviteH.ListMembers)
		member.DELETE("/members/:client_id", inviteH.RemoveMember)
		member.POST("/leave", inviteH.Leave)
		member.GET("/notifications", inviteH.Notifications)
		member.GET("/status", inviteH.Status)
	}

	return r, db
}

func makeMemberJWT(secret, sub, projectID string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":        sub,
		"project_id": projectID,
		"iat":        time.Now().Unix(),
		"exp":        time.Now().Add(time.Hour).Unix(),
	})
	s, _ := token.SignedString([]byte(secret))
	return s
}

func TestCollabToggleEnable(t *testing.T) {
	r, db := setupInviteTest(t)

	body := `{"enabled":true,"owner_token":"owner1","name":"Test Project"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/collab", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	proj, err := db.GetProject("p1")
	if err != nil {
		t.Fatalf("GetProject failed: %v", err)
	}
	if !proj.CollabEnabled {
		t.Error("expected collab to be enabled")
	}
	if proj.Name != "Test Project" {
		t.Errorf("expected name 'Test Project', got '%s'", proj.Name)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["invite_code"] == "" {
		t.Error("expected invite_code in response")
	}
}

func TestCollabToggleDisable(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")

	body := `{"enabled":false,"owner_token":"owner1","name":"Test"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/collab", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	proj, _ := db.GetProject("p1")
	if proj.CollabEnabled {
		t.Error("expected collab to be disabled")
	}
}

func TestCollabToggleDeleted(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "member1", "Member One")

	body := `{"enabled":true,"owner_token":"owner1","name":"Test","deleted":true}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/collab", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	proj, _ := db.GetProject("p1")
	if proj.Status != "deleted" {
		t.Errorf("expected project status 'deleted', got '%s'", proj.Status)
	}

	memberIDs, _ := db.ListMemberIDs("p1")
	if len(memberIDs) != 0 {
		t.Errorf("expected 0 active members after delete, got %d", len(memberIDs))
	}

	notifs, _ := db.GetNotifications("member1")
	if len(notifs) != 1 {
		t.Errorf("expected 1 notification for member, got %d", len(notifs))
	}
}

func TestCollabToggleInvalidJSON(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/collab", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetProjectInfo(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "My Project")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/info", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["name"] != "My Project" {
		t.Errorf("expected name 'My Project', got '%v'", resp["name"])
	}
}

func TestGetProjectInfoAutoCreated(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/newproj/info", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 (project auto-created), got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["name"] != "" {
		t.Errorf("expected empty name for auto-created project, got '%v'", resp["name"])
	}
}

func TestUpdateProjectInfo(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Old Name")

	body := `{"name":"New Name","description":"A test project","config":"{\"key\":\"val\"}"}`
	req := httptest.NewRequest("PUT", "/api/v1/projects/p1/info", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	proj, _ := db.GetProject("p1")
	if proj.Name != "New Name" {
		t.Errorf("expected name 'New Name', got '%s'", proj.Name)
	}
}

func TestUpdateProjectInfoInvalidJSON(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("PUT", "/api/v1/projects/p1/info", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetInvite(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/invite", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["invite_code"] == "" {
		t.Error("expected invite_code in response")
	}
}

func TestGetInviteNotEnabled(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/invite", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestRotateInvite(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	oldProj, _ := db.GetProject("p1")
	oldCode := oldProj.InviteCode

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/rotate-invite", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	proj, _ := db.GetProject("p1")
	if proj.InviteCode == oldCode {
		t.Error("expected invite code to change after rotate")
	}
}

func TestRotateInviteNotEnabled(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/rotate-invite", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 (rotate always succeeds), got %d", w.Code)
	}
}

func TestJoin(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("proj0001", true, "owner1", "Test")
	proj, _ := db.GetProject("proj0001")

	bodyBytes, _ := json.Marshal(map[string]string{
		"code":         proj.InviteCode,
		"client_id":    "client-123",
		"display_name": "Alice",
	})
	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "approved" {
		t.Errorf("expected status 'approved', got '%v'", resp["status"])
	}
	if resp["token"] == "" {
		t.Error("expected token in response")
	}

	isMember, _ := db.IsMember("proj0001", "client-123")
	if !isMember {
		t.Error("expected client to be a member")
	}
}

func TestJoinInvalidCode(t *testing.T) {
	r, _ := setupInviteTest(t)

	bodyBytes, _ := json.Marshal(map[string]string{
		"code":         "BAD-CODE",
		"client_id":    "client-123",
		"display_name": "Alice",
	})
	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d: %s", w.Code, w.Body.String())
	}
}

func TestJoinInvalidJSON(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestJoinDuplicateDisplayName(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("proj0001", true, "owner1", "Test")
	db.AddMember("proj0001", "client-456", "Alice")
	proj, _ := db.GetProject("proj0001")

	bodyBytes, _ := json.Marshal(map[string]string{
		"code":         proj.InviteCode,
		"client_id":    "client-789",
		"display_name": "Alice",
	})
	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected 409, got %d: %s", w.Code, w.Body.String())
	}
}

func TestJoinAlreadyMember(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("proj0001", true, "owner1", "Test")
	db.AddMember("proj0001", "client-123", "Alice")
	proj, _ := db.GetProject("proj0001")

	bodyBytes, _ := json.Marshal(map[string]string{
		"code":         proj.InviteCode,
		"client_id":    "client-123",
		"display_name": "Alice",
	})
	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "already_member" {
		t.Errorf("expected status 'already_member', got '%v'", resp["status"])
	}
}

func TestListMembers(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "c1", "Alice")
	db.AddMember("p1", "c2", "Bob")

	// ListMembers requires JWT auth
	jwt := makeMemberJWT("test-secret", "user1", "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/members", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var members []map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &members)
	if len(members) != 2 {
		t.Errorf("expected 2 members, got %d", len(members))
	}
}

func TestListMembersUnauthenticated(t *testing.T) {
	r, _ := setupInviteTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/members", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestRemoveMember(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "c1", "Alice")

	jwt := makeMemberJWT("test-secret", "owner1", "p1")

	req := httptest.NewRequest("DELETE", "/api/v1/projects/p1/members/c1", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	isMember, _ := db.IsMember("p1", "c1")
	if isMember {
		t.Error("expected member to be removed")
	}
}

func TestLeave(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "c1", "Alice")

	jwt := makeMemberJWT("test-secret", "c1", "p1")

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/leave", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	isMember, _ := db.IsMember("p1", "c1")
	if isMember {
		t.Error("expected member to be gone after leave")
	}
}

func TestNotifications(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "c1", "Alice")
	db.CreateNotification("p1", "c1", "test_event", "{}")

	jwt := makeMemberJWT("test-secret", "c1", "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/notifications", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string][]repository.Notification
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp["notifications"]) != 1 {
		t.Errorf("expected 1 notification, got %d", len(resp["notifications"]))
	}
}

func TestStatusActive(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.AddMember("p1", "c1", "Alice")

	jwt := makeMemberJWT("test-secret", "c1", "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/status", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["member_status"] != "active" {
		t.Errorf("expected member_status 'active', got '%v'", resp["member_status"])
	}
}

func TestStatusRemoved(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")

	jwt := makeMemberJWT("test-secret", "removed-client", "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/status", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for non-member, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["member_status"] != "removed" {
		t.Errorf("expected member_status 'removed', got '%v'", resp["member_status"])
	}
}

func TestStatusProjectDeleted(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("p1", true, "owner1", "Test")
	db.SetCollabDeleted("p1")

	jwt := makeMemberJWT("test-secret", "c1", "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/status", nil)
	req.Header.Set("Authorization", "Bearer "+jwt)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusGone {
		t.Errorf("expected 410, got %d: %s", w.Code, w.Body.String())
	}
}

func TestJoinWithoutDisplayName(t *testing.T) {
	r, db := setupInviteTest(t)

	db.SetCollabEnabled("proj0001", true, "owner1", "Test")
	proj, _ := db.GetProject("proj0001")

	bodyBytes, _ := json.Marshal(map[string]string{
		"code":     proj.InviteCode,
		"client_id": "client-abcdefgh",
	})
	req := httptest.NewRequest("POST", "/api/v1/projects/proj0001/join", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["display_name"] != "client-a" {
		t.Errorf("expected display_name 'client-a' (first 8 chars), got '%v'", resp["display_name"])
	}
}
