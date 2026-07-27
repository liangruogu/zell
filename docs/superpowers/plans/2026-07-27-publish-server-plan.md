# Publish Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add publish feature to Zell — users can selectively publish knowledge articles, PPT, and UI prototypes as read-only web pages served by the Go backend.

**Architecture:** Frontend adds a "Publish" tab to ProjectPage with checkbox lists per resource type. Publish config stored in `projects.settings.publish` JSON. Data synced to Go server via new API endpoints. Go server renders HTML pages from synced data using `html/template`.

**Tech Stack:** React 19 + Zustand + TypeScript (frontend), Go 1.22 + Gin + modernc.org/sqlite + html/template (backend)

## Global Constraints

- Publish config stored in `projects.settings` JSON field, no new Tauri command needed
- Go server uses existing `internal/` structure (handler → repository → model)
- Publish routes are public (no auth), return 404 when disabled or resource not selected
- Default: `enabled = false`, when enabled all knowledge articles auto-selected

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/src/types/project.ts` | Modify | Add `PublishSettings` type |
| `app/src/components/project/PublishSettings.tsx` | Create | Publish settings UI component |
| `app/src/pages/ProjectPage.tsx` | Modify | Add "Publish" tab |
| `server/internal/model/publish.go` | Create | Publish data models |
| `server/internal/repository/db.go` | Modify | Add publish table migration |
| `server/internal/repository/publish_repo.go` | Create | Publish data queries |
| `server/internal/handler/publish_handler.go` | Create | Publish HTTP handlers |
| `server/internal/template/base.html` | Create | Base layout template |
| `server/internal/template/wiki_index.html` | Create | Wiki article list page |
| `server/internal/template/wiki_article.html` | Create | Single article page |
| `server/internal/template/ppt_preview.html` | Create | PPT preview page |
| `server/main.go` | Modify | Register publish routes |

---

### Task 1: Type definitions — PublishSettings

**Files:**
- Modify: `app/src/types/project.ts`

**Interfaces:**
- Produces: `PublishSettings` interface, updated `ProjectSettings` interface

- [ ] **Step 1: Add PublishSettings type and update ProjectSettings**

In `app/src/types/project.ts`, add after the existing `ProjectSettings` interface:

```ts
export interface PublishSettings {
  enabled: boolean
  wiki: string[]   // article IDs
  ppt: string[]    // whiteboard IDs
  ui: string[]     // whiteboard IDs
  mood: string[]   // whiteboard IDs
}
```

Update `ProjectSettings` to include the new field:

```ts
export interface ProjectSettings {
  status?: ProjectStatus
  ai?: {
    text_provider?: string
    text_model?: string
    text_api_key?: string
    image_provider?: string
    image_model?: string
    local_ollama_url?: string
    local_ollama_model?: string
    fallback_to_local?: boolean
  }
  publish?: PublishSettings
}
```

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/types/project.ts
git commit -m "feat: add PublishSettings type to ProjectSettings"
```

---

### Task 2: PublishSettings UI component

**Files:**
- Create: `app/src/components/project/PublishSettings.tsx`

**Interfaces:**
- Consumes: `useKnowledgeStore` (articles list), `useWhiteboardStore` (whiteboards list), `useProjectStore` (currentProject), `useSyncStore` (connected status), `PublishSettings` type
- Produces: `<PublishSettings>` component, exports default

- [ ] **Step 1: Create PublishSettings component**

Create `app/src/components/project/PublishSettings.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'
import type { PublishSettings } from '@/types/project'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Globe, ChevronRight, BookOpen, Presentation, Palette, Film } from 'lucide-react'

function getDefaultPublish(articleIds: string[]): PublishSettings {
  return { enabled: false, wiki: [...articleIds], ppt: [], ui: [], mood: [] }
}

export function PublishSettings() {
  const { currentProject, updateProject } = useProjectStore()
  const { articles, fetchArticles } = useKnowledgeStore()
  const { whiteboards, fetchWhiteboards } = useWhiteboardStore()
  const { connected } = useSyncStore()

  const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
  const [publish, setPublish] = useState<PublishSettings>(ps.publish || getDefaultPublish([]))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ wiki: true })

  useEffect(() => {
    if (currentProject) {
      fetchArticles(currentProject.id)
      fetchWhiteboards(currentProject.id)
    }
  }, [currentProject, fetchArticles, fetchWhiteboards])

  useEffect(() => {
    if (currentProject) {
      const cur = parseProjectSettings(currentProject.settings).publish
      const def = getDefaultPublish(articles.map(a => a.id))
      setPublish(cur || def)
    }
  }, [currentProject, articles])

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    if (!currentProject) return
    const next: PublishSettings = { ...publish, enabled }
    if (enabled && next.wiki.length === 0) {
      next.wiki = articles.map(a => a.id)
    }
    setPublish(next)
    const cur = parseProjectSettings(currentProject.settings)
    cur.publish = next
    await updateProject(currentProject.id, {
      name: currentProject.name, description: currentProject.description,
      background: currentProject.background, icon: currentProject.icon,
      settings: stringifyProjectSettings(cur),
    })
  }, [currentProject, publish, articles, updateProject])

  const toggleItem = useCallback(async (category: 'wiki' | 'ppt' | 'ui' | 'mood', id: string) => {
    if (!currentProject) return
    const list = publish[category]
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id]
    const nextPublish = { ...publish, [category]: next }
    setPublish(nextPublish)
    const cur = parseProjectSettings(currentProject.settings)
    cur.publish = nextPublish
    await updateProject(currentProject.id, {
      name: currentProject.name, description: currentProject.description,
      background: currentProject.background, icon: currentProject.icon,
      settings: stringifyProjectSettings(cur),
    })
  }, [currentProject, publish, updateProject])

  const toggleExpand = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  if (!connected) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Globe size={32} strokeWidth={1} className="mx-auto mb-3" />
        <p className="text-sm">发布功能需连接协作服务器</p>
        <p className="text-xs mt-1">请在设置中配置并连接到 Zell 协作服务器</p>
      </div>
    )
  }

  const wbByType = (type: string) => whiteboards.filter(w => w.wb_type === type)

  const categories = [
    { key: 'wiki' as const, label: '知识库', icon: BookOpen, items: articles.map(a => ({ id: a.id, name: a.title })) },
    { key: 'ppt' as const, label: 'PPT', icon: Presentation, items: wbByType('ppt').map(w => ({ id: w.id, name: w.name })) },
    { key: 'ui' as const, label: 'UI', icon: Palette, items: wbByType('ui').map(w => ({ id: w.id, name: w.name })) },
    { key: 'mood' as const, label: 'Mood', icon: Film, items: wbByType('mood').map(w => ({ id: w.id, name: w.name })) },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">网站部署</h3>
          <p className="text-xs text-gray-400 mt-0.5">开启后将选中内容发布为可公开访问的网页</p>
        </div>
        <button
          onClick={() => toggleEnabled(!publish.enabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
            publish.enabled ? 'bg-zell-500' : 'bg-gray-200'
          )}
        >
          <span className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            publish.enabled ? 'translate-x-4' : 'translate-x-0'
          )} />
        </button>
      </div>

      {publish.enabled && (
        <div className="space-y-1">
          {categories.map(cat => (
            <div key={cat.key}>
              <button
                onClick={() => toggleExpand(cat.key)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-gray-700"
              >
                <ChevronRight size={14} className={cn('text-gray-400 transition-transform', expanded[cat.key] && 'rotate-90')} />
                <cat.icon size={15} className="text-gray-400" />
                <span>{cat.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{publish[cat.key].length}/{cat.items.length}</span>
              </button>
              {expanded[cat.key] && (
                <div className="ml-6 space-y-0.5">
                  {cat.items.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-1">暂无内容</p>
                  ) : (
                    cat.items.map(item => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={publish[cat.key].includes(item.id)}
                          onChange={() => toggleItem(cat.key, item.id)}
                          className="rounded border-gray-300 text-zell-500 focus:ring-zell-400"
                        />
                        <span className="text-gray-600 truncate">{item.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify lint**

```bash
pnpm run lint
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/project/PublishSettings.tsx
git commit -m "feat: add PublishSettings component"
```

---

### Task 3: Integrate Publish tab into ProjectPage

**Files:**
- Modify: `app/src/pages/ProjectPage.tsx`

**Interfaces:**
- Consumes: `PublishSettings` component from Task 2
- Produces: Updated ProjectPage with tabbed settings UI

- [ ] **Step 1: Add tab state and render Publish tab**

In `app/src/pages/ProjectPage.tsx`:

Add import at the top:
```tsx
import { PublishSettings } from '@/components/project/PublishSettings'
```

Add tab state after existing state declarations (after line 27):
```tsx
const [settingsTab, setSettingsTab] = useState<'overview' | 'publish'>('overview')
```

Replace the main content area (`<div className="flex-1 overflow-auto p-6 space-y-6">` through line 256) with:

```tsx
      <div className="flex-1 flex min-h-0">
        {/* Left: Settings tabs */}
        <div className="w-36 border-r border-gray-200 p-3 space-y-1 shrink-0">
          <button
            onClick={() => setSettingsTab('overview')}
            className={cn(
              'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
              settingsTab === 'overview' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            概览
          </button>
          <button
            onClick={() => setSettingsTab('publish')}
            className={cn(
              'w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
              settingsTab === 'publish' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            发布
          </button>
        </div>

        {/* Right: Tab content */}
        <div className="flex-1 overflow-auto">
          {settingsTab === 'overview' ? (
            <div className="p-6 space-y-6">
              <Card className="p-5">
                <h3 className="font-semibold text-gray-800 mb-3">项目信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">名称</span>
                    <p className="text-gray-700 mt-1 font-medium">{currentProject.name}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">图标</span>
                    <p className="text-2xl mt-1">{currentProject.icon || '📁'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">状态</span>
                    <p className="mt-1">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', statusInfo?.color)}>
                        {statusInfo?.label}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">描述</span>
                    <p className="text-gray-700 mt-1">{currentProject.description || '无'}</p>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400">创建时间</span>
                      <p className="text-gray-700 mt-1">{format.dateTime(currentProject.created_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">最后更新</span>
                      <p className="text-gray-700 mt-1">{format.dateTime(currentProject.updated_at)}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold text-gray-800 mb-3">项目背景</h3>
                {currentProject.background ? (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{currentProject.background}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">暂无背景信息，点击「编辑」添加</p>
                )}
              </Card>

              {connected && (
                <Card className="p-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Users size={18} /> 团队协作
                    {collabEnabled && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">已开启</span>
                    )}
                  </h3>
                  {collabEnabled ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <code className="text-sm bg-gray-100 px-3 py-1.5 rounded border border-gray-200 font-mono text-gray-700">
                          {inviteCode}
                        </code>
                        <Button size="sm" variant="outline" onClick={handleCopyCode}>
                          <Copy size={14} className="mr-1" />
                          {copied ? '已复制' : '复制'}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-400">每 30 分钟自动更新，已连接的用户不受影响</p>
                      <Button size="sm" variant="destructive" onClick={() => handleToggleCollab(false)}>
                        关闭协作
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400">开启后将自动生成邀请码，其他人可凭码加入。</p>
                      <Button size="sm" onClick={() => handleToggleCollab(true)}>
                        开启团队协作
                      </Button>
                    </div>
                  )}
                </Card>
              )}
            </div>
          ) : (
            <PublishSettings />
          )}
        </div>
      </div>
```

- [ ] **Step 2: Verify lint and typecheck**

```bash
pnpm run lint
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/pages/ProjectPage.tsx
git commit -m "feat: add publish tab to ProjectPage settings"
```

---

### Task 4: Go server — publish models and database migration

**Files:**
- Create: `server/internal/model/publish.go`
- Modify: `server/internal/repository/db.go`

**Interfaces:**
- Consumes: Existing `repository.DB` struct
- Produces: `PublishConfig`, `PublishArticle`, `PublishWhiteboard` models + migration in `db.go`

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

In `server/internal/repository/db.go`, add these queries to the `migrate()` method's `queries` slice (after the last existing query):

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

---

### Task 5: Go server — publish repository

**Files:**
- Create: `server/internal/repository/publish_repo.go`

**Interfaces:**
- Consumes: `repository.DB` struct
- Produces: `PublishRepo` with methods: `UpsertConfig`, `GetConfig`, `UpsertArticle`, `GetArticle`, `DeleteArticle`, `UpsertWhiteboard`, `GetWhiteboard`, `GetWhiteboardsByType`

- [ ] **Step 1: Create publish repository**

Create `server/internal/repository/publish_repo.go`:

```go
package repository

import (
	"database/sql"
	"zell-server/internal/model"
)

type PublishRepo struct {
	db *DB
}

func NewPublishRepo(db *DB) *PublishRepo {
	return &PublishRepo{db: db}
}

func (r *PublishRepo) UpsertConfig(projectID, data, updatedAt string) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_config (project_id, data, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		projectID, data, updatedAt,
	)
	return err
}

func (r *PublishRepo) GetConfig(projectID string) (*model.PublishConfig, error) {
	row := r.db.conn.QueryRow(
		`SELECT project_id, data, updated_at FROM publish_config WHERE project_id = ?`,
		projectID,
	)
	var c model.PublishConfig
	err := row.Scan(&c.ProjectID, &c.Data, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *PublishRepo) UpsertArticle(article *model.PublishArticle) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_articles (id, project_id, title, content_html, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET title = excluded.title, content_html = excluded.content_html, updated_at = excluded.updated_at`,
		article.ID, article.ProjectID, article.Title, article.ContentHTML, article.UpdatedAt,
	)
	return err
}

func (r *PublishRepo) GetArticle(id string) (*model.PublishArticle, error) {
	row := r.db.conn.QueryRow(
		`SELECT id, project_id, title, content_html, updated_at FROM publish_articles WHERE id = ?`,
		id,
	)
	var a model.PublishArticle
	err := row.Scan(&a.ID, &a.ProjectID, &a.Title, &a.ContentHTML, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *PublishRepo) DeleteArticle(id string) error {
	_, err := r.db.conn.Exec(`DELETE FROM publish_articles WHERE id = ?`, id)
	return err
}

func (r *PublishRepo) UpsertWhiteboard(wb *model.PublishWhiteboard) error {
	_, err := r.db.conn.Exec(
		`INSERT INTO publish_whiteboards (id, project_id, name, wb_type, snapshot, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET name = excluded.name, wb_type = excluded.wb_type, snapshot = excluded.snapshot, updated_at = excluded.updated_at`,
		wb.ID, wb.ProjectID, wb.Name, wb.WbType, wb.Snapshot, wb.UpdatedAt,
	)
	return err
}

func (r *PublishRepo) GetWhiteboard(id string) (*model.PublishWhiteboard, error) {
	row := r.db.conn.QueryRow(
		`SELECT id, project_id, name, wb_type, snapshot, updated_at FROM publish_whiteboards WHERE id = ?`,
		id,
	)
	var w model.PublishWhiteboard
	err := row.Scan(&w.ID, &w.ProjectID, &w.Name, &w.WbType, &w.Snapshot, &w.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *PublishRepo) GetWhiteboardsByType(projectID, wbType string, ids []string) ([]model.PublishWhiteboard, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	query := `SELECT id, project_id, name, wb_type, snapshot, updated_at FROM publish_whiteboards
		WHERE project_id = ? AND wb_type = ? AND id IN (` + placeholders(len(ids)) + `)`
	args := []interface{}{projectID, wbType}
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := r.db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var wbs []model.PublishWhiteboard
	for rows.Next() {
		var w model.PublishWhiteboard
		if err := rows.Scan(&w.ID, &w.ProjectID, &w.Name, &w.WbType, &w.Snapshot, &w.UpdatedAt); err != nil {
			return nil, err
		}
		wbs = append(wbs, w)
	}
	return wbs, rows.Err()
}

func placeholders(n int) string {
	if n == 0 {
		return ""
	}
	s := "?,"
	for i := 1; i < n; i++ {
		s += ",?"
	}
	return s
}
```

- [ ] **Step 2: Build and verify**

```bash
cd server && go build -o zell-server.exe
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/internal/repository/publish_repo.go
git commit -m "feat: add publish repository layer"
```

---

### Task 6: Go server — publish handler + API endpoints

**Files:**
- Create: `server/internal/handler/publish_handler.go`
- Modify: `server/main.go`

**Interfaces:**
- Consumes: `repository.PublishRepo`, `repository.ArticleRepo`
- Produces: `PublishHandler` with methods: `SaveConfig`, `SaveArticle`, `GetArticle`, `GetWikiList`, `GetPPT`

- [ ] **Step 1: Create publish handler**

Create `server/internal/handler/publish_handler.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"

	"zell-server/internal/model"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

type PublishHandler struct {
	repo     *repository.PublishRepo
	articles *repository.ArticleRepo
}

func NewPublishHandler(db *repository.DB) *PublishHandler {
	return &PublishHandler{
		repo:     repository.NewPublishRepo(db),
		articles: repository.NewArticleRepo(db),
	}
}

// ── API: Save publish config ────────────────────────────────────────────

func (h *PublishHandler) SaveConfig(c *gin.Context) {
	projectID := c.Param("pid")
	var body struct {
		Data      string `json:"data"`
		UpdatedAt string `json:"updated_at"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.UpsertConfig(projectID, body.Data, body.UpdatedAt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── API: Save published article content ──────────────────────────────────

func (h *PublishHandler) SaveArticle(c *gin.Context) {
	projectID := c.Param("pid")
	var article model.PublishArticle
	if err := c.ShouldBindJSON(&article); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	article.ProjectID = projectID
	if err := h.repo.UpsertArticle(&article); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── API: Save published whiteboard snapshot ───────────────────────────────

func (h *PublishHandler) SaveWhiteboard(c *gin.Context) {
	projectID := c.Param("pid")
	var wb model.PublishWhiteboard
	if err := c.ShouldBindJSON(&wb); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wb.ProjectID = projectID
	if err := h.repo.UpsertWhiteboard(&wb); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
```

- [ ] **Step 2: Register publish API routes in main.go**

In `server/main.go`, after the WebSocket route, add:

```go
	// Publish management API (called by desktop app)
	pubAPI := r.Group("/api/v1")
	{
		pubH := handler.NewPublishHandler(db)
		pubAPI.PUT("/projects/:pid/publish", pubH.SaveConfig)
		pubAPI.PUT("/projects/:pid/publish/articles/:aid", pubH.SaveArticle)
		pubAPI.PUT("/projects/:pid/publish/whiteboards/:wid", pubH.SaveWhiteboard)
	}
```

- [ ] **Step 3: Build and verify**

```bash
cd server && go build -o zell-server.exe
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/publish_handler.go server/main.go
git commit -m "feat: add publish API endpoints"
```

---

### Task 7: Go server — HTML templates and public routes

**Files:**
- Create: `server/internal/template/base.html`
- Create: `server/internal/template/wiki_index.html`
- Create: `server/internal/template/wiki_article.html`
- Create: `server/internal/template/ppt_preview.html`
- Modify: `server/internal/handler/publish_handler.go` (add template rendering methods)
- Modify: `server/main.go` (register `/pub/` routes)

**Interfaces:**
- Consumes: `repository.PublishRepo`
- Produces: Public HTML pages at `/pub/:pid/wiki/`, `/pub/:pid/wiki/:aid`, `/pub/:pid/ppt/:wid`

- [ ] **Step 1: Create base template**

Create `server/internal/template/base.html`:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{.Title}}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .article-list { list-style: none; }
    .article-list li { margin-bottom: 8px; }
    .article-list a { display: block; padding: 12px 16px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; text-decoration: none; color: #374151; transition: border-color 0.15s; }
    .article-list a:hover { border-color: #6366f1; }
    .article-list .title { font-weight: 500; }
    .article-list .time { font-size: 12px; color: #9ca3af; margin-top: 4px; }
    .back-link { display: inline-block; margin-bottom: 16px; color: #6366f1; text-decoration: none; font-size: 14px; }
    .back-link:hover { text-decoration: underline; }
    .prose { line-height: 1.8; font-size: 15px; }
    .prose h1, .prose h2, .prose h3 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
    .prose h1 { font-size: 1.8em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    .prose h2 { font-size: 1.4em; }
    .prose h3 { font-size: 1.15em; }
    .prose p { margin-bottom: 0.8em; }
    .prose code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .prose pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 1em; }
    .prose pre code { background: none; padding: 0; }
    .prose blockquote { border-left: 3px solid #d1d5db; padding-left: 16px; color: #6b7280; margin: 1em 0; }
    .prose table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
    .prose th, .prose td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
    .prose th { background: #f9fafb; font-weight: 600; }
    .prose img { max-width: 100%; border-radius: 8px; }
    .prose ul, .prose ol { padding-left: 1.5em; margin-bottom: 0.8em; }
    .prose li { margin-bottom: 0.3em; }
    .prose a { color: #6366f1; }
  </style>
</head>
<body>
  {{template "content" .}}
</body>
</html>
```

- [ ] **Step 2: Create wiki index template**

Create `server/internal/template/wiki_index.html`:

```html
{{define "content"}}
<div class="container">
  <h1 style="font-size: 1.6em; margin-bottom: 24px;">{{.ProjectName}} — 知识库</h1>
  <ul class="article-list">
    {{range .Articles}}
    <li>
      <a href="{{$.BasePath}}/wiki/{{.ID}}">
        <div class="title">{{.Title}}</div>
        <div class="time">{{.UpdatedAt}}</div>
      </a>
    </li>
    {{end}}
  </ul>
  {{if not .Articles}}
  <p style="color: #9ca3af; text-align: center; padding: 40px 0;">暂无已发布的文章</p>
  {{end}}
</div>
{{end}}
```

- [ ] **Step 3: Create wiki article template**

Create `server/internal/template/wiki_article.html`:

```html
{{define "content"}}
<div class="container">
  <a href="{{.BasePath}}/wiki/" class="back-link">← 返回文章列表</a>
  <h1 style="font-size: 1.6em; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">{{.Title}}</h1>
  <div class="prose">{{.ContentHTML}}</div>
</div>
{{end}}
```

- [ ] **Step 4: Create PPT preview template**

Create `server/internal/template/ppt_preview.html`:

```html
{{define "content"}}
<style>
  .ppt-container { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #000; position: relative; }
  .ppt-slide { position: relative; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
  .ppt-nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 16px; align-items: center; z-index: 10; }
  .ppt-nav button { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #fff; padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: background 0.15s; }
  .ppt-nav button:hover { background: rgba(255,255,255,0.25); }
  .ppt-nav .page-info { color: rgba(255,255,255,0.6); font-size: 13px; }
  .ppt-progress { position: fixed; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255,255,255,0.1); z-index: 10; }
  .ppt-progress-bar { height: 100%; background: #6366f1; transition: width 0.3s; }
</style>
<div class="ppt-container">
  <div id="slide" class="ppt-slide" style="width: min(100vw, calc(100vh - 80px) * 1280 / 720); height: calc(min(100vw, calc(100vh - 80px) * 1280 / 720) * 720 / 1280);">
  </div>
  <div class="ppt-nav">
    <button onclick="prevSlide()">← 上一页</button>
    <span class="page-info"><span id="current">1</span> / {{len .Slides}}</span>
    <button onclick="nextSlide()">下一页 →</button>
  </div>
  <div class="ppt-progress">
    <div id="progress" class="ppt-progress-bar" style="width: {{progressPercent .Current 1 (len .Slides)}}%"></div>
  </div>
</div>
<script>
  var slides = {{.SlidesJSON}};
  var current = 0;
  function renderSlide(idx) {
    current = idx;
    var s = slides[idx];
    var el = document.getElementById('slide');
    el.style.background = s.bg || '#ffffff';
    el.style.opacity = s.bgOpacity !== undefined ? s.bgOpacity : 1;
    el.innerHTML = s.html || '';
    document.getElementById('current').textContent = idx + 1;
    var pct = ((idx + 1) / slides.length) * 100;
    document.getElementById('progress').style.width = pct + '%';
  }
  function nextSlide() { if (current < slides.length - 1) renderSlide(current + 1); }
  function prevSlide() { if (current > 0) renderSlide(current - 1); }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextSlide(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevSlide(); }
  });
  renderSlide(0);
</script>
{{end}}
```

- [ ] **Step 5: Add template rendering to publish handler**

In `server/internal/handler/publish_handler.go`, add after the existing methods:

```go
import (
	"encoding/json"
	"html/template"
	"net/http"
	"path/filepath"

	"zell-server/internal/model"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)

// ── Public: Wiki index ───────────────────────────────────────────────────

func (h *PublishHandler) WikiIndex(c *gin.Context) {
	projectID := c.Param("pid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	if len(data.Wiki) == 0 {
		c.Status(http.StatusNotFound)
		return
	}

	type articleItem struct {
		ID        string
		Title     string
		UpdatedAt string
	}
	var items []articleItem
	for _, aid := range data.Wiki {
		a, err := h.repo.GetArticle(aid)
		if err != nil {
			continue
		}
		items = append(items, articleItem{ID: a.ID, Title: a.Title, UpdatedAt: a.UpdatedAt})
	}

	tmpl := template.Must(template.ParseFiles(
		filepath.Join("internal", "template", "base.html"),
		filepath.Join("internal", "template", "wiki_index.html"),
	))
	tmpl.ExecuteTemplate(c.Writer, "base", gin.H{
		"Title":       "知识库",
		"ProjectName": "",
		"Articles":    items,
		"BasePath":    "/pub/" + projectID,
	})
}

// ── Public: Wiki article ─────────────────────────────────────────────────

func (h *PublishHandler) WikiArticle(c *gin.Context) {
	projectID := c.Param("pid")
	articleID := c.Param("aid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	found := false
	for _, id := range data.Wiki {
		if id == articleID {
			found = true
			break
		}
	}
	if !found {
		c.Status(http.StatusNotFound)
		return
	}

	a, err := h.repo.GetArticle(articleID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	tmpl := template.Must(template.ParseFiles(
		filepath.Join("internal", "template", "base.html"),
		filepath.Join("internal", "template", "wiki_article.html"),
	))
	tmpl.ExecuteTemplate(c.Writer, "base", gin.H{
		"Title":       a.Title,
		"ContentHTML": template.HTML(a.ContentHTML),
		"BasePath":    "/pub/" + projectID,
	})
}

// ── Public: PPT preview ──────────────────────────────────────────────────

func (h *PublishHandler) PPTPreview(c *gin.Context) {
	projectID := c.Param("pid")
	wbID := c.Param("wid")
	cfg, err := h.repo.GetConfig(projectID)
	if err != nil || cfg == nil {
		c.Status(http.StatusNotFound)
		return
	}
	var data model.PublishData
	if err := json.Unmarshal([]byte(cfg.Data), &data); err != nil || !data.Enabled {
		c.Status(http.StatusNotFound)
		return
	}
	found := false
	for _, id := range data.PPT {
		if id == wbID {
			found = true
			break
		}
	}
	if !found {
		c.Status(http.StatusNotFound)
		return
	}

	wb, err := h.repo.GetWhiteboard(wbID)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	var snapshot struct {
		Slides []struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Bg       string `json:"background"`
			BgOpacity *float64 `json:"backgroundOpacity"`
			Elements []json.RawMessage `json:"elements"`
		} `json:"slides"`
	}
	json.Unmarshal([]byte(wb.Snapshot), &snapshot)

	type slideData struct {
		HTML string `json:"html"`
		Bg   string `json:"bg"`
		BgOpacity *float64 `json:"bgOpacity"`
	}
	var slides []slideData
	for _, s := range snapshot.Slides {
		slides = append(slides, slideData{
			HTML:      renderSlideElements(s.Elements),
			Bg:        s.Bg,
			BgOpacity: s.BgOpacity,
		})
	}

	slidesJSON, _ := json.Marshal(slides)

	tmpl := template.Must(template.New("ppt").Funcs(template.FuncMap{
		"progressPercent": func(current, one, total int) float64 {
			return float64(current+one) / float64(total) * 100
		},
	}).ParseFiles(
		filepath.Join("internal", "template", "base.html"),
		filepath.Join("internal", "template", "ppt_preview.html"),
	))
	tmpl.ExecuteTemplate(c.Writer, "base", gin.H{
		"Title":      wb.Name,
		"Slides":     slides,
		"SlidesJSON": template.JS(slidesJSON),
		"Current":    0,
	})
}

// renderSlideElements renders PPT elements as inline HTML.
// Matches the rendering logic from SlidePreview.tsx (percentage-based CSS).
func renderSlideElements(elements []json.RawMessage) string {
	const slideW = 1280.0
	const slideH = 720.0

	html := ""
	for _, raw := range elements {
		var el struct {
			Type string          `json:"type"`
			X    float64         `json:"x"`
			Y    float64         `json:"y"`
			W    float64         `json:"w"`
			H    float64         `json:"h"`
			Opacity float64       `json:"opacity"`
			Props json.RawMessage `json:"props"`
			GroupChildren []json.RawMessage `json:"groupChildren"`
		}
		if err := json.Unmarshal(raw, &el); err != nil {
			continue
		}

		var props struct {
			Fill            string   `json:"fill"`
			Stroke          string   `json:"stroke"`
			StrokeWidth     float64  `json:"strokeWidth"`
			BorderRadius    float64  `json:"borderRadius"`
			FontSize        float64  `json:"fontSize"`
			FontColor       string   `json:"fontColor"`
			FontFamily      string   `json:"fontFamily"`
			FontWeight      string   `json:"fontWeight"`
			FontStyle       string   `json:"fontStyle"`
			TextDecoration  string   `json:"textDecoration"`
			LineHeight      float64  `json:"lineHeight"`
			Text            string   `json:"text"`
			Src             string   `json:"src"`
			Shadows         []struct {
				X     float64 `json:"x"`
				Y     float64 `json:"y"`
				Blur  float64 `json:"blur"`
				Color string  `json:"color"`
			} `json:"shadows"`
		}
		json.Unmarshal(el.Props, &props)

		l := el.X / slideW * 100
		t := el.Y / slideH * 100
		w := el.W / slideW * 100
		h := el.H / slideH * 100
		opacity := el.Opacity
		if opacity == 0 {
			opacity = 1
		}

		var ss string
		for _, sh := range props.Shadows {
			ss += fmt.Sprintf("%.0fpx %.0fpx %.0fpx %s,", sh.X, sh.Y, sh.Blur, sh.Color)
		}
		ss = strings.TrimRight(ss, ",")

		switch el.Type {
		case "image":
			html += fmt.Sprintf(`<img src="%s" style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f" />`,
				props.Src, l, t, w, h, opacity)
		case "text":
			fontSize := props.FontSize
			if fontSize == 0 {
				fontSize = 16
			}
			fontColor := props.FontColor
			if fontColor == "" {
				fontColor = "#333"
			}
			fontFamily := props.FontFamily
			if fontFamily == "" {
				fontFamily = "inherit"
			}
			fontWeight := props.FontWeight
			if fontWeight == "" {
				fontWeight = "normal"
			}
			fontStyle := props.FontStyle
			if fontStyle == "" {
				fontStyle = "normal"
			}
			textDecoration := props.TextDecoration
			if textDecoration == "" {
				textDecoration = "none"
			}
			lineHeight := props.LineHeight
			if lineHeight == 0 {
				lineHeight = 1.5
			}
			text := html.EscapeString(props.Text)
			if text == "" {
				text = "&nbsp;"
			}
			html += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;font-size:%.2fvw;color:%s;font-family:%s;font-weight:%s;font-style:%s;text-decoration:%s;line-height:%.2f;overflow:hidden;box-shadow:%s;padding:0.5%%">%s</div>`,
				l, t, w, h, opacity,
				fontSize/slideW*100,
				fontColor, fontFamily, fontWeight, fontStyle, textDecoration,
				lineHeight, ss, text,
			)
		case "ellipse":
			fill := props.Fill
			if fill == "" {
				fill = "#e2e8f0"
			}
			border := ""
			if props.StrokeWidth > 0 && props.Stroke != "" {
				border = fmt.Sprintf("border:calc(%.0f/1280*100vw) solid %s;", props.StrokeWidth, props.Stroke)
			}
			html += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;border-radius:50%%;background:%s;%s;box-shadow:%s"></div>`,
				l, t, w, h, opacity, fill, border, ss,
			)
		default: // rect, etc.
			fill := props.Fill
			if fill == "" {
				fill = "#e2e8f0"
			}
			br := props.BorderRadius
			border := ""
			if props.StrokeWidth > 0 && props.Stroke != "" {
				border = fmt.Sprintf("border:calc(%.0f/1280*100vw) solid %s;", props.StrokeWidth, props.Stroke)
			}
			html += fmt.Sprintf(
				`<div style="position:absolute;left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%;opacity:%.2f;border-radius:%.2fvw;background:%s;%s;box-shadow:%s"></div>`,
				l, t, w, h, opacity, br/slideW*100, fill, border, ss,
			)
		}
	}
	return html
}
```

- [ ] **Step 6: Add imports to publish handler**

Replace the import block at the top of `publish_handler.go` to include all needed packages:

```go
import (
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"net/http"
	"path/filepath"
	"strings"

	"zell-server/internal/model"
	"zell-server/internal/repository"

	"github.com/gin-gonic/gin"
)
```

- [ ] **Step 7: Register public routes in main.go**

In `server/main.go`, after the WebSocket route, add:

```go
	// Public publish routes (no auth)
	pub := r.Group("/pub")
	{
		pubH := handler.NewPublishHandler(db)
		pub.GET("/:pid/wiki/", pubH.WikiIndex)
		pub.GET("/:pid/wiki/:aid", pubH.WikiArticle)
		pub.GET("/:pid/ppt/:wid", pubH.PPTPreview)
	}
```

- [ ] **Step 8: Build and verify**

```bash
cd server && go build -o zell-server.exe
```

Expected: build succeeds.

- [ ] **Step 9: Manual test**

```bash
./zell-server.exe
# Open browser: http://localhost:3000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 10: Commit**

```bash
git add server/internal/handler/publish_handler.go server/internal/template/ server/main.go
git commit -m "feat: add public publish routes with HTML templates"
```

---

### Task 8: Desktop sync — push data to server on publish changes

**Files:**
- Modify: `app/src/components/project/PublishSettings.tsx`

**Interfaces:**
- Consumes: `useSyncStore` (serverUrl), existing publish state
- Produces: Auto-sync publish config + content to server

- [ ] **Step 1: Add sync logic to PublishSettings**

Add to `PublishSettings.tsx`, inside the component, after the `toggleItem` callback:

```tsx
  const { serverUrl } = useSyncStore()

  // Sync publish config to server when it changes
  useEffect(() => {
    if (!currentProject || !serverUrl || !connected) return
    const cur = parseProjectSettings(currentProject.settings)
    if (!cur.publish) return
    const sync = async () => {
      await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: JSON.stringify(cur.publish),
          updated_at: new Date().toISOString(),
        }),
      })
      // Sync selected article content
      for (const aid of cur.publish.wiki) {
        const article = useKnowledgeStore.getState().articles.find(a => a.id === aid)
        if (!article) continue
        await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish/articles/${aid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: article.id,
            title: article.title,
            content_html: article.content,
            updated_at: new Date().toISOString(),
          }),
        })
      }
      // Sync selected whiteboard snapshots
      for (const type of ['ppt', 'ui', 'mood'] as const) {
        for (const wid of cur.publish[type]) {
          const wb = useWhiteboardStore.getState().whiteboards.find(w => w.id === wid)
          if (!wb) continue
          await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish/whiteboards/${wid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: wb.id,
              name: wb.name,
              wb_type: wb.wb_type,
              snapshot: wb.snapshot || '{}',
              updated_at: new Date().toISOString(),
            }),
          })
        }
      }
    }
    sync()
  }, [currentProject, serverUrl, connected, publish.enabled])
```

- [ ] **Step 2: Verify lint**

```bash
pnpm run lint
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/project/PublishSettings.tsx
git commit -m "feat: sync publish data to server on changes"
```
