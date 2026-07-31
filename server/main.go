package main

import (
	"io"
	"log"
	"os"
	"path/filepath"

	"zell-server/internal/config"
	"zell-server/internal/handler"
	"zell-server/internal/middleware"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	// Log to file
	logFile, err := os.OpenFile(filepath.Join(cfg.DataDir, "server.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
		gin.DefaultWriter = io.MultiWriter(os.Stdout, logFile)
	}

	db, err := repository.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	wsH := handler.NewWSHandler(db)
	wsH.Start()

	articleH := handler.NewArticleHandler(db, wsH.GetHub())
	inviteH := handler.NewInviteHandler(db, cfg.JWTSecret, wsH.GetHub())

	r := gin.Default()

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Server-Key")
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

		// Collab management (requires server key)
		serverApi := api.Group("")
		serverApi.Use(middleware.ServerKeyMiddleware(cfg.ServerKey))
		{
			serverApi.POST("/projects/:pid/collab", inviteH.CollabToggle)
			serverApi.GET("/projects/:pid/invite", inviteH.GetInvite)
			serverApi.POST("/projects/:pid/invite/rotate", inviteH.RotateInvite)
			serverApi.GET("/projects/:pid/members", inviteH.ListMembers)
			serverApi.DELETE("/projects/:pid/members/:client_id", inviteH.RemoveMember)
			serverApi.GET("/projects/:pid/pending", inviteH.ListPending)
			serverApi.POST("/projects/:pid/pending/:client_id/approve", inviteH.ApprovePending)
			serverApi.POST("/projects/:pid/pending/:client_id/reject", inviteH.RejectPending)
			serverApi.DELETE("/projects/:pid/articles/:aid", articleH.Delete)
		}

		// Article read/write (JWT token — both owner and members)
		memberApi := api.Group("")
		memberApi.Use(middleware.AuthMiddleware(cfg))
		memberApi.Use(middleware.MemberCheckMiddleware(db))
		{
			memberApi.GET("/projects/:pid/articles", articleH.List)
			memberApi.POST("/projects/:pid/articles", articleH.Create)
			memberApi.PUT("/projects/:pid/articles/:aid", articleH.Update)
			memberApi.GET("/projects/:pid/invite", inviteH.GetInviteJWT)
		}

		// Member self-service (JWT auth but no state check — handlers do their own)
		selfApi := api.Group("")
		selfApi.Use(middleware.AuthMiddleware(cfg))
		{
			selfApi.POST("/projects/:pid/leave", inviteH.Leave)
			selfApi.GET("/projects/:pid/notifications", inviteH.Notifications)
			selfApi.GET("/projects/:pid/status", inviteH.Status)
		}
	}

	// WebSocket (y-websocket compatible: /ws/:pid/:articleID)
	r.GET("/ws/:pid/:aid", wsH.Handle)

	// Publish management API (requires server key)
	pubAPI := r.Group("/api/v1")
	pubAPI.Use(middleware.ServerKeyMiddleware(cfg.ServerKey))
	{
		pubH := handler.NewPublishHandler(db)
		pubAPI.PUT("/projects/:pid/publish", pubH.SaveConfig)
		pubAPI.PUT("/projects/:pid/publish/articles/:aid", pubH.SaveArticle)
		pubAPI.PUT("/projects/:pid/publish/whiteboards/:wid", pubH.SaveWhiteboard)
	}

	// Public publish routes (no auth)
	pub := r.Group("/pub")
	{
		pubH := handler.NewPublishHandler(db)
		pub.GET("/:pid/wiki/", pubH.WikiIndex)
		pub.GET("/:pid/wiki/:aid", pubH.WikiArticle)
		pub.GET("/:pid/ppt/:wid", pubH.PPTPreview)
	}

	if cfg.ServerKey != "" {
		log.Printf("========== 本次服务器密钥 ==========")
		log.Printf("  %s", cfg.ServerKey)
		log.Printf("  此密钥仅本次启动有效，用于初次验证管理员身份")
		log.Printf("  项目连接后获得的 token 永久有效，不受密钥变更影响")
		log.Printf("=====================================")
	}
	log.Printf("Zell server starting on :%s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
