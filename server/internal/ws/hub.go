package ws

import (
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type roomKey string

type Hub struct {
	rooms      map[roomKey]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	onSnapshot func(docID string, state []byte) // callback to persist snapshot
}

func NewHub(onSnapshot func(docID string, state []byte)) *Hub {
	return &Hub{
		rooms:      make(map[roomKey]map[*Client]bool),
		register:   make(chan *Client, 256),
		unregister: make(chan *Client, 256),
		onSnapshot: onSnapshot,
	}
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
		switch msgType {
		case MsgSyncStep1:
			client.Send(EncodeSyncStep1(payload))
		case MsgSyncStep2:
			client.Send(EncodeSyncStep2(payload))
		case MsgUpdate:
			client.Send(EncodeUpdate(payload))
			// Periodically save snapshot
			if h.onSnapshot != nil {
				h.onSnapshot(room, payload)
			}
		}
	}
}

func (h *Hub) GetClientCount(room string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.rooms[roomKey(room)])
}

func (h *Hub) HandleWebSocket(conn *websocket.Conn, room, clientID string) {
	client := NewClient(h, conn, room, clientID)
	h.register <- client
	go client.WriteLoop()
	client.ReadLoop()
}
