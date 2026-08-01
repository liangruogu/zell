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
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
)

func SetupRouter(cfg *config.Config, db *repository.DB) *gin.Engine {
	var wsHub *ws.Hub
	wsHub = ws.NewHub(
		func(docID string, state []byte) {
			if err := db.SaveSnapshot(docID, state); err != nil {
				log.Printf("[ws] snapshot save error: %v", err)
			}
		},
		func(projectID, clientID string, online bool) {
			if online {
				db.SetMemberOnline(projectID, clientID, true)
				wsHub.BroadcastProject(projectID, "member_online", gin.H{"client_id": clientID})
			} else {
				db.SetMemberOnline(projectID, clientID, false)
				wsHub.BroadcastProject(projectID, "member_offline", gin.H{"client_id": clientID})
			}
		},
	)

	wsH := handler.NewWSHandler(db, wsHub)
	go wsHub.Run()

	articleH := handler.NewArticleHandler(db, wsH.GetHub())
	inviteH := handler.NewInviteHandler(db, cfg.JWTSecret, wsH.GetHub())
	publishRepo := repository.NewPublishRepo(db)

	r := gin.Default()

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

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")
	{
		api.POST("/projects/join", inviteH.Join)
		api.POST("/projects/:pid/join", inviteH.Join)

		serverApi := api.Group("")
		serverApi.Use(middleware.ServerKeyMiddleware(cfg.ServerKey))
		{
			serverApi.POST("/projects/:pid/collab", inviteH.CollabToggle)
			serverApi.GET("/projects/:pid/invite", inviteH.GetInvite)
			serverApi.POST("/projects/:pid/invite/rotate", inviteH.RotateInvite)
			serverApi.GET("/projects/:pid/members", inviteH.ListMembers)
			serverApi.DELETE("/projects/:pid/members/:client_id", inviteH.RemoveMember)
			serverApi.PUT("/projects/:pid/info", inviteH.UpdateProjectInfo)
		}

		sharedApi := api.Group("")
		sharedApi.Use(middleware.ServerKeyOrAuthMiddleware(cfg))
		sharedApi.Use(middleware.MemberCheckMiddleware(db))
		{
			sharedApi.DELETE("/projects/:pid/articles/:aid", articleH.Delete)
		}

		memberApi := api.Group("")
		memberApi.Use(middleware.AuthMiddleware(cfg))
		memberApi.Use(middleware.MemberCheckMiddleware(db))
		{
			memberApi.GET("/projects/:pid/articles", articleH.List)
			memberApi.POST("/projects/:pid/articles", articleH.Create)
			memberApi.PUT("/projects/:pid/articles/:aid", articleH.Update)
			memberApi.GET("/projects/:pid/info", inviteH.GetProjectInfo)
			memberApi.GET("/projects/:pid/invite-code", inviteH.GetInviteJWT)
		}

		selfApi := api.Group("")
		selfApi.Use(middleware.AuthMiddleware(cfg))
		{
			selfApi.POST("/projects/:pid/leave", inviteH.Leave)
			selfApi.GET("/projects/:pid/notifications", inviteH.Notifications)
			selfApi.GET("/projects/:pid/status", inviteH.Status)
		}
	}

	r.GET("/ws/:pid/:aid", wsH.Handle)

	pubAPI := r.Group("/api/v1")
	pubAPI.Use(middleware.ServerKeyMiddleware(cfg.ServerKey))
	{
		pubH := handler.NewPublishHandler(db, publishRepo)
		pubAPI.PUT("/projects/:pid/publish", pubH.SaveConfig)
		pubAPI.PUT("/projects/:pid/publish/articles/:aid", pubH.SaveArticle)
		pubAPI.PUT("/projects/:pid/publish/whiteboards/:wid", pubH.SaveWhiteboard)
	}

	pub := r.Group("/pub")
	{
		pubH := handler.NewPublishHandler(db, publishRepo)
		pub.GET("/:pid/wiki/", pubH.WikiIndex)
		pub.GET("/:pid/wiki/:aid", pubH.WikiArticle)
		pub.GET("/:pid/ppt/:wid", pubH.PPTPreview)
	}

	return r
}

func main() {
	cfg := config.Load()

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

	router := SetupRouter(cfg, db)

	if cfg.ServerKey != "" {
		log.Printf("========== 本次服务器密钥 ==========")
		log.Printf("  %s", cfg.ServerKey)
		log.Printf("=====================================")
	}
	log.Printf("Zell server starting on :%s", cfg.Port)
	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
