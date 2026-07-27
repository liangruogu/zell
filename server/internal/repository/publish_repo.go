package repository

import (
	"database/sql"
	"zell-server/internal/model"
)

type PublishRepo struct {
	db *DB
}

func NewPublishRepo(db *DB) *PublishRepo {
	return &PublishRepo{db: db}
}

func (r *PublishRepo) UpsertConfig(projectID, data, updatedAt string) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_config (project_id, data, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		projectID, data, updatedAt,
	)
	return err
}

func (r *PublishRepo) GetConfig(projectID string) (*model.PublishConfig, error) {
	row := r.db.conn.QueryRow(
		`SELECT project_id, data, updated_at FROM publish_config WHERE project_id = ?`,
		projectID,
	)
	var c model.PublishConfig
	err := row.Scan(&c.ProjectID, &c.Data, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *PublishRepo) UpsertArticle(article *model.PublishArticle) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_articles (id, project_id, title, content_html, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET title = excluded.title, content_html = excluded.content_html, updated_at = excluded.updated_at`,
		article.ID, article.ProjectID, article.Title, article.ContentHTML, article.UpdatedAt,
	)
	return err
}

func (r *PublishRepo) GetArticle(id string) (*model.PublishArticle, error) {
	row := r.db.conn.QueryRow(
		`SELECT id, project_id, title, content_html, updated_at FROM publish_articles WHERE id = ?`,
		id,
	)
	var a model.PublishArticle
	err := row.Scan(&a.ID, &a.ProjectID, &a.Title, &a.ContentHTML, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *PublishRepo) DeleteArticle(id string) error {
	_, err := r.db.conn.Exec(`DELETE FROM publish_articles WHERE id = ?`, id)
	return err
}

func (r *PublishRepo) UpsertWhiteboard(wb *model.PublishWhiteboard) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_whiteboards (id, project_id, name, wb_type, snapshot, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET name = excluded.name, wb_type = excluded.wb_type, snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
		wb.ID, wb.ProjectID, wb.Name, wb.WbType, wb.Snapshot, wb.UpdatedAt,
	)
	return err
}

func (r *PublishRepo) GetWhiteboard(id string) (*model.PublishWhiteboard, error) {
	row := r.db.conn.QueryRow(
		`SELECT id, project_id, name, wb_type, snapshot, updated_at FROM publish_whiteboards WHERE id = ?`,
		id,
	)
	var w model.PublishWhiteboard
	err := row.Scan(&w.ID, &w.ProjectID, &w.Name, &w.WbType, &w.Snapshot, &w.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *PublishRepo) GetWhiteboardsByType(projectID, wbType string, ids []string) ([]model.PublishWhiteboard, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	query := `SELECT id, project_id, name, wb_type, snapshot, updated_at FROM publish_whiteboards
		WHERE project_id = ? AND wb_type = ? AND id IN (` + placeholders(len(ids)) + `)`
	args := []interface{}{projectID, wbType}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := r.db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var wbs []model.PublishWhiteboard
	for rows.Next() {
		var w model.PublishWhiteboard
		if err := rows.Scan(&w.ID, &w.ProjectID, &w.Name, &w.WbType, &w.Snapshot, &w.UpdatedAt); err != nil {
			return nil, err
		}
		wbs = append(wbs, w)
	}
	return wbs, rows.Err()
}

func placeholders(n int) string {
	if n == 0 {
		return ""
	}
	s := "?,"
	for i := 1; i < n; i++ {
		s += ",?"
	}
	return s
}
