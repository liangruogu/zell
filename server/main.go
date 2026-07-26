package main

import (
	"log"

	"zell-server/internal/config"
	"zell-server/internal/handler"
	"zell-server/internal/middleware"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	db, err := repository.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	articleH := handler.NewArticleHandler(db)
	inviteH := handler.NewInviteHandler(db)
	wsH := handler.NewWSHandler(db)
	wsH.Start()

	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	{
		// Public: join project with invite code (with or without project ID)
		api.POST("/projects/join", inviteH.Join)
		api.POST("/projects/:pid/join", inviteH.Join)

		// Protected: requires valid JWT
		auth := api.Group("")
		auth.Use(middleware.AuthMiddleware(db))
		{
			// Articles
			auth.GET("/projects/:pid/articles", articleH.List)
			auth.POST("/projects/:pid/articles", articleH.Create)
			auth.PUT("/projects/:pid/articles/:aid", articleH.Update)
			auth.DELETE("/projects/:pid/articles/:aid", articleH.Delete)
		}

		// Collab management (no strict auth needed in LAN mode)
		api.POST("/projects/:pid/collab", inviteH.CollabToggle)
		api.GET("/projects/:pid/invite", inviteH.GetInvite)
		api.POST("/projects/:pid/invite/rotate", inviteH.RotateInvite)
	}

	// WebSocket (y-websocket compatible: /ws/:pid/:articleID)
	r.GET("/ws/:pid/:aid", wsH.Handle)

	log.Printf("Zell server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
