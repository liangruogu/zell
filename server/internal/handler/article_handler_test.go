package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"zell-server/internal/model"
	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
)

func setupArticleTest(t *testing.T) (*gin.Engine, *repository.DB) {
	gin.SetMode(gin.TestMode)
	db, err := repository.NewInMemory()
	if err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	hub := ws.NewHub(nil, nil)
	go hub.Run()

	articleH := NewArticleHandler(db, hub)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if c.GetHeader("X-Server-Key") != "test-key" {
			c.JSON(http.StatusForbidden, gin.H{"error": "invalid server key"})
			c.Abort()
			return
		}
		c.Next()
	})

	api := r.Group("/api/v1")
	{
		api.POST("/projects/:pid/articles", articleH.Create)
		api.PUT("/projects/:pid/articles/:aid", articleH.Update)
		api.DELETE("/projects/:pid/articles/:aid", articleH.Delete)
		api.GET("/projects/:pid/articles", articleH.List)
	}

	return r, db
}

func seedProject(t *testing.T, db *repository.DB, projectID string) {
	t.Helper()
	if err := db.SetCollabEnabled(projectID, true, "owner-token", "Test Project"); err != nil {
		t.Fatalf("seedProject failed: %v", err)
	}
}

func seedArticle(t *testing.T, db *repository.DB, projectID, id, title string) {
	t.Helper()
	a := &model.Article{
		ID:        id,
		ProjectID: projectID,
		Title:     title,
	}
	if err := db.CreateArticle(a); err != nil {
		t.Fatalf("seedArticle failed: %v", err)
	}
}

func TestCreateArticleHandler(t *testing.T) {
	r, _ := setupArticleTest(t)

	body := `{"title":"Test","content":"# Hello"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/articles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.Article
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.ID == "" {
		t.Error("expected article ID in response")
	}
	if resp.Title != "Test" {
		t.Errorf("expected title 'Test', got '%s'", resp.Title)
	}
}

func TestCreateArticleHandlerWithID(t *testing.T) {
	r, _ := setupArticleTest(t)

	body := `{"id":"my-custom-id","title":"Custom ID","content":"blah"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/articles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.Article
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.ID != "my-custom-id" {
		t.Errorf("expected id 'my-custom-id', got '%s'", resp.ID)
	}
}

func TestGetArticlesHandler(t *testing.T) {
	r, db := setupArticleTest(t)

	seedProject(t, db, "p1")
	seedArticle(t, db, "p1", "a1", "Article One")
	seedArticle(t, db, "p1", "a2", "Article Two")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/articles", nil)
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var articles []model.Article
	json.Unmarshal(w.Body.Bytes(), &articles)
	if len(articles) != 2 {
		t.Errorf("expected 2 articles, got %d", len(articles))
	}
}

func TestGetArticlesHandlerProjectNotFound(t *testing.T) {
	r, _ := setupArticleTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/nonexistent/articles", nil)
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for project without collab, got %d", w.Code)
	}
}

func TestDeleteArticleHandler(t *testing.T) {
	r, db := setupArticleTest(t)

	seedArticle(t, db, "p1", "a1", "To Delete")

	req := httptest.NewRequest("DELETE", "/api/v1/projects/p1/articles/a1", nil)
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	articles, _ := db.ListArticles("p1")
	if len(articles) != 0 {
		t.Errorf("expected 0 articles after delete, got %d", len(articles))
	}
}

func TestUpdateArticleHandler(t *testing.T) {
	r, db := setupArticleTest(t)

	seedArticle(t, db, "p1", "a1", "Original")

	body := `{"title":"Updated","content":"new content"}`
	req := httptest.NewRequest("PUT", "/api/v1/projects/p1/articles/a1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp model.Article
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.Title != "Updated" {
		t.Errorf("expected title 'Updated', got '%s'", resp.Title)
	}
}

func TestUpdateArticleHandlerCreatesIfNotFound(t *testing.T) {
	r, db := setupArticleTest(t)

	body := `{"title":"New Article","content":"hello"}`
	req := httptest.NewRequest("PUT", "/api/v1/projects/p1/articles/a1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	got, _ := db.GetArticle("a1")
	if got == nil || got.Title != "New Article" {
		t.Error("expected article to be created via update")
	}
}

func TestCreateArticleHandlerInvalidJSON(t *testing.T) {
	r, _ := setupArticleTest(t)

	body := `not json`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/articles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", w.Code)
	}
}

func TestGetArticlesMissingAuth(t *testing.T) {
	r, _ := setupArticleTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/articles", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for missing auth, got %d", w.Code)
	}
}

func TestGetArticlesWrongAuth(t *testing.T) {
	r, _ := setupArticleTest(t)

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/articles", nil)
	req.Header.Set("X-Server-Key", "wrong-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected 403 for wrong auth, got %d", w.Code)
	}
}

func TestListArticlesEmptyProject(t *testing.T) {
	r, db := setupArticleTest(t)

	seedProject(t, db, "p1")

	req := httptest.NewRequest("GET", "/api/v1/projects/p1/articles", nil)
	req.Header.Set("X-Server-Key", "test-key")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var articles []model.Article
	json.Unmarshal(w.Body.Bytes(), &articles)
	if len(articles) != 0 {
		t.Errorf("expected 0 articles, got %d", len(articles))
	}
}
