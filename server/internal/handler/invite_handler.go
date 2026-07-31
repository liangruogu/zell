package handler

import (
	"log"
	"net/http"
	"time"

	"zell-server/internal/middleware"
	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type InviteHandler struct {
	db        *repository.DB
	jwtSecret []byte
	hub       *ws.Hub
}

func NewInviteHandler(db *repository.DB, jwtSecret string, hub *ws.Hub) *InviteHandler {
	return &InviteHandler{db: db, jwtSecret: []byte(jwtSecret), hub: hub}
}

func (h *InviteHandler) CollabToggle(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		Enabled    bool   `json:"enabled"`
		OwnerToken string `json:"owner_token"`
		Name       string `json:"name"`
		Deleted    bool   `json:"deleted"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.db.SetCollabEnabled(pid, req.Enabled, req.OwnerToken, req.Name); err != nil {
		log.Printf("[CollabToggle] SetCollabEnabled error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.Deleted {
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

	if !req.Enabled && !req.Deleted {
		memberIDs, err := h.db.ListMemberIDs(pid)
		if err == nil {
			for _, mid := range memberIDs {
				h.db.CreateNotification(pid, mid, "collab_disabled", "{}")
			}
		}
		h.hub.BroadcastProject(pid, "collab_disabled", gin.H{"project_id": pid})
	}

	proj, err := h.db.GetProject(pid)
	if err != nil || proj == nil {
		log.Printf("[CollabToggle] GetProject error: %v, proj: %v", err, proj)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get project"})
		return
	}

	var ownerJWT string
	if req.Enabled {
		claims := jwt.MapClaims{
			"sub":        req.OwnerToken,
			"project_id": pid,
			"iat":        time.Now().Unix(),
			"exp":        time.Now().Add(365 * 24 * time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		ownerJWT, _ = token.SignedString(h.jwtSecret)
	}

	c.JSON(http.StatusOK, gin.H{
		"collab_enabled": req.Enabled,
		"invite_code":    proj.InviteCode,
		"token":          ownerJWT,
	})
}

func (h *InviteHandler) GetInvite(c *gin.Context) {
	pid := c.Param("pid")
	proj, err := h.db.GetProject(pid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if !proj.CollabEnabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "collaboration not enabled"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"invite_code": proj.InviteCode,
		"updated_at":  proj.InviteUpdatedAt,
	})
}

func (h *InviteHandler) GetInviteJWT(c *gin.Context) {
	pid := c.Param("pid")
	proj, err := h.db.GetProject(pid)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}

	if !proj.CollabEnabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "collaboration not enabled"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"invite_code": proj.InviteCode,
		"updated_at":  proj.InviteUpdatedAt,
	})
}

func (h *InviteHandler) RotateInvite(c *gin.Context) {
	pid := c.Param("pid")
	code, err := h.db.RotateInviteCode(pid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "rotate failed, is collaboration enabled?"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invite_code": code})
}

func (h *InviteHandler) Join(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		Code        string `json:"code"`
		ClientID    string `json:"client_id"`
		DisplayName string `json:"display_name"`
		Poll        bool   `json:"poll"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	log.Printf("[join] code=%s client=%s name=%s pid=%s", req.Code[:min(8, len(req.Code))], req.ClientID[:min(8, len(req.ClientID))], req.DisplayName, pid)

	// Validate invite code
	realPID, err := h.db.ValidateInviteCode(req.Code)
	if err != nil {
		log.Printf("[join] invalid code: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired invite code"})
		return
	}

	log.Printf("[join] code valid for project=%s", realPID)

	if pid != "" && pid != "0" && pid != realPID {
		c.JSON(http.StatusForbidden, gin.H{"error": "invite not for this project"})
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.ClientID[:8]
	}

	// If already an approved member, return token directly
	isMember, err := h.db.IsMember(realPID, req.ClientID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check membership"})
		return
	}
	if isMember {
		log.Printf("[join] client=%s already member, returning token", displayName)
		projectName := realPID[:8]
		if proj, err := h.db.GetProject(realPID); err == nil {
			projectName = proj.Name
		}
		claims := jwt.MapClaims{
			"sub":        req.ClientID,
			"project_id": realPID,
			"iat":        time.Now().Unix(),
			"exp":        time.Now().Add(365 * 24 * time.Hour).Unix(),
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenStr, _ := token.SignedString(h.jwtSecret)
		c.JSON(http.StatusOK, gin.H{
			"status":       "approved",
			"project_id":   realPID,
			"project_name": projectName,
			"token":        tokenStr,
			"display_name": displayName,
		})
		return
	}

	// Check if already in pending
	isPending, err := h.db.IsPending(realPID, req.ClientID)
	if err == nil && isPending {
		log.Printf("[join] client=%s already pending", displayName)
		c.JSON(http.StatusOK, gin.H{
			"status":     "pending",
			"project_id": realPID,
		})
		return
	}

	// If polling and not pending/not member → expired (was rejected)
	if req.Poll && !isMember {
		log.Printf("[join] client=%s poll expired (no longer pending)", displayName)
		c.JSON(http.StatusOK, gin.H{
			"status":     "expired",
			"project_id": realPID,
		})
		return
	}

	// Check display name uniqueness
	nameExists, err := h.db.IsDisplayNameTaken(realPID, displayName)
	if err == nil && nameExists {
		log.Printf("[join] client=%s name '%s' already taken", req.ClientID[:min(8, len(req.ClientID))], displayName)
		c.JSON(http.StatusConflict, gin.H{"error": "display_name '" + displayName + "' already taken in this project"})
		return
	}

	// Check if previously rejected — clear rejection and allow re-apply
	isRejected, err := h.db.IsRejected(realPID, req.ClientID)
	if err == nil && isRejected {
		log.Printf("[join] client=%s was previously rejected, clearing and re-adding to pending", displayName)
		h.db.RemoveRejected(realPID, req.ClientID)
	}

	// Add to pending — owner must approve
	log.Printf("[join] adding client=%s to pending for project=%s", displayName, realPID)
	if err := h.db.AddPending(realPID, req.ClientID, displayName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add pending request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "pending",
		"project_id": realPID,
	})
}

// ── Members ──────────────────────────────────────────────────────────────

func (h *InviteHandler) ListMembers(c *gin.Context) {
	pid := c.Param("pid")
	list, err := h.db.ListMembers(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

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

// ── Pending ──────────────────────────────────────────────────────────────

func (h *InviteHandler) ListPending(c *gin.Context) {
	pid := c.Param("pid")
	list, err := h.db.ListPending(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *InviteHandler) ApprovePending(c *gin.Context) {
	pid := c.Param("pid")
	clientID := c.Param("client_id")

	// Get pending info
	pending, err := h.db.ListPending(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var displayName string
	for _, p := range pending {
		if p.ClientID == clientID {
			displayName = p.DisplayName
			break
		}
	}
	if displayName == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "pending request not found"})
		return
	}

	// Remove from pending
	h.db.RemovePending(pid, clientID)

	// Generate JWT for approved member
	claims := jwt.MapClaims{
		"sub":        clientID,
		"project_id": pid,
		"iat":        time.Now().Unix(),
		"exp":        time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString(h.jwtSecret)

	// Add to members
	h.db.AddMember(pid, clientID, displayName)

	// Write notification for offline member
	h.db.CreateNotification(pid, clientID, "approved", `{}`)

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"token":        tokenStr,
		"display_name": displayName,
	})
}

func (h *InviteHandler) RejectPending(c *gin.Context) {
	pid := c.Param("pid")
	clientID := c.Param("client_id")

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

	h.db.AddRejected(pid, clientID)

	h.hub.BroadcastProject(pid, "member_rejected", gin.H{"client_id": clientID, "display_name": displayName})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

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
		"project_status": proj.Status,
		"collab_enabled": proj.CollabEnabled,
		"member_status":  memberStatus,
	})
}
