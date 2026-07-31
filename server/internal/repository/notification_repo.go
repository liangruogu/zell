package repository

import (
	"time"

	"github.com/google/uuid"
)

type Notification struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	ClientID  string `json:"client_id"`
	Type      string `json:"type"`
	Data      string `json:"data"`
	IsRead    bool   `json:"is_read"`
	CreatedAt string `json:"created_at"`
}

func (db *DB) migrateNotifications() error {
	_, err := db.conn.Exec(`
		CREATE TABLE IF NOT EXISTS notifications (
			id         TEXT PRIMARY KEY,
			project_id TEXT NOT NULL,
			client_id  TEXT NOT NULL,
			type       TEXT NOT NULL,
			data       TEXT DEFAULT '{}',
			is_read    INTEGER DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}
	db.conn.Exec(`CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications(client_id, is_read)`)
	return nil
}

func (db *DB) CreateNotification(projectID, clientID, notifType, data string) error {
	id := uuid.Must(uuid.NewV7()).String()
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(
		`INSERT INTO notifications (id, project_id, client_id, type, data, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
		id, projectID, clientID, notifType, data, now,
	)
	return err
}

func (db *DB) GetNotifications(clientID string) ([]Notification, error) {
	rows, err := db.conn.Query(
		`SELECT id, project_id, client_id, type, data, is_read, created_at FROM notifications WHERE client_id = ? ORDER BY created_at DESC`,
		clientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Notification
	for rows.Next() {
		var n Notification
		var isRead int
		if err := rows.Scan(&n.ID, &n.ProjectID, &n.ClientID, &n.Type, &n.Data, &isRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.IsRead = isRead == 1
		list = append(list, n)
	}
	if list == nil {
		list = []Notification{}
	}
	return list, nil
}

func (db *DB) MarkNotificationsRead(clientID string) error {
	_, err := db.conn.Exec(`UPDATE notifications SET is_read = 1 WHERE client_id = ?`, clientID)
	return err
}

func (db *DB) CleanupOldNotifications() error {
	cutoff := time.Now().UTC().Add(-7 * 24 * time.Hour).Format(time.RFC3339)
	_, err := db.conn.Exec(`DELETE FROM notifications WHERE is_read = 1 AND created_at < ?`, cutoff)
	return err
}
