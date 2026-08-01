package repository

import (
	"testing"
	"time"
)

func TestCreateNotification(t *testing.T) {
	db := setupTestDB(t)

	err := db.CreateNotification("p1", "client1", "invite", `{"from":"client2"}`)
	if err != nil {
		t.Fatalf("CreateNotification failed: %v", err)
	}

	notifs, err := db.GetNotifications("client1")
	if err != nil {
		t.Fatalf("GetNotifications failed: %v", err)
	}
	if len(notifs) != 1 {
		t.Fatalf("expected 1 notification, got %d", len(notifs))
	}
	n := notifs[0]
	if n.ProjectID != "p1" {
		t.Errorf("expected project_id 'p1', got '%s'", n.ProjectID)
	}
	if n.ClientID != "client1" {
		t.Errorf("expected client_id 'client1', got '%s'", n.ClientID)
	}
	if n.Type != "invite" {
		t.Errorf("expected type 'invite', got '%s'", n.Type)
	}
	if n.Data != `{"from":"client2"}` {
		t.Errorf("expected data '{\"from\":\"client2\"}', got '%s'", n.Data)
	}
	if n.IsRead {
		t.Error("expected notification to be unread")
	}
	if n.CreatedAt == "" {
		t.Error("expected CreatedAt to be set")
	}
}

func TestGetNotifications(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "invite", `{}`)
	db.CreateNotification("p1", "client1", "approve", `{}`)
	db.CreateNotification("p2", "client2", "reject", `{}`)

	notifs, err := db.GetNotifications("client1")
	if err != nil {
		t.Fatalf("GetNotifications failed: %v", err)
	}
	if len(notifs) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(notifs))
	}
}

func TestGetNotificationsEmpty(t *testing.T) {
	db := setupTestDB(t)

	notifs, err := db.GetNotifications("nonexistent")
	if err != nil {
		t.Fatalf("GetNotifications failed: %v", err)
	}
	if len(notifs) != 0 {
		t.Errorf("expected 0 notifications, got %d", len(notifs))
	}
}

func TestMarkNotificationsRead(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "invite", `{}`)
	db.CreateNotification("p1", "client1", "approve", `{}`)

	err := db.MarkNotificationsRead("client1")
	if err != nil {
		t.Fatalf("MarkNotificationsRead failed: %v", err)
	}

	notifs, _ := db.GetNotifications("client1")
	for _, n := range notifs {
		if !n.IsRead {
			t.Errorf("expected notification %s to be read", n.ID)
		}
	}
}

func TestMarkNotificationsReadDifferentClient(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "invite", `{}`)
	db.CreateNotification("p1", "client2", "approve", `{}`)

	err := db.MarkNotificationsRead("client1")
	if err != nil {
		t.Fatalf("MarkNotificationsRead failed: %v", err)
	}

	notifs1, _ := db.GetNotifications("client1")
	for _, n := range notifs1 {
		if !n.IsRead {
			t.Error("expected client1 notifications to be read")
		}
	}

	notifs2, _ := db.GetNotifications("client2")
	for _, n := range notifs2 {
		if n.IsRead {
			t.Error("expected client2 notifications to remain unread")
		}
	}
}

func TestCleanupOldNotifications(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "old", `{}`)
	db.CreateNotification("p1", "client1", "new", `{}`)

	db.MarkNotificationsRead("client1")

	notifs, _ := db.GetNotifications("client1")
	if len(notifs) != 2 {
		t.Fatalf("expected 2 notifications before cleanup, got %d", len(notifs))
	}

	oldNotif := notifs[1]
	cutoff := time.Now().UTC().Add(-8 * 24 * time.Hour).Format(time.RFC3339)
	db.conn.Exec(`UPDATE notifications SET created_at = ? WHERE id = ?`, cutoff, oldNotif.ID)

	err := db.CleanupOldNotifications()
	if err != nil {
		t.Fatalf("CleanupOldNotifications failed: %v", err)
	}

	remaining, _ := db.GetNotifications("client1")
	if len(remaining) != 1 {
		t.Fatalf("expected 1 notification after cleanup, got %d", len(remaining))
	}
}

func TestCleanupOldNotificationsRespectsUnread(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "old-unread", `{}`)

	notifs, _ := db.GetNotifications("client1")
	oldNotif := notifs[0]
	cutoff := time.Now().UTC().Add(-8 * 24 * time.Hour).Format(time.RFC3339)
	db.conn.Exec(`UPDATE notifications SET created_at = ? WHERE id = ?`, cutoff, oldNotif.ID)

	err := db.CleanupOldNotifications()
	if err != nil {
		t.Fatalf("CleanupOldNotifications failed: %v", err)
	}

	remaining, _ := db.GetNotifications("client1")
	if len(remaining) != 1 {
		t.Fatalf("expected 1 notification (unread preserved), got %d", len(remaining))
	}
}

func TestNotificationOrder(t *testing.T) {
	db := setupTestDB(t)

	db.CreateNotification("p1", "client1", "first", `{}`)
	time.Sleep(20 * time.Millisecond)
	db.CreateNotification("p1", "client1", "second", `{}`)

	notifs, _ := db.GetNotifications("client1")
	if len(notifs) != 2 {
		t.Fatalf("expected 2 notifications, got %d", len(notifs))
	}
	if notifs[0].CreatedAt < notifs[1].CreatedAt {
		t.Error("expected most recent notification first")
	}
}
