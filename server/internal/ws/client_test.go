package ws

import (
	"testing"
)

func TestDecodeMessage_SyncStep1(t *testing.T) {
	data := EncodeSyncStep1([]byte("hello"))
	msgType, payload := DecodeMessage(data)
	if msgType != MsgSyncStep1 {
		t.Errorf("expected MsgSyncStep1 (%d), got %d", MsgSyncStep1, msgType)
	}
	if string(payload) != "hello" {
		t.Errorf("expected payload 'hello', got '%s'", string(payload))
	}
}

func TestDecodeMessage_SyncStep2(t *testing.T) {
	data := EncodeSyncStep2([]byte("world"))
	msgType, payload := DecodeMessage(data)
	if msgType != MsgSyncStep2 {
		t.Errorf("expected MsgSyncStep2 (%d), got %d", MsgSyncStep2, msgType)
	}
	if string(payload) != "world" {
		t.Errorf("expected payload 'world', got '%s'", string(payload))
	}
}

func TestDecodeMessage_Update(t *testing.T) {
	data := EncodeUpdate([]byte("update-data"))
	msgType, payload := DecodeMessage(data)
	if msgType != MsgUpdate {
		t.Errorf("expected MsgUpdate (%d), got %d", MsgUpdate, msgType)
	}
	if string(payload) != "update-data" {
		t.Errorf("expected payload 'update-data', got '%s'", string(payload))
	}
}

func TestDecodeMessage_Empty(t *testing.T) {
	msgType, payload := DecodeMessage([]byte{})
	if msgType != 0 {
		t.Errorf("expected msgType 0 for empty data, got %d", msgType)
	}
	if payload != nil {
		t.Errorf("expected nil payload for empty data, got %v", payload)
	}
}

func TestEncodeSyncStep1_Roundtrip(t *testing.T) {
	original := []byte("test update data")
	encoded := EncodeSyncStep1(original)
	msgType, payload := DecodeMessage(encoded)
	if msgType != MsgSyncStep1 {
		t.Errorf("roundtrip: expected MsgSyncStep1, got %d", msgType)
	}
	if string(payload) != string(original) {
		t.Errorf("roundtrip: payload mismatch, got '%s', expected '%s'", string(payload), string(original))
	}
}

func TestEncodeSyncStep2_Roundtrip(t *testing.T) {
	original := []byte("test sync data")
	encoded := EncodeSyncStep2(original)
	msgType, payload := DecodeMessage(encoded)
	if msgType != MsgSyncStep2 {
		t.Errorf("roundtrip: expected MsgSyncStep2, got %d", msgType)
	}
	if string(payload) != string(original) {
		t.Errorf("roundtrip: payload mismatch, got '%s', expected '%s'", string(payload), string(original))
	}
}

func TestEncodeUpdate_Roundtrip(t *testing.T) {
	original := []byte("test update payload")
	encoded := EncodeUpdate(original)
	msgType, payload := DecodeMessage(encoded)
	if msgType != MsgUpdate {
		t.Errorf("roundtrip: expected MsgUpdate, got %d", msgType)
	}
	if string(payload) != string(original) {
		t.Errorf("roundtrip: payload mismatch, got '%s', expected '%s'", string(payload), string(original))
	}
}
