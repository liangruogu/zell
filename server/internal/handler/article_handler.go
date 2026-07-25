package handler

import (
	"net/http"

	"bindle-server/internal/model"
	"bindle-server/internal/repository"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ArticleHandler struct {
	db *repository.DB
}

func NewArticleHandler(db *repository.DB) *ArticleHandler {
	return &ArticleHandler{db: db}
}

func (h *ArticleHandler) List(c *gin.Context) {
	pid := c.Param("pid")
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
		Title       string  `json:"title"`
		Content     string  `json:"content"`
		ContentJSON string  `json:"content_json"`
		ParentID    *string `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	article := &model.Article{
		ID:          uuid.Must(uuid.NewV7()).String(),
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
	c.JSON(http.StatusCreated, article)
}

func (h *ArticleHandler) Update(c *gin.Context) {
	aid := c.Param("aid")
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
		c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
		return
	}

	article.Title = req.Title
	article.Content = req.Content
	article.ContentJSON = req.ContentJSON

	if err := h.db.UpdateArticle(article); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, article)
}

func (h *ArticleHandler) Delete(c *gin.Context) {
	aid := c.Param("aid")
	if err := h.db.DeleteArticle(aid); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
