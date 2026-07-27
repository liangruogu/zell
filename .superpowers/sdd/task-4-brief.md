### Task 4: Go server — publish models and database migration

**Files:**
- Create: `server/internal/model/publish.go`
- Modify: `server/internal/repository/db.go`

**Interfaces:**
- Consumes: Existing `repository.DB` struct
- Produces: `PublishConfig`, `PublishArticle`, `PublishWhiteboard`, `PublishData` models + migration in `db.go`

- [ ] **Step 1: Create publish models**

Create `server/internal/model/publish.go`:

```go
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
	Enabled bool     `json:"enabled"`
	Wiki    []string `json:"wiki"`
	PPT     []string `json:"ppt"`
	UI      []string `json:"ui"`
	Mood    []string `json:"mood"`
}
```

- [ ] **Step 2: Add publish tables migration**

In `server/internal/repository/db.go`, append these queries to the `migrate()` method's `queries` slice (after the last existing query):

```go
`CREATE TABLE IF NOT EXISTS publish_config (
    project_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS publish_articles (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    updated_at   TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS idx_pub_articles_project ON publish_articles(project_id)`,
`CREATE TABLE IF NOT EXISTS publish_whiteboards (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    wb_type    TEXT NOT NULL,
    snapshot   TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
)`,
`CREATE INDEX IF NOT EXISTS idx_pub_whiteboards_project ON publish_whiteboards(project_id)`,
```

- [ ] **Step 3: Build and verify**

```bash
cd server && go build -o zell-server.exe
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/internal/model/publish.go server/internal/repository/db.go
git commit -m "feat: add publish models and database migration"
```
