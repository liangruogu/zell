package repository

import "testing"

func setupTestDB(t *testing.T) *DB {
	db, err := NewInMemory()
	if err != nil {
		t.Fatalf("failed to create test db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}
