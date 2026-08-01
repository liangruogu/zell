package repository

import (
	"testing"
	"time"

	"zell-server/internal/model"
)

func TestCreateArticle(t *testing.T) {
	db := setupTestDB(t)

	a := &model.Article{
		ID:        "a1",
		ProjectID: "p1",
		Title:     "Test Article",
		Content:   "# Hello\ntest content",
	}
	if err := db.CreateArticle(a); err != nil {
		t.Fatalf("CreateArticle failed: %v", err)
	}

	got, err := db.GetArticle("a1")
	if err != nil {
		t.Fatalf("GetArticle failed: %v", err)
	}
	if got.Title != "Test Article" {
		t.Errorf("expected 'Test Article', got '%s'", got.Title)
	}
	if got.Content != "# Hello\ntest content" {
		t.Errorf("expected content '# Hello\\ntest content', got '%s'", got.Content)
	}
}

func TestListArticles(t *testing.T) {
	db := setupTestDB(t)

	db.CreateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "Alpha"})
	db.CreateArticle(&model.Article{ID: "a2", ProjectID: "p1", Title: "Beta"})
	db.CreateArticle(&model.Article{ID: "a3", ProjectID: "p2", Title: "Gamma"})

	articles, err := db.ListArticles("p1")
	if err != nil {
		t.Fatalf("ListArticles failed: %v", err)
	}
	if len(articles) != 2 {
		t.Fatalf("expected 2 articles, got %d", len(articles))
	}
	if articles[0].SortOrder > articles[1].SortOrder {
		t.Error("articles should be ordered by sort_order")
	}
}

func TestUpdateArticle(t *testing.T) {
	db := setupTestDB(t)

	db.CreateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "Old", Content: "old"})

	err := db.UpdateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "New", Content: "new"})
	if err != nil {
		t.Fatalf("UpdateArticle failed: %v", err)
	}

	got, _ := db.GetArticle("a1")
	if got.Title != "New" {
		t.Errorf("expected 'New', got '%s'", got.Title)
	}
}

func TestDeleteArticle(t *testing.T) {
	db := setupTestDB(t)

	db.CreateArticle(&model.Article{ID: "a1", ProjectID: "p1", Title: "Del"})

	if err := db.DeleteArticle("a1"); err != nil {
		t.Fatalf("DeleteArticle failed: %v", err)
	}

	articles, _ := db.ListArticles("p1")
	if len(articles) != 0 {
		t.Errorf("expected 0 articles after delete, got %d", len(articles))
	}
}

func TestGetArticleNotFound(t *testing.T) {
	db := setupTestDB(t)

	_, err := db.GetArticle("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent article")
	}
}

func TestListArticlesEmptyProject(t *testing.T) {
	db := setupTestDB(t)

	articles, err := db.ListArticles("empty-project")
	if err != nil {
		t.Fatalf("ListArticles failed: %v", err)
	}
	if len(articles) != 0 {
		t.Errorf("expected 0 articles for empty project, got %d", len(articles))
	}
}

func TestCreateArticleWithAllFields(t *testing.T) {
	db := setupTestDB(t)

	parentID := "parent1"
	a := &model.Article{
		ID:          "a_full",
		ProjectID:   "p1",
		Title:       "Full Article",
		Content:     "# Full",
		ContentJSON: `{"type":"doc"}`,
		ParentID:    &parentID,
		SortOrder:   5,
		Version:     0,
	}
	if err := db.CreateArticle(a); err != nil {
		t.Fatalf("CreateArticle failed: %v", err)
	}

	got, err := db.GetArticle("a_full")
	if err != nil {
		t.Fatalf("GetArticle failed: %v", err)
	}
	if got.ContentJSON != `{"type":"doc"}` {
		t.Errorf("expected content_json '{\"type\":\"doc\"}', got '%s'", got.ContentJSON)
	}
	if got.ParentID == nil || *got.ParentID != "parent1" {
		t.Errorf("expected parent_id 'parent1', got '%v'", got.ParentID)
	}
	if got.SortOrder != 5 {
		t.Errorf("expected sort_order 5, got %d", got.SortOrder)
	}
}

func TestUpdateArticleNotFound(t *testing.T) {
	db := setupTestDB(t)

	err := db.UpdateArticle(&model.Article{ID: "nonexistent", Title: "X"})
	if err == nil {
		t.Error("expected error when updating nonexistent article")
	}
}

func TestArticleCreatedAtSet(t *testing.T) {
	db := setupTestDB(t)

	a := &model.Article{ID: "a_time", ProjectID: "p1", Title: "Time"}
	if err := db.CreateArticle(a); err != nil {
		t.Fatalf("CreateArticle failed: %v", err)
	}

	if a.CreatedAt == "" {
		t.Error("expected CreatedAt to be set")
	}
	if a.UpdatedAt == "" {
		t.Error("expected UpdatedAt to be set")
	}

	oldUpdatedAt := a.UpdatedAt
	time.Sleep(1500 * time.Millisecond)

	err := db.UpdateArticle(&model.Article{ID: "a_time", ProjectID: "p1", Title: "Updated"})
	if err != nil {
		t.Fatalf("UpdateArticle failed: %v", err)
	}
	got, _ := db.GetArticle("a_time")
	if got.UpdatedAt == oldUpdatedAt {
		t.Error("expected UpdatedAt to change after update")
	}
}
