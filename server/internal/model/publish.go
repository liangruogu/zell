package model

type PublishConfig struct {
	ProjectID string `json:"project_id"`
	Data      string `json:"data"`
	UpdatedAt string `json:"updated_at"`
}

type PublishArticle struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	Title       string `json:"title"`
	ContentHTML string `json:"content_html"`
	UpdatedAt   string `json:"updated_at"`
}

type PublishWhiteboard struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	WbType    string `json:"wb_type"`
	Snapshot  string `json:"snapshot"`
	UpdatedAt string `json:"updated_at"`
}

type PublishData struct {
	Enabled     bool     `json:"enabled"`
	Wiki        []string `json:"wiki"`
	PPT         []string `json:"ppt"`
	UI          []string `json:"ui"`
	Mood        []string `json:"mood"`
	ProjectName string   `json:"project_name"`
}
