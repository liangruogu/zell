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
	ServerKey string
}

func Load() *Config {
	port := os.Getenv("ZELL_PORT")
	if port == "" {
		port = "3000"
	}

	dataDir := os.Getenv("ZELL_DATA_DIR")
	if dataDir == "" {
		execPath, _ := os.Executable()
		dataDir = filepath.Join(filepath.Dir(execPath), "data")
	}

	dbPath := filepath.Join(dataDir, "zell.db")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic("failed to create data directory: " + err.Error())
	}

	serverKey := os.Getenv("ZELL_SERVER_KEY")
	if serverKey == "" {
		b := make([]byte, 16)
		rand.Read(b)
		serverKey = hex.EncodeToString(b)
	}

	return &Config{
		Port:      port,
		DBPath:    dbPath,
		DataDir:   dataDir,
		ServerKey: serverKey,
	}
}
