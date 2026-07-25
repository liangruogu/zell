package model

type Article struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	Title       string  `json:"title"`
	Content     string  `json:"content"`
	ContentJSON string  `json:"content_json"`
	ParentID    *string `json:"parent_id"`
	SortOrder   int     `json:"sort_order"`
	Version     int     `json:"version"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	DeletedAt   *string `json:"deleted_at"`
}

type InviteCode struct {
	ID          string  `json:"id"`
	ProjectID   string  `json:"project_id"`
	Code        string  `json:"code"`
	DisplayName string  `json:"display_name"`
	Role        string  `json:"role"`
	CreatedAt   string  `json:"created_at"`
	ExpiresAt   *string `json:"expires_at"`
}

type Session struct {
	ID            string `json:"id"`
	InviteCodeID  string `json:"invite_code_id"`
	ClientID      string `json:"client_id"`
	Token         string `json:"token"`
	DisplayName   string `json:"display_name"`
	LastSeen      string `json:"last_seen"`
	CreatedAt     string `json:"created_at"`
}

type YjsSnapshot struct {
	DocID     string `json:"doc_id"`
	State     []byte `json:"state"`
	UpdatedAt string `json:"updated_at"`
}
