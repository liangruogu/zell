package model

type Project struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	CollabEnabled   bool   `json:"collab_enabled"`
	InviteCode      string `json:"invite_code"`
	InviteUpdatedAt string `json:"invite_updated_at"`
}

type JoinRequest struct {
	Code     string `json:"code"`
	ClientID string `json:"client_id"`
}

type CollabRequest struct {
	Enabled bool `json:"enabled"`
}
