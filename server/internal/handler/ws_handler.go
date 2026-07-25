package handler

import (
	"log"
	"net/http"

	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
	gorillaWs "github.com/gorilla/websocket"
)

var upgrader = gorillaWs.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	db  *repository.DB
	hub *ws.Hub
}

func NewWSHandler(db *repository.DB) *WSHandler {
	hub := ws.NewHub(func(docID string, state []byte) {
		if err := db.SaveSnapshot(docID, state); err != nil {
			log.Printf("[ws] snapshot save error: %v", err)
		}
	})
	return &WSHandler{db: db, hub: hub}
}

func (h *WSHandler) GetHub() *ws.Hub {
	return h.hub
}

func (h *WSHandler) Handle(c *gin.Context) {
	pid := c.Param("pid")
	articleID := c.Param("aid")
	clientID := c.Query("client_id")
	room := pid + ":" + articleID

	if clientID == "" {
		clientID = "client-" + pid
	}

	// Verify token from query param
	token := c.Query("token")
	if token != "" {
		session, err := h.db.GetSessionByToken(token)
		if err == nil {
			invite, err := h.db.GetInviteByCode(session.InviteCodeID)
			if err == nil && invite.ProjectID == pid {
				clientID = session.DisplayName
			}
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	log.Printf("[ws] client %s connecting to room %s", clientID, room)
	h.hub.HandleWebSocket(conn, room, clientID)
}

func (h *WSHandler) Start() {
	go h.hub.Run()
}
