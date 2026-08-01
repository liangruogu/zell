package middleware

import (
	"net/http/httptest"
	"testing"
	"time"

	"zell-server/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func setupTestContext(method, path string) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, nil)
	return c, w
}

func makeJWT(secret, sub string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	s, _ := token.SignedString([]byte(secret))
	return s
}

func TestServerKeyMiddleware_Correct(t *testing.T) {
	c, w := setupTestContext("GET", "/")
	c.Request.Header.Set("X-Server-Key", "my-secret")

	middleware := ServerKeyMiddleware("my-secret")
	middleware(c)

	if c.IsAborted() {
		t.Error("expected request to continue")
	}
	if w.Code != 200 {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestServerKeyMiddleware_Wrong(t *testing.T) {
	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("X-Server-Key", "wrong-key")

	middleware := ServerKeyMiddleware("correct-key")
	middleware(c)

	if !c.IsAborted() {
		t.Error("expected request to be aborted")
	}
}

func TestServerKeyMiddleware_Missing(t *testing.T) {
	c, _ := setupTestContext("GET", "/")

	middleware := ServerKeyMiddleware("correct-key")
	middleware(c)

	if !c.IsAborted() {
		t.Error("expected request to be aborted when header missing")
	}
}

func TestAuthMiddleware_ValidToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("Authorization", "Bearer "+makeJWT("test-secret", "user1"))

	middleware := AuthMiddleware(cfg)
	middleware(c)

	if c.IsAborted() {
		t.Error("expected valid token to pass")
	}
	session, exists := c.Get("session")
	if !exists {
		t.Error("expected session to be set")
	}
	s := session.(*Session)
	if s.ClientID != "user1" {
		t.Errorf("expected client_id 'user1', got '%s'", s.ClientID)
	}
}

func TestAuthMiddleware_NoAuthHeader(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	c, _ := setupTestContext("GET", "/")

	middleware := AuthMiddleware(cfg)
	middleware(c)

	if !c.IsAborted() {
		t.Error("expected request to be aborted without auth header")
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("Authorization", "Bearer bad-token")

	middleware := AuthMiddleware(cfg)
	middleware(c)

	if !c.IsAborted() {
		t.Error("expected invalid token to be rejected")
	}
}

func TestAuthMiddleware_ExpiredToken(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user1",
		"exp": time.Now().Add(-time.Hour).Unix(),
	})
	s, _ := token.SignedString([]byte("test-secret"))

	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("Authorization", "Bearer "+s)

	middleware := AuthMiddleware(cfg)
	middleware(c)

	if !c.IsAborted() {
		t.Error("expected expired token to be rejected")
	}
}

func TestServerKeyOrAuthMiddleware_ServerKey(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ServerKey: "my-secret"}
	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("X-Server-Key", "my-secret")

	middleware := ServerKeyOrAuthMiddleware(cfg)
	middleware(c)

	if c.IsAborted() {
		t.Error("expected server key to pass")
	}
}

func TestServerKeyOrAuthMiddleware_JWT(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret", ServerKey: "my-secret"}
	c, _ := setupTestContext("GET", "/")
	c.Request.Header.Set("Authorization", "Bearer "+makeJWT("test-secret", "user1"))

	middleware := ServerKeyOrAuthMiddleware(cfg)
	middleware(c)

	if c.IsAborted() {
		t.Error("expected JWT to pass")
	}
}
