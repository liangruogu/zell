package handler

import (
	"net/http"
	"time"

	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte("bindle-secret-change-me")

type InviteHandler struct {
	db *repository.DB
}

func NewInviteHandler(db *repository.DB) *InviteHandler {
	return &InviteHandler{db: db}
}

func (h *InviteHandler) CollabToggle(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if err := h.db.SetCollabEnabled(pid, req.Enabled); err != nil {
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
		Code     string `json:"code"`
		ClientID string `json:"client_id"`
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

	// If a pid is provided in URL, verify it matches
	if pid != "" && pid != "0" && pid != realPID {
		c.JSON(http.StatusForbidden, gin.H{"error": "invite not for this project"})
		return
	}

	// Generate JWT
	claims := jwt.MapClaims{
		"sub":        req.ClientID,
		"project_id": realPID,
		"iat":        time.Now().Unix(),
		"exp":        time.Now().Add(365 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString(jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token generation failed"})
		return
	}

	// Create session
	_, err = h.db.CreateSession("inv_"+realPID, req.ClientID, tokenStr, "collaborator")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session creation failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":      tokenStr,
		"project_id": realPID,
	})
}
