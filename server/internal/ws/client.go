package ws

import (
	"io"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	MsgSyncStep1  = 0
	MsgSyncStep2  = 1
	MsgUpdate     = 2
)

type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	room      string
	projectID string
	send      chan []byte
	clientID  string
	mu        sync.Mutex
}

func NewClient(hub *Hub, conn *websocket.Conn, room, clientID, projectID string) *Client {
	return &Client{
		hub:       hub,
		conn:      conn,
		room:      room,
		projectID: projectID,
		send:      make(chan []byte, 256),
		clientID:  clientID,
	}
}

func (c *Client) ReadLoop() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
		log.Printf("[ws] client %s disconnected", c.clientID)
	}()
	for {
		msgType, reader, err := c.conn.NextReader()
		if err != nil {
			log.Printf("[ws] client %s read error: %v", c.clientID, err)
			break
		}
		if msgType != websocket.BinaryMessage {
			log.Printf("[ws] client %s received non-binary msg type=%d, ignoring", c.clientID, msgType)
			continue
		}
		data, err := io.ReadAll(reader)
		if err != nil || len(data) == 0 {
			log.Printf("[ws] client %s read data error: %v, len=%d", c.clientID, err, len(data))
			continue
		}
		log.Printf("[ws] client %s read %d bytes, type=%d", c.clientID, len(data), data[0])
		// Broadcast to all other clients in the room
		c.hub.broadcast(c.room, c, data)
	}
}

func (c *Client) WriteLoop() {
	defer c.conn.Close()
	for msg := range c.send {
		c.mu.Lock()
		msgType := websocket.BinaryMessage
		if len(msg) > 0 && msg[0] == '{' {
			msgType = websocket.TextMessage
		}
		w, err := c.conn.NextWriter(msgType)
		if err != nil {
			c.mu.Unlock()
			break
		}
		w.Write(msg)
		w.Close()
		c.mu.Unlock()
	}
}

func (c *Client) Send(msg []byte) {
	select {
	case c.send <- msg:
	default:
	}
}

func EncodeSyncStep1(data []byte) []byte {
	return append([]byte{MsgSyncStep1}, data...)
}

func EncodeSyncStep2(data []byte) []byte {
	return append([]byte{MsgSyncStep2}, data...)
}

func EncodeUpdate(data []byte) []byte {
	return append([]byte{MsgUpdate}, data...)
}

func DecodeMessage(data []byte) (byte, []byte) {
	if len(data) == 0 {
		return 0, nil
	}
	return data[0], data[1:]
}
