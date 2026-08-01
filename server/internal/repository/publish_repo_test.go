package repository

import (
	"testing"
	"time"

	"zell-server/internal/model"
)

func TestUpsertConfig(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	now := time.Now().UTC().Format(time.RFC3339)
	err := repo.UpsertConfig("p1", `{"enabled":true}`, now)
	if err != nil {
		t.Fatalf("UpsertConfig failed: %v", err)
	}

	cfg, err := repo.GetConfig("p1")
	if err != nil {
		t.Fatalf("GetConfig failed: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected config, got nil")
	}
	if cfg.ProjectID != "p1" {
		t.Errorf("expected project_id 'p1', got '%s'", cfg.ProjectID)
	}
	if cfg.Data != `{"enabled":true}` {
		t.Errorf("expected data '{\"enabled\":true}', got '%s'", cfg.Data)
	}
	if cfg.UpdatedAt != now {
		t.Errorf("expected updated_at '%s', got '%s'", now, cfg.UpdatedAt)
	}
}

func TestUpsertConfigUpdate(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertConfig("p1", `{"enabled":true}`, "2024-01-01T00:00:00Z")
	repo.UpsertConfig("p1", `{"enabled":false}`, "2024-06-01T00:00:00Z")

	cfg, _ := repo.GetConfig("p1")
	if cfg.Data != `{"enabled":false}` {
		t.Errorf("expected updated data, got '%s'", cfg.Data)
	}
	if cfg.UpdatedAt != "2024-06-01T00:00:00Z" {
		t.Errorf("expected updated_at '2024-06-01T00:00:00Z', got '%s'", cfg.UpdatedAt)
	}
}

func TestGetConfigNotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	cfg, err := repo.GetConfig("nonexistent")
	if err != nil {
		t.Fatalf("GetConfig failed: %v", err)
	}
	if cfg != nil {
		t.Error("expected nil config for nonexistent project")
	}
}

func TestUpsertArticle(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	article := &model.PublishArticle{
		ID:          "a1",
		ProjectID:   "p1",
		Title:       "Published Article",
		ContentHTML: "<h1>Hello</h1>",
		UpdatedAt:   "2024-01-01T00:00:00Z",
	}
	err := repo.UpsertArticle(article)
	if err != nil {
		t.Fatalf("UpsertArticle failed: %v", err)
	}

	got, err := repo.GetArticle("a1")
	if err != nil {
		t.Fatalf("GetArticle failed: %v", err)
	}
	if got.Title != "Published Article" {
		t.Errorf("expected 'Published Article', got '%s'", got.Title)
	}
	if got.ContentHTML != "<h1>Hello</h1>" {
		t.Errorf("expected '<h1>Hello</h1>', got '%s'", got.ContentHTML)
	}
}

func TestUpsertArticleUpdate(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertArticle(&model.PublishArticle{
		ID: "a1", ProjectID: "p1", Title: "Old", ContentHTML: "<p>old</p>", UpdatedAt: "2024-01-01T00:00:00Z",
	})
	repo.UpsertArticle(&model.PublishArticle{
		ID: "a1", ProjectID: "p1", Title: "New", ContentHTML: "<p>new</p>", UpdatedAt: "2024-06-01T00:00:00Z",
	})

	got, _ := repo.GetArticle("a1")
	if got.Title != "New" {
		t.Errorf("expected 'New', got '%s'", got.Title)
	}
	if got.ContentHTML != "<p>new</p>" {
		t.Errorf("expected '<p>new</p>', got '%s'", got.ContentHTML)
	}
	if got.UpdatedAt != "2024-06-01T00:00:00Z" {
		t.Errorf("expected updated_at '2024-06-01T00:00:00Z', got '%s'", got.UpdatedAt)
	}
}

func TestGetPublishArticleNotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	_, err := repo.GetArticle("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent article")
	}
}

func TestDeletePublishArticle(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertArticle(&model.PublishArticle{
		ID: "a1", ProjectID: "p1", Title: "Del", ContentHTML: "<p>x</p>", UpdatedAt: "now",
	})
	err := repo.DeleteArticle("a1")
	if err != nil {
		t.Fatalf("DeleteArticle failed: %v", err)
	}

	_, err = repo.GetArticle("a1")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestUpsertWhiteboard(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	wb := &model.PublishWhiteboard{
		ID:        "wb1",
		ProjectID: "p1",
		Name:      "Board 1",
		WbType:    "ppt",
		Snapshot:  `{"shapes":[]}`,
		UpdatedAt: "2024-01-01T00:00:00Z",
	}
	err := repo.UpsertWhiteboard(wb)
	if err != nil {
		t.Fatalf("UpsertWhiteboard failed: %v", err)
	}

	got, err := repo.GetWhiteboard("wb1")
	if err != nil {
		t.Fatalf("GetWhiteboard failed: %v", err)
	}
	if got.Name != "Board 1" {
		t.Errorf("expected 'Board 1', got '%s'", got.Name)
	}
	if got.WbType != "ppt" {
		t.Errorf("expected wb_type 'ppt', got '%s'", got.WbType)
	}
	if got.Snapshot != `{"shapes":[]}` {
		t.Errorf("expected snapshot '{\"shapes\":[]}', got '%s'", got.Snapshot)
	}
}

func TestUpsertWhiteboardUpdate(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb1", ProjectID: "p1", Name: "Old", WbType: "ppt", Snapshot: "{}", UpdatedAt: "old",
	})
	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb1", ProjectID: "p1", Name: "New", WbType: "ppt", Snapshot: `{"v":2}`, UpdatedAt: "new",
	})

	got, _ := repo.GetWhiteboard("wb1")
	if got.Name != "New" {
		t.Errorf("expected 'New', got '%s'", got.Name)
	}
	if got.Snapshot != `{"v":2}` {
		t.Errorf("expected '{\"v\":2}', got '%s'", got.Snapshot)
	}
}

func TestGetWhiteboardNotFound(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	_, err := repo.GetWhiteboard("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent whiteboard")
	}
}

func TestGetWhiteboardsByType(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb1", ProjectID: "p1", Name: "B1", WbType: "ppt", Snapshot: "{}", UpdatedAt: "now",
	})
	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb2", ProjectID: "p1", Name: "B2", WbType: "ppt", Snapshot: "{}", UpdatedAt: "now",
	})
	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb3", ProjectID: "p1", Name: "B3", WbType: "wiki", Snapshot: "{}", UpdatedAt: "now",
	})

	wbs, err := repo.GetWhiteboardsByType("p1", "ppt", []string{"wb1", "wb2", "wb4"})
	if err != nil {
		t.Fatalf("GetWhiteboardsByType failed: %v", err)
	}
	if len(wbs) != 2 {
		t.Fatalf("expected 2 whiteboards, got %d", len(wbs))
	}
	for _, w := range wbs {
		if w.WbType != "ppt" {
			t.Errorf("expected wb_type 'ppt', got '%s'", w.WbType)
		}
	}
}

func TestGetWhiteboardsByTypeEmptyIDs(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	wbs, err := repo.GetWhiteboardsByType("p1", "ppt", nil)
	if err != nil {
		t.Fatalf("GetWhiteboardsByType failed: %v", err)
	}
	if wbs != nil {
		t.Error("expected nil for empty ids")
	}

	wbs, err = repo.GetWhiteboardsByType("p1", "ppt", []string{})
	if err != nil {
		t.Fatalf("GetWhiteboardsByType failed: %v", err)
	}
	if wbs != nil {
		t.Error("expected nil for empty ids")
	}
}

func TestGetWhiteboardsByTypeNoMatch(t *testing.T) {
	db := setupTestDB(t)
	repo := NewPublishRepo(db)

	repo.UpsertWhiteboard(&model.PublishWhiteboard{
		ID: "wb1", ProjectID: "p1", Name: "B1", WbType: "ppt", Snapshot: "{}", UpdatedAt: "now",
	})

	wbs, err := repo.GetWhiteboardsByType("p1", "ppt", []string{"wb99"})
	if err != nil {
		t.Fatalf("GetWhiteboardsByType failed: %v", err)
	}
	if len(wbs) != 0 {
		t.Errorf("expected 0 whiteboards, got %d", len(wbs))
	}
}
