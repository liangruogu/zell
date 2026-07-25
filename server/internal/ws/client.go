package ws

import (
	"io"
	"sync"

	"github.com/gorilla/websocket"
)

const (
	MsgSyncStep1  = 0
	MsgSyncStep2  = 1
	MsgUpdate     = 2
)

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	room     string
	send     chan []byte
	clientID string
	mu       sync.Mutex
}

func NewClient(hub *Hub, conn *websocket.Conn, room, clientID string) *Client {
	return &Client{
		hub:      hub,
		conn:     conn,
		room:     room,
		send:     make(chan []byte, 256),
		clientID: clientID,
	}
}

func (c *Client) ReadLoop() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		msgType, reader, err := c.conn.NextReader()
		if err != nil {
			break
		}
		if msgType != websocket.BinaryMessage {
			continue
		}
		data, err := io.ReadAll(reader)
		if err != nil || len(data) == 0 {
			continue
		}
		// Broadcast to all other clients in the room
		c.hub.broadcast(c.room, c, data)
	}
}

func (c *Client) WriteLoop() {
	defer c.conn.Close()
	for msg := range c.send {
		c.mu.Lock()
		w, err := c.conn.NextWriter(websocket.BinaryMessage)
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
