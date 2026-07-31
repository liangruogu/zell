package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
)

type Config struct {
	Port      string
	DBPath    string
	DataDir   string
	ServerKey string // ephemeral: random each startup, for initial admin auth
	JWTSecret string // persistent: stored on disk, never changes, signs project tokens
}

func Load() *Config {
	port := os.Getenv("ZELL_PORT")
	if port == "" {
		port = "3000"
	}

	dataDir := os.Getenv("ZELL_DATA_DIR")
	if dataDir == "" {
		dataDir = "data"
	}

	dbPath := filepath.Join(dataDir, "zell.db")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic("failed to create data directory: " + err.Error())
	}

	// Server key: ephemeral, regenerated every restart
	serverKey := os.Getenv("ZELL_SERVER_KEY")
	if serverKey == "" {
		b := make([]byte, 16)
		rand.Read(b)
		serverKey = hex.EncodeToString(b)
	}

	// JWT secret: persistent, stored on disk, never changes
	jwtSecret := os.Getenv("ZELL_JWT_SECRET")
	if jwtSecret == "" {
		keyPath := filepath.Join(dataDir, ".jwt_secret")
		if data, err := os.ReadFile(keyPath); err == nil {
			jwtSecret = string(data)
		} else {
			b := make([]byte, 32)
			rand.Read(b)
			jwtSecret = hex.EncodeToString(b)
			os.WriteFile(keyPath, []byte(jwtSecret), 0600)
		}
	}

	return &Config{
		Port:      port,
		DBPath:    dbPath,
		DataDir:   dataDir,
		ServerKey: serverKey,
		JWTSecret: jwtSecret,
	}
}
