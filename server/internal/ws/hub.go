package ws

import (
	"encoding/json"
	"log"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

type roomKey string

type Hub struct {
	rooms          map[roomKey]map[*Client]bool
	register       chan *Client
	unregister     chan *Client
	mu             sync.RWMutex
	onSnapshot     func(docID string, state []byte)
	onMemberEvent  func(projectID, clientID string, online bool)
	onLoadSnapshot func(docID string) []byte
}

func NewHub(onSnapshot func(docID string, state []byte), onMemberEvent func(projectID, clientID string, online bool)) *Hub {
	return &Hub{
		rooms:          make(map[roomKey]map[*Client]bool),
		register:       make(chan *Client, 256),
		unregister:     make(chan *Client, 256),
		onSnapshot:     onSnapshot,
		onMemberEvent:  onMemberEvent,
		onLoadSnapshot: nil,
	}
}

func (h *Hub) SetLoadSnapshot(fn func(docID string) []byte) {
	h.onLoadSnapshot = fn
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			key := roomKey(client.room)
			if h.rooms[key] == nil {
				h.rooms[key] = make(map[*Client]bool)
			}
			h.rooms[key][client] = true
			h.mu.Unlock()

			if h.onMemberEvent != nil {
				h.onMemberEvent(client.projectID, client.clientID, true)
			}
			log.Printf("[hub] client joined room %s (%d clients)", client.room, len(h.rooms[key]))

		case client := <-h.unregister:
			h.mu.Lock()
			key := roomKey(client.room)
			if clients, ok := h.rooms[key]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.rooms, key)
				}
			}
			h.mu.Unlock()

			if h.onMemberEvent != nil {
				h.onMemberEvent(client.projectID, client.clientID, false)
			}
			close(client.send)
			log.Printf("[hub] client left room %s", client.room)
		}
	}
}

func (h *Hub) broadcast(room string, sender *Client, msg []byte) {
	h.mu.RLock()
	key := roomKey(room)
	clients := h.rooms[key]
	h.mu.RUnlock()

	if clients == nil {
		return
	}

	msgType, payload := DecodeMessage(msg)

	for client := range clients {
		if client == sender {
			continue
		}
		client.Send(msg)
	}

	// If sender is the only client and sends SyncStep1, load persisted snapshot
	if msgType == MsgSyncStep1 && len(clients) == 1 {
		if _, exists := clients[sender]; exists && h.onLoadSnapshot != nil {
			if state := h.onLoadSnapshot(room); state != nil && len(state) > 0 {
				sender.Send(EncodeSyncStep1(state))
			}
		}
	}

	// Save snapshot periodically on updates
	if msgType == MsgUpdate && h.onSnapshot != nil {
		h.onSnapshot(room, payload)
	}
}

func (h *Hub) GetClientCount(room string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[roomKey(room)])
}

func (h *Hub) HandleWebSocket(conn *websocket.Conn, room, clientID, projectID string) {
	client := NewClient(h, conn, room, clientID, projectID)
	h.register <- client
	go client.WriteLoop()
	client.ReadLoop()
}

func (h *Hub) BroadcastProject(projectID string, event string, data interface{}) {
	msg, _ := json.Marshal(map[string]interface{}{
		"type":       event,
		"project_id": projectID,
		"data":       data,
	})

	h.mu.RLock()
	defer h.mu.RUnlock()

	// Only broadcast to notification rooms, not Yjs editing rooms
	notifPrefix := projectID + ":__notifications__"
	totalClients := 0
	for key, clients := range h.rooms {
		if strings.HasPrefix(string(key), notifPrefix) {
			for client := range clients {
				client.Send(msg)
				totalClients++
			}
		}
	}
	log.Printf("[hub] broadcast %s to project %s: %d client(s) in %d room(s) (total rooms: %d)",
		event, projectID, totalClients, countNotificationRooms(h.rooms, notifPrefix), len(h.rooms))
}

func countNotificationRooms(rooms map[roomKey]map[*Client]bool, prefix string) int {
	count := 0
	for key := range rooms {
		if strings.HasPrefix(string(key), prefix) {
			count++
		}
	}
	return count
}
