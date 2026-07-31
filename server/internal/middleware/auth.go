package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"zell-server/internal/config"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Session struct {
	ClientID    string
	ProjectID   string
	DisplayName string
}

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	jwtSecret := []byte(cfg.JWTSecret)
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			auth = c.Query("token")
			if auth != "" {
				auth = "Bearer " + auth
			}
		}

		tokenStr := strings.TrimPrefix(auth, "Bearer ")
		if tokenStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
			c.Abort()
			return
		}

		sub, _ := claims["sub"].(string)
		pid, _ := claims["project_id"].(string)

		c.Set("session", &Session{
			ClientID:    sub,
			ProjectID:   pid,
			DisplayName: sub,
		})
		c.Next()
	}
}

func ServerKeyMiddleware(key string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if key == "" {
			c.JSON(http.StatusForbidden, gin.H{"error": "server key not configured"})
			c.Abort()
			return
		}
		if c.GetHeader("X-Server-Key") != key {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid server key"})
			c.Abort()
			return
		}
		c.Next()
	}
}

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
