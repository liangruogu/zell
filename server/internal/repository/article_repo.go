package repository

import (
	"database/sql"
	"time"

	"zell-server/internal/model"
)

func (db *DB) ListArticles(projectID string) ([]model.Article, error) {
	rows, err := db.conn.Query(
		`SELECT id, project_id, title, content, content_json, parent_id, sort_order, version, created_at, updated_at, deleted_at
		 FROM articles WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var articles []model.Article
	for rows.Next() {
		var a model.Article
		if err := rows.Scan(&a.ID, &a.ProjectID, &a.Title, &a.Content, &a.ContentJSON, &a.ParentID, &a.SortOrder, &a.Version, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt); err != nil {
			return nil, err
		}
		articles = append(articles, a)
	}
	if articles == nil {
		articles = []model.Article{}
	}
	return articles, nil
}

func (db *DB) GetArticle(id string) (*model.Article, error) {
	var a model.Article
	err := db.conn.QueryRow(
		`SELECT id, project_id, title, content, content_json, parent_id, sort_order, version, created_at, updated_at, deleted_at
		 FROM articles WHERE id = ? AND deleted_at IS NULL`, id).
		Scan(&a.ID, &a.ProjectID, &a.Title, &a.Content, &a.ContentJSON, &a.ParentID, &a.SortOrder, &a.Version, &a.CreatedAt, &a.UpdatedAt, &a.DeletedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (db *DB) CreateArticle(a *model.Article) error {
	now := time.Now().UTC().Format(time.RFC3339)
	a.CreatedAt = now
	a.UpdatedAt = now
	_, err := db.conn.Exec(
		`INSERT INTO articles (id, project_id, title, content, content_json, parent_id, sort_order, version, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.ProjectID, a.Title, a.Content, a.ContentJSON, a.ParentID, a.SortOrder, a.Version, a.CreatedAt, a.UpdatedAt)
	return err
}

func (db *DB) UpdateArticle(a *model.Article) error {
	a.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	result, err := db.conn.Exec(
		`UPDATE articles SET title = ?, content = ?, content_json = ?, updated_at = ?, version = version + 1
		 WHERE id = ? AND deleted_at IS NULL`,
		a.Title, a.Content, a.ContentJSON, a.UpdatedAt, a.ID)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (db *DB) DeleteArticle(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(`UPDATE articles SET deleted_at = ? WHERE id = ?`, now, id)
	return err
}
