# Knowledge Base Collaboration System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete knowledge base collaboration lifecycle: member join/leave/kick, project delete/collab disable, request-level state checks, notification system, offline recovery, and double-confirmation UX.

**Architecture:** Incremental additions to the existing Go server (Gin + SQLite) and React frontend. New middleware layer (MemberCheckMiddleware) wraps existing article/member APIs. New notification table + endpoints handle offline recovery. WS hub gains member online/offline tracking. Frontend adds confirmation dialogs and notification polling.

**Tech Stack:** Go 1.22+, Gin, gorilla/websocket, modernc.org/sqlite, golang-jwt/jwt, React 19, TypeScript, Zustand, Tauri

## Global Constraints

- SQLite via `modernc.org/sqlite` (no CGO required)
- JWT signed with persistent secret stored in `data/.jwt_secret`
- Server Key is ephemeral (regenerated each startup), used for owner/admin operations via `X-Server-Key` header
- Error responses use `{"error": "message"}` format; state-related errors include a `"code"` field for frontend routing
- `project_members.status` uses soft-delete (`'active'` / `'removed'`), never hard-deletes from the table
- Frontend API calls use existing `Authorization: Bearer <jwt>` pattern
- WebSocket connection uses `?token=<jwt>` query parameter for auth

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server/internal/repository/db.go` | Database connection, migration runner |
| `server/internal/repository/project_repo.go` | Project CRUD, member management, status methods |
| `server/internal/repository/notification_repo.go` | **New** — notification CRUD |
| `server/internal/middleware/auth.go` | JWT auth (`AuthMiddleware`), ServerKey auth, **new** `MemberCheckMiddleware` |
| `server/internal/handler/invite_handler.go` | Invite/join/leave/members/pending endpoints, notification writes |
| `server/internal/handler/ws_handler.go` | WebSocket upgrade, state check, online/offline tracking |
| `server/internal/ws/hub.go` | Room management, broadcast, member online/offline events |
| `server/internal/ws/client.go` | Single WS connection read/write loops |
| `server/main.go` | Route registration, middleware wiring |
| `app/src/stores/syncStore.ts` | Server connection state, notifications state |
| `app/src/pages/KnowledgeBasePage.tsx` | Notifications pull on mount/reconnect, quit project button, error dialogs |
| `app/src/components/project/PublishSettings.tsx` | Double-confirmation dialogs for approve/reject/kick/collab-toggle |
| `app/src/components/share/InviteDialog.tsx` | Join flow pending-status UI |

---

### Task 1: Database — Migration for status fields

**Files:**
- Modify: `server/internal/repository/db.go`

**Interfaces:**
- Produces: `projects.status TEXT DEFAULT 'active'`, `project_members.status TEXT DEFAULT 'active'`

- [ ] **Step 1: Add ALTER TABLE statements to migration**

In `server/internal/repository/db.go`, locate `migrateProjects()` and add ALTER TABLE statements after the CREATE TABLE calls.

```go
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
	}
	for _, q := range queries {
		if _, err := db.conn.Exec(q); err != nil {
			return err
		}
	}
	// Add columns that may be missing from older DBs
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN name TEXT DEFAULT ''`)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN owner_token TEXT DEFAULT ''`)
	db.conn.Exec(`ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active'`)
	db.conn.Exec(`ALTER TABLE project_members ADD COLUMN status TEXT DEFAULT 'active'`)
	return nil
}
```

- [ ] **Step 2: Verify migration runs without error**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add server/internal/repository/db.go
git commit -m "feat: add status columns to projects and project_members tables"
```

---

### Task 2: Database — Notifications table

**Files:**
- Create: `server/internal/repository/notification_repo.go`
- Modify: `server/internal/repository/db.go`

**Interfaces:**
- Consumes: `db.conn` (SQLite connection from `repository.DB`)
- Produces: `CreateNotification(projectID, clientID, notifType, data string) error`, `GetNotifications(clientID string) ([]Notification, error)`, `MarkRead(clientID string) error`, `CleanupOld() error`
- Produces: `Notification` struct: `{ ID, ProjectID, ClientID, Type, Data string; IsRead bool; CreatedAt string }`

- [ ] **Step 1: Create notification_repo.go with schema migration and CRUD**

```go
// server/internal/repository/notification_repo.go
package repository

import (
	"time"

	"github.com/google/uuid"
)

type Notification struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	ClientID  string `json:"client_id"`
	Type      string `json:"type"`
	Data      string `json:"data"`
	IsRead    bool   `json:"is_read"`
	CreatedAt string `json:"created_at"`
}

func (db *DB) migrateNotifications() error {
	_, err := db.conn.Exec(`
		CREATE TABLE IF NOT EXISTS notifications (
			id         TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			client_id  TEXT NOT NULL,
			type       TEXT NOT NULL,
			data       TEXT DEFAULT '{}',
			is_read    INTEGER DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}
	db.conn.Exec(`CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id, is_read)`)
	return nil
}

func (db *DB) CreateNotification(projectID, clientID, notifType, data string) error {
	id := uuid.Must(uuid.NewV7()).String()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`INSERT INTO notifications (id, project_id, client_id, type, data, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
		id, projectID, clientID, notifType, data, now,
	)
	return err
}

func (db *DB) GetNotifications(clientID string) ([]Notification, error) {
	rows, err := db.conn.Query(
		`SELECT id, project_id, client_id, type, data, is_read, created_at FROM notifications WHERE client_id = ? ORDER BY created_at DESC`,
		clientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Notification
	for rows.Next() {
		var n Notification
		var isRead int
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.ClientID, &n.Type, &n.Data, &isRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.IsRead = isRead == 1
		list = append(list, n)
	}
	if list == nil {
		list = []Notification{}
	}
	return list, nil
}

func (db *DB) MarkNotificationsRead(clientID string) error {
	_, err := db.conn.Exec(`UPDATE notifications SET is_read = 1 WHERE client_id = ?`, clientID)
	return err
}

func (db *DB) CleanupOldNotifications() error {
	cutoff := time.Now().UTC().Add(-7 * 24 * time.Hour).Format(time.RFC3339)
	_, err := db.conn.Exec(`DELETE FROM notifications WHERE is_read = 1 AND created_at < ?`, cutoff)
	return err
}
```

- [ ] **Step 2: Call migrateNotifications from db.go init**

In `server/internal/repository/db.go`, add `migrateNotifications()` call after `migrateProjects()` in the `New()` function. Locate the line that calls `migrateProjects()` and add:

```go
if err := db.migrateProjects(); err != nil {
    return nil, err
}
```

Append immediately after:

```go
if err := db.migrateNotifications(); err != nil {
    return nil, err
}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/internal/repository/notification_repo.go server/internal/repository/db.go
git commit -m "feat: add notifications table with CRUD methods"
```

---

### Task 3: Repository — Project status and member status methods

**Files:**
- Modify: `server/internal/repository/project_repo.go`

**Interfaces:**
- Consumes: `db.conn` (SQLite connection)
- Produces: `GetProject()` return type updated with `Status string`, `GetMemberStatus(projectID, clientID string) (string, error)`, `RemoveAllMembers(projectID string) error`, `ListMembers()` return type updated with `Status string`

- [ ] **Step 1: Update GetProject return struct to include Status**

In `server/internal/repository/project_repo.go`, update the `GetProject` method signature. The return struct needs a `Status` field:

```go
func (db *DB) GetProject(projectID string) (*struct {
	Name            string
	CollabEnabled   bool
	InviteCode      string
	InviteUpdatedAt string
	OwnerToken      string
	Status          string
}, error) {
	db.EnsureProject(projectID)
	var enabled int
	var code, updatedAt, ownerToken, name, status string
	err := db.conn.QueryRow(
		`SELECT COALESCE(name,''), collab_enabled, invite_code, invite_updated_at, COALESCE(owner_token,''), COALESCE(status,'active') FROM projects WHERE id = ?`, projectID,
	).Scan(&name, &enabled, &code, &updatedAt, &ownerToken, &status)
	if err != nil {
		return nil, err
	}
	return &struct {
		Name            string
		CollabEnabled   bool
		InviteCode      string
		InviteUpdatedAt string
		OwnerToken      string
		Status          string
	}{name, enabled == 1, code, updatedAt, ownerToken, status}, nil
}
```

- [ ] **Step 2: Update SetCollabEnabled to handle status**

In `SetCollabEnabled`, when `deleted` flag is set, update projects.status:

```go
func (db *DB) SetCollabDeleted(projectID string) error {
	if err := db.EnsureProject(projectID); err != nil {
		return err
	}
	_, err := db.conn.Exec(`UPDATE projects SET status = 'deleted', collab_enabled = 0, invite_code = '' WHERE id = ?`, projectID)
	return err
}
```

- [ ] **Step 3: Add GetMemberStatus**

```go
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
```

- [ ] **Step 4: Modify RemoveMember to soft-delete**

Change `RemoveMember` from `DELETE` to `UPDATE status = 'removed'`:

```go
func (db *DB) RemoveMember(projectID, clientID string) error {
	_, err := db.conn.Exec(`UPDATE project_members SET status = 'removed' WHERE project_id = ? AND client_id = ?`, projectID, clientID)
	return err
}
```

- [ ] **Step 5: Add RemoveAllMembers**

```go
func (db *DB) RemoveAllMembers(projectID string) error {
	_, err := db.conn.Exec(`UPDATE project_members SET status = 'removed' WHERE project_id = ? AND status = 'active'`, projectID)
	return err
}
```

- [ ] **Step 6: Add ListMemberIDs for broadcasting**

```go
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
```

- [ ] **Step 7: Update ListMembers to include status field**

Update the `ListMembers` return struct and query to include `status`:

Update the query from `SELECT client_id, display_name, online` to `SELECT client_id, display_name, online, COALESCE(status,'active')`.

Update the return struct from `{ClientID, DisplayName, Online bool}` to `{ClientID, DisplayName string; Online bool; Status string}`.

```go
func (db *DB) ListMembers(projectID string) ([]struct {
	ClientID    string `json:"client_id"`
	DisplayName string `json:"display_name"`
	Online      bool   `json:"online"`
	Status      string `json:"status"`
}, error) {
	rows, err := db.conn.Query(`SELECT client_id, display_name, online, COALESCE(status,'active') FROM project_members WHERE project_id = ?`, projectID)
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
```

- [ ] **Step 8: Update ValidateInviteCode to check project status**

Add a status check in `ValidateInviteCode`:

```go
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
```

- [ ] **Step 9: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 10: Commit**

```bash
git add server/internal/repository/project_repo.go
git commit -m "feat: add status support to projects and members, soft-delete for members"
```

---

### Task 4: Middleware — MemberCheckMiddleware

**Files:**
- Modify: `server/internal/middleware/auth.go`

**Interfaces:**
- Consumes: `*repository.DB` (for status lookups), existing `Session` struct
- Produces: `MemberCheckMiddleware(db *repository.DB) gin.HandlerFunc`

- [ ] **Step 1: Add MemberCheckMiddleware function**

In `server/internal/middleware/auth.go`, after the `ServerKeyMiddleware` function, add:

```go
func MemberCheckMiddleware(db *repository.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		session := c.MustGet("session").(*Session)
		pid := c.Param("pid")

		proj, err := db.GetProject(pid)
		if err != nil || proj == nil || proj.Status == "deleted" {
			c.JSON(http.StatusGone, gin.H{"error": "project deleted", "code": "PROJECT_DELETED"})
			c.Abort()
			return
		}

		if !proj.CollabEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "collaboration disabled", "code": "COLLAB_DISABLED"})
			c.Abort()
			return
		}

		memberStatus, err := db.GetMemberStatus(pid, session.ClientID)
		if err != nil || memberStatus != "active" {
			c.JSON(http.StatusForbidden, gin.H{"error": "you have been removed from this project", "code": "MEMBER_REMOVED"})
			c.Abort()
			return
		}

		c.Next()
	}
}
```

Note: Add `"zell-server/internal/repository"` to the import block:

```go
import (
	"fmt"
	"net/http"
	"strings"
	"zell-server/internal/config"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)
```

- [ ] **Step 2: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/internal/middleware/auth.go
git commit -m "feat: add MemberCheckMiddleware for request-level state validation"
```

---

### Task 5: API — Leave endpoint

**Files:**
- Modify: `server/internal/handler/invite_handler.go`

**Interfaces:**
- Consumes: `*repository.DB`, `*ws.Hub`
- Produces: `POST /api/v1/projects/:pid/leave` handler

- [ ] **Step 1: Add Leave method to InviteHandler**

In `server/internal/handler/invite_handler.go`, add after the `RejectPending` method:

```go
func (h *InviteHandler) Leave(c *gin.Context) {
	pid := c.Param("pid")
	session := c.MustGet("session").(*middleware.Session)
	clientID := session.ClientID

	if err := h.db.RemoveMember(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.hub.BroadcastProject(pid, "member_left", gin.H{"client_id": clientID})

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

Note: Add `"zell-server/internal/middleware"` to the import block.

- [ ] **Step 2: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/invite_handler.go
git commit -m "feat: add member leave endpoint"
```

---

### Task 6: API — Notifications and Status endpoints

**Files:**
- Modify: `server/internal/handler/invite_handler.go`

**Interfaces:**
- Consumes: `*repository.DB`
- Produces: `GET /api/v1/projects/:pid/notifications`, `GET /api/v1/projects/:pid/status`

- [ ] **Step 1: Add Notifications method**

In `server/internal/handler/invite_handler.go`, add:

```go
func (h *InviteHandler) Notifications(c *gin.Context) {
	pid := c.Param("pid")
	session := c.MustGet("session").(*middleware.Session)
	clientID := session.ClientID

	notifs, err := h.db.GetNotifications(clientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.db.MarkNotificationsRead(clientID)
	h.db.CleanupOldNotifications()

	// Filter to this project's notifications
	var filtered []repository.Notification
	for _, n := range notifs {
		if n.ProjectID == pid {
			filtered = append(filtered, n)
		}
	}
	if filtered == nil {
		filtered = []repository.Notification{}
	}

	c.JSON(http.StatusOK, gin.H{"notifications": filtered})
}
```

- [ ] **Step 2: Add Status method**

```go
func (h *InviteHandler) Status(c *gin.Context) {
	pid := c.Param("pid")
	session := c.MustGet("session").(*middleware.Session)
	clientID := session.ClientID

	proj, err := h.db.GetProject(pid)
	if err != nil || proj == nil {
		c.JSON(http.StatusGone, gin.H{"project_status": "deleted", "collab_enabled": false, "member_status": "removed"})
		return
	}

	memberStatus, err := h.db.GetMemberStatus(pid, clientID)
	if err != nil {
		memberStatus = "removed"
	}

	httpStatus := http.StatusOK
	if proj.Status == "deleted" {
		httpStatus = http.StatusGone
	} else if !proj.CollabEnabled || memberStatus != "active" {
		httpStatus = http.StatusForbidden
	}

	c.JSON(httpStatus, gin.H{
		"project_status":  proj.Status,
		"collab_enabled":  proj.CollabEnabled,
		"member_status":   memberStatus,
	})
}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/invite_handler.go
git commit -m "feat: add notifications pull and status check endpoints"
```

---

### Task 7: API — Modify existing handlers for notifications

**Files:**
- Modify: `server/internal/handler/invite_handler.go`

**Interfaces:**
- Consumes: `*repository.DB`, `*ws.Hub`
- Modifies: `RemoveMember`, `ApprovePending`, `RejectPending`, `CollabToggle` — add notification writes and broadcast enhancements

- [ ] **Step 1: Update RemoveMember to write notification and broadcast**

Replace the existing `RemoveMember` method:

```go
func (h *InviteHandler) RemoveMember(c *gin.Context) {
	pid := c.Param("pid")
	clientID := c.Param("client_id")
	if err := h.db.CreateNotification(pid, clientID, "removed", "{}"); err != nil {
		log.Printf("[invite] notification write error: %v", err)
	}
	if err := h.db.RemoveMember(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.BroadcastProject(pid, "member_removed", gin.H{"client_id": clientID})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

- [ ] **Step 2: Update ApprovePending to write notification**

Replace the existing `ApprovePending` method, adding a notification write after token generation:

After `h.db.AddMember(pid, clientID, displayName)`, add:

```go
	// Write notification for offline member
	h.db.CreateNotification(pid, clientID, "approved", `{}`)
```

- [ ] **Step 3: Update RejectPending to write notification**

Replace the existing `RejectPending` method:

```go
func (h *InviteHandler) RejectPending(c *gin.Context) {
	pid := c.Param("pid")
	clientID := c.Param("client_id")

	// Get display name before removing
	pending, _ := h.db.ListPending(pid)
	var displayName string
	for _, p := range pending {
		if p.ClientID == clientID {
			displayName = p.DisplayName
			break
		}
	}

	if err := h.db.CreateNotification(pid, clientID, "rejected", `{}`); err != nil {
		log.Printf("[invite] notification write error: %v", err)
	}
	if err := h.db.RemovePending(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.hub.BroadcastProject(pid, "member_rejected", gin.H{"client_id": clientID, "display_name": displayName})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

- [ ] **Step 4: Update CollabToggle to handle disable and delete with notifications**

In `CollabToggle`, after the `if req.Deleted` block, add handling for `enabled = false`:

```go
	if !req.Enabled {
		// Disable collaboration: remove all members and broadcast
		memberIDs, err := h.db.ListMemberIDs(pid)
		if err == nil {
			for _, mid := range memberIDs {
				h.db.CreateNotification(pid, mid, "collab_disabled", "{}")
			}
		}
		h.db.RemoveAllMembers(pid)
		h.hub.BroadcastProject(pid, "collab_disabled", gin.H{"project_id": pid})
	}

	if req.Deleted {
		// Delete project: mark deleted, remove members, write notifications
		memberIDs, err := h.db.ListMemberIDs(pid)
		if err == nil {
			for _, mid := range memberIDs {
				h.db.CreateNotification(pid, mid, "project_deleted", "{}")
			}
		}
		h.db.RemoveAllMembers(pid)
		h.db.SetCollabDeleted(pid)
		h.hub.BroadcastProject(pid, "project_deleted", gin.H{"project_id": pid})
	}
```

**Note:** Remove the old `if req.Deleted` block that comes before this (the one at the top of the handler). Consolidate both the collab disable and project delete logic into these two blocks after the `SetCollabEnabled` call.

- [ ] **Step 5: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/internal/handler/invite_handler.go
git commit -m "feat: add notification writes and broadcasts to remove/approve/reject/collab-toggle"
```

---

### Task 8: WebSocket — State check and online tracking

**Files:**
- Modify: `server/internal/handler/ws_handler.go`
- Modify: `server/internal/ws/hub.go`
- Modify: `server/internal/ws/client.go`

**Interfaces:**
- Consumes: `*repository.DB`, `*ws.Hub`
- Produces: state check on WS upgrade, online/offline events on connect/disconnect

- [ ] **Step 1: Add project/member state check to WS handler**

In `server/internal/handler/ws_handler.go`, in the `Handle` method, add state checks before upgrading:

```go
func (h *WSHandler) Handle(c *gin.Context) {
	pid := c.Param("pid")
	articleID := c.Param("aid")
	clientID := c.Query("client_id")
	room := pid + ":" + articleID

	if clientID == "" {
		clientID = "client-" + pid
	}

	token := c.Query("token")
	if token != "" {
		session, err := h.db.GetSessionByToken(token)
		if err == nil {
			invite, err := h.db.GetInviteByCode(session.InviteCodeID)
			if err == nil && invite.ProjectID == pid {
				clientID = session.DisplayName
			}
		}
	}

	// State check: verify project and member status
	proj, err := h.db.GetProject(pid)
	if err != nil || proj == nil || proj.Status == "deleted" || !proj.CollabEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "project unavailable"})
		return
	}
	memberStatus, err := h.db.GetMemberStatus(pid, clientID)
	if err != nil || memberStatus != "active" {
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	log.Printf("[ws] client %s connecting to room %s", clientID, room)
	h.hub.HandleWebSocket(conn, room, clientID, pid)
}
```

Note: Update the call to `h.hub.HandleWebSocket` to pass a 4th argument `pid`.

- [ ] **Step 2: Update Hub.Run to track online status**

In `server/internal/ws/hub.go`, `Run()` method, after client registers (`case client := <-h.register:`), add online notification:

```go
		case client := <-h.register:
			h.mu.Lock()
			key := roomKey(client.room)
			if h.rooms[key] == nil {
				h.rooms[key] = make(map[*Client]bool)
			}
			h.rooms[key][client] = true
			h.mu.Unlock()

			// Notify project notification room about member online
			if h.onMemberEvent != nil {
				h.onMemberEvent(client.projectID, client.clientID, true)
			}
			log.Printf("[hub] client joined room %s (%d clients)", client.room, len(h.rooms[key]))
```

And after unregister (`case client := <-h.unregister:`):

```go
		case client := <-h.unregister:
			h.mu.Lock()
			key := roomKey(client.room)
			if clients, ok := h.rooms[key]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.rooms, key)
				}
			}
			h.mu.Unlock()

			// Notify project notification room about member offline
			if h.onMemberEvent != nil {
				h.onMemberEvent(client.projectID, client.clientID, false)
			}
			close(client.send)
			log.Printf("[hub] client left room %s", client.room)
```

- [ ] **Step 3: Add Hub fields for member event callback and projectID on Client**

In `server/internal/ws/hub.go`, add new field to Hub struct:

```go
type Hub struct {
	rooms         map[roomKey]map[*Client]bool
	register      chan *Client
	unregister    chan *Client
	mu            sync.RWMutex
	onSnapshot    func(docID string, state []byte)
	onMemberEvent func(projectID, clientID string, online bool)
}
```

Update `NewHub` to accept the callback:

```go
func NewHub(onSnapshot func(docID string, state []byte), onMemberEvent func(projectID, clientID string, online bool)) *Hub {
	return &Hub{
		rooms:         make(map[roomKey]map[*Client]bool),
		register:      make(chan *Client, 256),
		unregister:    make(chan *Client, 256),
		onSnapshot:    onSnapshot,
		onMemberEvent: onMemberEvent,
	}
}
```

In `server/internal/ws/client.go`, add `projectID` field to `Client` struct:

```go
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	room      string
	projectID string
	send      chan []byte
	clientID  string
	mu        sync.Mutex
}
```

Update `NewClient`:

```go
func NewClient(hub *Hub, conn *websocket.Conn, room, clientID, projectID string) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		room:      room,
		projectID: projectID,
		send:      make(chan []byte, 256),
		clientID:  clientID,
	}
}
```

In `server/internal/ws/hub.go`, update `HandleWebSocket`:

```go
func (h *Hub) HandleWebSocket(conn *websocket.Conn, room, clientID, projectID string) {
	client := NewClient(h, conn, room, clientID, projectID)
	h.register <- client
	go client.WriteLoop()
	client.ReadLoop()
}
```

- [ ] **Step 4: Update server/main.go to pass member event callback**

In `server/main.go`, update the `NewWSHandler` call (which internally creates the `Hub`):

In `server/internal/handler/ws_handler.go`, update `NewWSHandler`:

```go
func NewWSHandler(db *repository.DB) *WSHandler {
	hub := ws.NewHub(
		func(docID string, state []byte) {
			if err := db.SaveSnapshot(docID, state); err != nil {
				log.Printf("[ws] snapshot save error: %v", err)
			}
		},
		func(projectID, clientID string, online bool) {
			if online {
				db.SetMemberOnline(projectID, clientID, true)
				hub.BroadcastProject(projectID, "member_online", gin.H{"client_id": clientID})
			} else {
				db.SetMemberOnline(projectID, clientID, false)
				hub.BroadcastProject(projectID, "member_offline", gin.H{"client_id": clientID})
			}
		},
	)
	return &WSHandler{db: db, hub: hub}
}
```

- [ ] **Step 5: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add server/internal/handler/ws_handler.go server/internal/ws/hub.go server/internal/ws/client.go
git commit -m "feat: add WS state check on connect, member online/offline tracking"
```

---

### Task 9: Routes — Wire new middleware and endpoints

**Files:**
- Modify: `server/main.go`

**Interfaces:**
- Consumes: all handler types, middleware functions
- Produces: new routes registered with `MemberCheckMiddleware` applied

- [ ] **Step 1: Apply MemberCheckMiddleware to article routes**

In `server/main.go`, update the `memberApi` route group to include `MemberCheckMiddleware`:

```go
		// Article read/write (JWT token — both owner and members)
		memberApi := api.Group("")
		memberApi.Use(middleware.AuthMiddleware(cfg))
		memberApi.Use(middleware.MemberCheckMiddleware(db))
		{
			memberApi.GET("/projects/:pid/articles", articleH.List)
			memberApi.POST("/projects/:pid/articles", articleH.Create)
			memberApi.PUT("/projects/:pid/articles/:aid", articleH.Update)
		}
```

- [ ] **Step 2: Add new leave/notifications/status routes**

Add new routes that use JWT auth (same auth as memberApi). These don't need MemberCheckMiddleware because they handle their own state checks:

```go
		// Member self-service (JWT auth but no state check — handlers do their own)
		selfApi := api.Group("")
		selfApi.Use(middleware.AuthMiddleware(cfg))
		{
			selfApi.POST("/projects/:pid/leave", inviteH.Leave)
			selfApi.GET("/projects/:pid/notifications", inviteH.Notifications)
			selfApi.GET("/projects/:pid/status", inviteH.Status)
		}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build -o /dev/null ./...
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/main.go
git commit -m "feat: wire MemberCheckMiddleware and new member endpoints"
```

---

### Task 10: Frontend — syncStore notifications state

**Files:**
- Modify: `app/src/stores/syncStore.ts`

**Interfaces:**
- Consumes: existing syncStore interface
- Produces: `notifications`, `pullNotifications`, `pullStatus` fields on SyncState

- [ ] **Step 1: Add notifications state and methods to syncStore**

Read the existing `app/src/stores/syncStore.ts` first, then add to the state interface and store:

```typescript
// Add to SyncState interface:
notifications: Array<{ id: string; type: string; data: string; is_read: boolean; created_at: string }> | null
pullNotifications: (projectId: string, token: string, serverUrl: string) => Promise<void>
pullStatus: (projectId: string, token: string, serverUrl: string) => Promise<{ project_status: string; collab_enabled: boolean; member_status: string } | null>

// Add to initial state:
notifications: null,

// Add implementations in the store creator:
pullNotifications: async (projectId, token, serverUrl) => {
  try {
    const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    set({ notifications: data.notifications || [] })
  } catch { /* ignore */ }
},

pullStatus: async (projectId, token, serverUrl) => {
  try {
    const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/status`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    const data = await res.json()
    return data
  } catch { return null }
},
```

- [ ] **Step 2: Verify typecheck**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | grep -E "syncStore|error" | head -10
```

Expected: no new errors from syncStore.ts.

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/syncStore.ts
git commit -m "feat: add notifications state and pull methods to syncStore"
```

---

### Task 11: Frontend — KnowledgeBasePage notifications and quit

**Files:**
- Modify: `app/src/pages/KnowledgeBasePage.tsx`

**Interfaces:**
- Consumes: `useSyncStore`, `useKnowledgeStore`
- Produces: notification pull on mount, quit button, state error dialogs

- [ ] **Step 1: Read current KnowledgeBasePage**

Read `app/src/pages/KnowledgeBasePage.tsx` to understand current structure.

- [ ] **Step 2: Add notification pull on mount**

In the existing `useEffect` where `fetchArticles(projectId)` is called, add notification pull logic. After the fetch calls, pull notifications and handle terminal states:

```tsx
// After the line: fetchArticles(projectId)
// Add:
const token = useProjectStore.getState().currentProject?.settings
  ? parseProjectSettings(useProjectStore.getState().currentProject!.settings).token
  : null
const serverUrl = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}').serverUrl

if (token && serverUrl && projectId) {
  pullNotifications(projectId, token, serverUrl).then(() => {
    const notifs = useSyncStore.getState().notifications
    if (notifs) {
      for (const n of notifs) {
        if (n.type === 'removed' || n.type === 'collab_disabled' || n.type === 'project_deleted') {
          const msg = n.type === 'project_deleted' ? '项目已被管理员删除'
            : n.type === 'collab_disabled' ? '协作已被管理员关闭'
            : '你已被移出项目'
          alert(msg + '，即将返回首页')
          window.location.href = '/'
          return
        }
      }
    }
  })
}
```

- [ ] **Step 3: Add quit button for member role**

After the `serverOnline` state, determine if user is a member (not owner). Add a quit button in the bottom area:

```tsx
const isMemberRole = psCollab.role === 'member'

// Add quit button next to the "新建文章" button:
{isMemberRole && (
  <button
    onClick={async () => {
      if (!confirm('确定退出此项目吗？你将失去访问权限。')) return
      const ps = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
      const serverUrl = ps.serverUrl
      const token = ps.token
      if (serverUrl && token) {
        await fetch(`${serverUrl}/api/v1/projects/${projectId}/leave`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      }
      window.location.href = '/'
    }}
    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded transition-colors"
  >
    <LogOut size={14} />
    退出项目
  </button>
)}
```

Note: Import `LogOut` from `lucide-react` if not already imported.

- [ ] **Step 4: Add state change dialog for WS events**

In the WebSocket event handler (`ws.onmessage`), add handling for member-specific events:

```tsx
// Inside the ws.onmessage handler, after existing event checks:
if (msg.type === 'collab_disabled') {
  alert('协作已被管理员关闭，即将返回首页')
  window.location.href = '/'
  return
}
if (msg.type === 'member_removed' && msg.data?.client_id === clientId) {
  alert('你已被管理员移出项目，即将返回首页')
  window.location.href = '/'
  return
}
```

- [ ] **Step 5: Verify typecheck**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -5
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/pages/KnowledgeBasePage.tsx
git commit -m "feat: add notification pull, quit button, and state error dialogs to KnowledgeBasePage"
```

---

### Task 12: Frontend — Double confirmation UX in PublishSettings

**Files:**
- Modify: `app/src/components/project/PublishSettings.tsx`

**Interfaces:**
- Consumes: existing member/pending management UI
- Produces: confirmation dialogs before approve/reject/kick/collab-disable actions

- [ ] **Step 1: Read current PublishSettings**

Read `app/src/components/project/PublishSettings.tsx` to understand current approve/reject/kick button handlers.

- [ ] **Step 2: Add confirmation dialogs**

Wrap each action handler with a `confirm()` call before executing:

**For approve (approve_pending call):**
```tsx
onClick={() => {
  if (!confirm(`确定通过 ${member.display_name} 的加入申请吗？`)) return
  // ... existing approve logic
}}
```

**For reject (reject_pending call):**
```tsx
onClick={() => {
  if (!confirm(`确定拒绝 ${member.display_name} 的加入申请吗？操作不可撤销。`)) return
  // ... existing reject logic
}}
```

**For kick (remove_member call):**
```tsx
onClick={() => {
  if (!confirm(`确定将 ${member.display_name} 移出项目吗？对方将失去所有编辑权限。`)) return
  // ... existing remove logic
}}
```

**For collab disable (the button that calls CollabToggle with enabled: false):**
```tsx
onClick={() => {
  if (!confirm('确定关闭协作吗？所有成员将被移出项目。')) return
  // ... existing disable logic
}}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -5
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/project/PublishSettings.tsx
git commit -m "feat: add double-confirmation dialogs for approve/reject/kick/collab-disable"
```

---

### Task 13: Frontend — InviteDialog pending status UI

**Files:**
- Modify: `app/src/components/share/InviteDialog.tsx`

**Interfaces:**
- Consumes: existing join flow
- Produces: pending status display after join request

- [ ] **Step 1: Read current InviteDialog**

Read `app/src/components/share/InviteDialog.tsx` to understand current join flow.

- [ ] **Step 2: Show pending status**

After the join API call returns `{ status: "pending" }`, display a waiting message:

```tsx
// After the join fetch:
const result = await res.json()
if (result.status === 'pending') {
  setJoinStatus('pending')
  setJoinMessage(`申请已提交，等待管理员 "${result.project_name || '项目'}" 审批...`)
}
```

Add state:
```tsx
const [joinStatus, setJoinStatus] = useState<'idle' | 'pending' | 'approved'>('idle')
const [joinMessage, setJoinMessage] = useState('')
```

Display in UI:
```tsx
{joinStatus === 'pending' && (
  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
    {joinMessage}
  </div>
)}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd app && npx tsc --noEmit --pretty 2>&1 | head -5
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/share/InviteDialog.tsx
git commit -m "feat: add pending status display to join dialog"
```

---

### Task 14: Integration build and verify

**Files:**
- None; verify all changes compile together

- [ ] **Step 1: Build Go server**

```bash
cd server && go build -o zell-server .
```

Expected: exit 0, binary created.

- [ ] **Step 2: Run server briefly to verify DB migration**

```bash
cd server && timeout 3 ./zell-server 2>&1 || true
```

Expected: server starts, logs "Zell server starting on :3000", no SQL errors.

- [ ] **Step 3: Verify frontend typecheck**

```bash
cd app && npx tsc --noEmit
```

Expected: exit 0 (pre-existing errors from unrelated files are acceptable).

- [ ] **Step 4: Commit**

```bash
git add server/zell-server  # if tracked
git commit -m "chore: final integration build verification"
```

---

### Task 15: Write API README

**Files:**
- Create: `server/README.md`

Copy the API reference from the spec document (Section 8) into `server/README.md` as a standalone API reference.

- [ ] **Step 1: Create README**

```markdown
# Zell Collaboration Server

... (copy from spec Section 8: deployment, auth, all endpoints, error codes)
```

- [ ] **Step 2: Verify README is valid markdown**

Read through the README for any broken formatting.

- [ ] **Step 3: Commit**

```bash
git add server/README.md
git commit -m "docs: add Go server API README"
```
