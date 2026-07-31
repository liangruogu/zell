package handler

import (
	"net/http"

	"zell-server/internal/model"
	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ArticleHandler struct {
	db  *repository.DB
	hub *ws.Hub
}

func NewArticleHandler(db *repository.DB, hub *ws.Hub) *ArticleHandler {
	return &ArticleHandler{db: db, hub: hub}
}

func (h *ArticleHandler) List(c *gin.Context) {
	pid := c.Param("pid")
	proj, err := h.db.GetProject(pid)
	if err != nil || proj == nil || !proj.CollabEnabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	articles, err := h.db.ListArticles(pid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, articles)
}

func (h *ArticleHandler) Create(c *gin.Context) {
	pid := c.Param("pid")
	var req struct {
		ID          string  `json:"id"`
		Title       string  `json:"title"`
		Content     string  `json:"content"`
		ContentJSON string  `json:"content_json"`
		ParentID    *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	id := req.ID
	if id == "" {
		id = uuid.Must(uuid.NewV7()).String()
	}
	article := &model.Article{
		ID:          id,
		ProjectID:   pid,
		Title:       req.Title,
		Content:     req.Content,
		ContentJSON: req.ContentJSON,
		ParentID:    req.ParentID,
		Version:     0,
	}

	if err := h.db.CreateArticle(article); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.BroadcastProject(pid, "article_created", article)
	c.JSON(http.StatusCreated, article)
}

func (h *ArticleHandler) Update(c *gin.Context) {
	aid := c.Param("aid")
	pid := c.Param("pid")
	var req struct {
		Title       string `json:"title"`
		Content     string `json:"content"`
		ContentJSON string `json:"content_json"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	article, err := h.db.GetArticle(aid)
	if err != nil {
		// Article doesn't exist on server yet — create it
		article = &model.Article{
			ID:          aid,
			ProjectID:   pid,
			Title:       req.Title,
			Content:     req.Content,
			ContentJSON: req.ContentJSON,
			ParentID:    nil,
			Version:     0,
		}
		if err := h.db.CreateArticle(article); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		h.hub.BroadcastProject(pid, "article_created", article)
		c.JSON(http.StatusOK, article)
		return
	}

	article.Title = req.Title
	article.Content = req.Content
	article.ContentJSON = req.ContentJSON

	if err := h.db.UpdateArticle(article); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.BroadcastProject(pid, "article_updated", article)
	c.JSON(http.StatusOK, article)
}

func (h *ArticleHandler) Delete(c *gin.Context) {
	aid := c.Param("aid")
	pid := c.Param("pid")
	if err := h.db.DeleteArticle(aid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.hub.BroadcastProject(pid, "article_deleted", gin.H{"id": aid})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
