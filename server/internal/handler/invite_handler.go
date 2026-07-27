package handler

import (
	"net/http"
	"time"

	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte("zell-secret-change-me")

type InviteHandler struct {
	db *repository.DB
}

func NewInviteHandler(db *repository.DB) *InviteHandler {
	return &InviteHandler{db: db}
}

func (h *InviteHandler) CollabToggle(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		Enabled    bool   `json:"enabled"`
		OwnerToken string `json:"owner_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.db.SetCollabEnabled(pid, req.Enabled, req.OwnerToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	proj, _ := h.db.GetProject(pid)
	c.JSON(http.StatusOK, gin.H{
		"collab_enabled": req.Enabled,
		"invite_code":    proj.InviteCode,
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

	// Validate invite code
	realPID, err := h.db.ValidateInviteCode(req.Code)
	if err != nil {
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

	// Add to pending — owner must approve
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
	if err := h.db.RemoveMember(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
	tokenStr, _ := token.SignedString(jwtSecret)

	// Add to members
	h.db.AddMember(pid, clientID, displayName)

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"token":        tokenStr,
		"display_name": displayName,
	})
}

func (h *InviteHandler) RejectPending(c *gin.Context) {
	pid := c.Param("pid")
	clientID := c.Param("client_id")
	if err := h.db.RemovePending(pid, clientID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
