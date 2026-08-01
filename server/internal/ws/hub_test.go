package ws

import (
	"testing"
	"time"
)

func TestHubRegisterClient(t *testing.T) {
	hub := NewHub(nil, nil)
	go hub.Run()

	hub.register <- newTestClient("room1", "user1")

	time.Sleep(10 * time.Millisecond)

	count := hub.GetClientCount("room1")
	if count != 1 {
		t.Errorf("expected 1 client, got %d", count)
	}
}

func TestHubUnregisterClient(t *testing.T) {
	hub := NewHub(nil, nil)
	go hub.Run()

	client := newTestClient("room1", "user1")
	hub.register <- client
	time.Sleep(10 * time.Millisecond)

	hub.unregister <- client
	time.Sleep(10 * time.Millisecond)

	count := hub.GetClientCount("room1")
	if count != 0 {
		t.Errorf("expected 0 clients, got %d", count)
	}
}

func TestHubGetClientCountEmptyRoom(t *testing.T) {
	hub := NewHub(nil, nil)
	go hub.Run()

	count := hub.GetClientCount("nonexistent")
	if count != 0 {
		t.Errorf("expected 0 for nonexistent room, got %d", count)
	}
}

func TestHubOnSnapshotCallback(t *testing.T) {
	called := make(chan string, 1)
	hub := NewHub(nil, nil)
	hub.onSnapshot = func(docID string, state []byte) {
		called <- docID
	}
	go hub.Run()

	client := newTestClient("room1", "user1")
	hub.register <- client
	time.Sleep(10 * time.Millisecond)

	hub.broadcast("room1", client, EncodeUpdate([]byte("update-data")))
	time.Sleep(10 * time.Millisecond)

	select {
	case docID := <-called:
		if docID != "room1" {
			t.Errorf("expected room1, got %s", docID)
		}
	case <-time.After(time.Second):
		t.Error("snapshot callback not called")
	}
}

func newTestClient(room, clientID string) *Client {
	return &Client{
		room:     room,
		clientID: clientID,
		send:     make(chan []byte, 256),
		hub:      nil,
		conn:     nil,
	}
}
