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
		h.db.RemoveAllMembers(pid)
		h.db.SetCollabDeleted(pid)
		h.hub.BroadcastProject(pid, "project_deleted", gin.H{"project_id": pid})
	}

	if !req.Enabled && !req.Deleted {
		h.db.RemoveAllMembers(pid)
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

func (h *InviteHandler) GetProjectInfo(c *gin.Context) {
	pid := c.Param("pid")
	proj, err := h.db.GetProject(pid)
	if err != nil || proj == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"name":        proj.Name,
		"description": proj.Description,
		"config":      proj.Config,
	})
}

func (h *InviteHandler) UpdateProjectInfo(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Config      string `json:"config"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if err := h.db.UpdateProjectInfo(pid, req.Name, req.Description, req.Config); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[invite] UpdateProjectInfo pid=%s name=%s description=%s config=%s", pid, req.Name, req.Description, req.Config)
	h.hub.BroadcastProject(pid, "project_updated", gin.H{
		"name":        req.Name,
		"description": req.Description,
		"config":      req.Config,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
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
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	log.Printf("[join] code=%s client=%s name=%s", req.Code[:min(8, len(req.Code))], req.ClientID[:min(8, len(req.ClientID))], req.DisplayName)

	realPID, err := h.db.ValidateInviteCode(req.Code)
	if err != nil {
		log.Printf("[join] invalid code: %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired invite code"})
		return
	}

	if pid != "" && pid != "0" && pid != realPID {
		c.JSON(http.StatusForbidden, gin.H{"error": "invite not for this project"})
		return
	}

	displayName := req.DisplayName
	if displayName == "" {
		displayName = req.ClientID[:8]
	}

	// Already a member? Return token and notify
	if isMember, _ := h.db.IsMember(realPID, req.ClientID); isMember {
		log.Printf("[join] client=%s already member in project=%s", displayName, realPID)
		c.JSON(http.StatusOK, gin.H{
			"status":       "already_member",
			"project_id":   realPID,
			"display_name": displayName,
		})
		return
	}

	// Check display name uniqueness
	nameExists, _ := h.db.IsDisplayNameTaken(realPID, displayName)
	if nameExists {
		c.JSON(http.StatusConflict, gin.H{"error": "display_name '" + displayName + "' already taken in this project"})
		return
	}

	// Direct join: valid invite code = immediate member
	h.db.AddMember(realPID, req.ClientID, displayName)

	// Generate JWT
	claims := jwt.MapClaims{
		"sub":        req.ClientID,
		"project_id": realPID,
		"iat":        time.Now().Unix(),
		"exp":        time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString(h.jwtSecret)

	projectName := realPID[:8]
	if proj, _ := h.db.GetProject(realPID); proj != nil {
		projectName = proj.Name
	}

	log.Printf("[join] client=%s joined project=%s", displayName, realPID)
	h.hub.BroadcastProject(realPID, "member_joined", gin.H{"client_id": req.ClientID, "display_name": displayName})

	c.JSON(http.StatusOK, gin.H{
		"status":       "approved",
		"project_id":   realPID,
		"project_name": projectName,
		"token":        tokenStr,
		"display_name": displayName,
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
	if err := h.db.RemoveMember(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.BroadcastProject(pid, "member_removed", gin.H{"client_id": clientID})
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
