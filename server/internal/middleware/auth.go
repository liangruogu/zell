package middleware

import (
	"net/http"
	"strings"

	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(db *repository.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			auth = c.Query("token")
			if auth != "" {
				auth = "Bearer " + auth
			}
		}

		token := strings.TrimPrefix(auth, "Bearer ")
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		session, err := db.GetSessionByToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		c.Set("session", session)
		c.Next()
	}
}

func ServerKeyMiddleware(key string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("X-Server-Key") != key {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid server key"})
			c.Abort()
			return
		}
		c.Next()
	}
}
