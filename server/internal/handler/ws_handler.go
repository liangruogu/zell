package handler

import (
	"log"
	"net/http"

	"zell-server/internal/repository"
	"zell-server/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	gorillaWs "github.com/gorilla/websocket"
)

var upgrader = gorillaWs.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	db  *repository.DB
	hub *ws.Hub
}

func NewWSHandler(db *repository.DB, hub *ws.Hub) *WSHandler {
	hub.SetLoadSnapshot(func(docID string) []byte {
		state, err := db.GetSnapshot(docID)
		if err != nil {
			log.Printf("[ws] snapshot load error: %v", err)
			return nil
		}
		return state
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
		// Try JWT parsing for owner identification
		if clientID == "" || clientID == "client-"+pid {
			if jwtToken, _, err := new(jwt.Parser).ParseUnverified(token, jwt.MapClaims{}); err == nil {
				if claims, ok := jwtToken.Claims.(jwt.MapClaims); ok {
					if sub, ok := claims["sub"].(string); ok {
						clientID = sub
					}
				}
			}
		}
	}

	// State check: verify project and member status
	proj, err := h.db.GetProject(pid)
	isNotification := articleID == "__notifications__"
	if !isNotification {
		if err != nil || proj == nil || proj.Status == "deleted" || !proj.CollabEnabled {
			c.JSON(http.StatusForbidden, gin.H{"error": "project unavailable"})
			return
		}
		memberStatus, err := h.db.GetMemberStatus(pid, clientID)
		if err != nil || memberStatus != "active" {
			if clientID == proj.OwnerToken && proj.OwnerToken != "" {
				// owner OK
			} else {
				c.JSON(http.StatusForbidden, gin.H{"error": "not a member"})
				return
			}
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}

	log.Printf("[ws] client %s connecting to room %s", clientID, room)
	h.hub.HandleWebSocket(conn, room, clientID, pid)
}

