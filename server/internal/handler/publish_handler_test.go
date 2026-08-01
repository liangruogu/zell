package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"zell-server/internal/model"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

func setupPublishTest(t *testing.T) (*gin.Engine, *repository.DB, *repository.PublishRepo) {
	gin.SetMode(gin.TestMode)
	db, err := repository.NewInMemory()
	if err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	publishRepo := repository.NewPublishRepo(db)
	publishH := NewPublishHandler(db, publishRepo)

	r := gin.New()

	api := r.Group("/api/v1")
	{
		api.POST("/projects/:pid/publish/config", publishH.SaveConfig)
		api.POST("/projects/:pid/publish/articles", publishH.SaveArticle)
		api.POST("/projects/:pid/publish/whiteboards", publishH.SaveWhiteboard)
	}

	pub := r.Group("/pub")
	{
		pub.GET("/:pid", publishH.WikiIndex)
		pub.GET("/:pid/articles/:aid", publishH.WikiArticle)
		pub.GET("/:pid/ppt/:wid", publishH.PPTPreview)
	}

	return r, db, publishRepo
}

func seedPublishConfig(t *testing.T, repo *repository.PublishRepo, projectID string, enabled bool, wiki, ppt []string, projectName string) {
	t.Helper()
	data := model.PublishData{
		Enabled:     enabled,
		Wiki:        wiki,
		PPT:         ppt,
		ProjectName: projectName,
	}
	dataJSON, _ := json.Marshal(data)
	if err := repo.UpsertConfig(projectID, string(dataJSON), "2024-01-01T00:00:00Z"); err != nil {
		t.Fatalf("seedPublishConfig failed: %v", err)
	}
}

func TestSaveConfig(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	body := `{"data":"{\"enabled\":true,\"wiki\":[\"a1\"],\"project_name\":\"Test Wiki\"}","updated_at":"2024-01-01T00:00:00Z"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	cfg, err := repo.GetConfig("p1")
	if err != nil || cfg == nil {
		t.Fatalf("expected config to be saved, err=%v", err)
	}
	var data model.PublishData
	json.Unmarshal([]byte(cfg.Data), &data)
	if !data.Enabled {
		t.Error("expected publish to be enabled")
	}
	if data.ProjectName != "Test Wiki" {
		t.Errorf("expected ProjectName 'Test Wiki', got '%s'", data.ProjectName)
	}
}

func TestSaveConfigInvalidJSON(t *testing.T) {
	r, _, _ := setupPublishTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/config", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestSaveArticle(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	body := `{"id":"a1","title":"Published Article","content_html":"<h1>Hello</h1>","updated_at":"2024-01-01T00:00:00Z"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/articles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	a, err := repo.GetArticle("a1")
	if err != nil || a == nil {
		t.Fatalf("expected article to be saved, err=%v", err)
	}
	if a.Title != "Published Article" {
		t.Errorf("expected title 'Published Article', got '%s'", a.Title)
	}
	if a.ContentHTML != "<h1>Hello</h1>" {
		t.Errorf("expected content_html '<h1>Hello</h1>', got '%s'", a.ContentHTML)
	}
}

func TestSaveArticleInvalidJSON(t *testing.T) {
	r, _, _ := setupPublishTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/articles", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestSaveWhiteboard(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	body := `{"id":"wb1","name":"My PPT","wb_type":"ppt","snapshot":"{\"slides\":[]}","updated_at":"2024-01-01T00:00:00Z"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/whiteboards", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	wb, err := repo.GetWhiteboard("wb1")
	if err != nil || wb == nil {
		t.Fatalf("expected whiteboard to be saved, err=%v", err)
	}
	if wb.Name != "My PPT" {
		t.Errorf("expected name 'My PPT', got '%s'", wb.Name)
	}
}

func TestSaveWhiteboardInvalidJSON(t *testing.T) {
	r, _, _ := setupPublishTest(t)

	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/whiteboards", strings.NewReader(`{bad}`))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestWikiIndex(t *testing.T) {
	r, db, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, []string{"a1", "a2"}, nil, "My Wiki")
	db.CreateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "Page One", Content: "# One"})
	db.CreateArticle(&model.Article{ID: "a2", ProjectID: "p1", Title: "Page Two", Content: "# Two"})
	db.CreateArticle(&model.Article{ID: "a3", ProjectID: "p1", Title: "Not Included", Content: "# Nope"})

	req := httptest.NewRequest("GET", "/pub/p1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	if !strings.Contains(body, "Page One") {
		t.Error("expected body to contain 'Page One'")
	}
	if !strings.Contains(body, "Page Two") {
		t.Error("expected body to contain 'Page Two'")
	}
	if strings.Contains(body, "Not Included") {
		t.Error("expected body NOT to contain 'Not Included' (not in wiki list)")
	}
}

func TestWikiIndexNotEnabled(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", false, []string{"a1"}, nil, "My Wiki")

	req := httptest.NewRequest("GET", "/pub/p1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestWikiIndexNoConfig(t *testing.T) {
	r, _, _ := setupPublishTest(t)

	req := httptest.NewRequest("GET", "/pub/p1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestWikiArticle(t *testing.T) {
	r, db, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, []string{"a1"}, nil, "My Wiki")
	db.CreateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "Hello World", Content: "# Hello World\n\nSome content."})

	req := httptest.NewRequest("GET", "/pub/p1/articles/a1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	if !strings.Contains(body, "Hello World") {
		t.Error("expected body to contain 'Hello World'")
	}
}

func TestWikiArticleNotFound(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, []string{"a1"}, nil, "My Wiki")

	req := httptest.NewRequest("GET", "/pub/p1/articles/a1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestWikiArticleNotInList(t *testing.T) {
	r, db, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, []string{"a1"}, nil, "My Wiki")
	db.CreateArticle(&model.Article{ID: "a2", ProjectID: "p1", Title: "Not Listed", Content: "# Nope"})

	req := httptest.NewRequest("GET", "/pub/p1/articles/a2", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestPPTPreview(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, nil, []string{"wb1"}, "My PPT")
	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID:        "wb1",
		ProjectID: "p1",
		Name:      "My Slides",
		WbType:    "ppt",
		Snapshot: `{"slides":[{"id":"s1","name":"Slide 1","elements":[],"background":"#ffffff"}]}`,
	})

	req := httptest.NewRequest("GET", "/pub/p1/ppt/wb1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	body := w.Body.String()
	if !strings.Contains(body, "My Slides") {
		t.Error("expected body to contain 'My Slides'")
	}
}

func TestPPTPreviewNotFound(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, nil, []string{"wb1"}, "My PPT")

	req := httptest.NewRequest("GET", "/pub/p1/ppt/wb1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestPPTPreviewNotInList(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, nil, []string{"wb1"}, "My PPT")
	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID:        "wb2",
		ProjectID: "p1",
		Name:      "Not Listed",
		WbType:    "ppt",
		Snapshot:  `{"slides":[]}`,
	})

	req := httptest.NewRequest("GET", "/pub/p1/ppt/wb2", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestSaveArticleUpdateExisting(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	repo.UpsertArticle(&model.PublishArticle{
		ID:          "a1",
		ProjectID:   "p1",
		Title:       "Original",
		ContentHTML: "<h1>Old</h1>",
	})

	body := `{"id":"a1","title":"Updated","content_html":"<h1>New</h1>","updated_at":"2024-01-02T00:00:00Z"}`
	req := httptest.NewRequest("POST", "/api/v1/projects/p1/publish/articles", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	a, _ := repo.GetArticle("a1")
	if a.Title != "Updated" {
		t.Errorf("expected title 'Updated', got '%s'", a.Title)
	}
	if a.ContentHTML != "<h1>New</h1>" {
		t.Errorf("expected updated content_html, got '%s'", a.ContentHTML)
	}
}

func TestWikiIndexEmptyWikiList(t *testing.T) {
	r, _, repo := setupPublishTest(t)

	seedPublishConfig(t, repo, "p1", true, []string{}, nil, "Empty Wiki")

	req := httptest.NewRequest("GET", "/pub/p1", nil)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404 for empty wiki list, got %d", w.Code)
	}
}
