package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port    string
	DBPath  string
	DataDir string
}

func Load() *Config {
	port := os.Getenv("BINDLE_PORT")
	if port == "" {
		port = "3000"
	}

	dataDir := os.Getenv("BINDLE_DATA_DIR")
	if dataDir == "" {
		execPath, _ := os.Executable()
		dataDir = filepath.Join(filepath.Dir(execPath), "data")
	}

	dbPath := filepath.Join(dataDir, "bindle.db")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		panic("failed to create data directory: " + err.Error())
	}

	return &Config{
		Port:    port,
		DBPath:  dbPath,
		DataDir: dataDir,
	}
}
