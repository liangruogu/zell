# Zell 发布服务器设计

> 2026-07-27

## 概述

为 Zell 新增「发布」功能：用户可选择性地将项目中的知识库文章、PPT、UI 原型等资源发布为可公开访问的网页，由 Go 协作服务器对外提供服务。

---

## 1. 目标与范围

### 一期范围

- 项目设置页新增「发布」tab，按资源类型（知识库/PPT/UI/Mood）勾选发布内容
- 发布配置存为项目 JSON 字段，总开关默认关闭
- 开启时默认全选知识库文章，PPT/UI/Mood 默认不选
- 关闭总开关后，所有已发布路由返回 404
- Go 服务器新增 `/pub/` 路由组，渲染 HTML 页面
- 桌面端数据变更时同步推送至服务器 SQLite
- 全部只读，无编辑入口

### 不在一期

- 权限细分（目前仅总开关）
- 自定义域名、HTTPS、CDN
- Mood 画廊页（Mood 模块未实现）
- UI 原型预览（UI 模块未实现）

---

## 2. 前端：发布设置页

### 2.1 入口

项目设置页（`ProjectPage.tsx`）新增「发布」tab，与「概览」「AI 配置」并列。

### 2.2 UI 结构

```
项目设置 → 发布
├── 开启网站部署  [toggle switch]
│
├── 📚 知识库  [展开/折叠]
│   ├── ☑ 项目背景与目标
│   ├── ☑ 技术选型方案
│   └── ☑ 设计规范文档
│
├── 📊 PPT  [展开/折叠]
│   ├── ☐ 产品发布会
│   └── ☐ 季度汇报
│
├── 🎨 UI  [展开/折叠]
│   └── ☐ 首页原型
│
└── 🎬 Mood  [展开/折叠]
    (暂无)
```

### 2.3 数据存储

发布配置存入 `projects.settings` JSON 字段，新增 `publish` 键：

```json
{
  "ai": { ... },
  "publish": {
    "enabled": false,
    "wiki": ["article-id-1", "article-id-2"],
    "ppt": [],
    "ui": [],
    "mood": []
  }
}
```

- `enabled`: 总开关（默认 `false`）
- `wiki`/`ppt`/`ui`/`mood`: 各类型勾选的资源 ID 数组
- 开启 `enabled` 时，若 `wiki` 为空则自动填入全部知识库文章 ID

### 2.4 同步机制

复用现有的协作数据通道。用户修改发布配置或编辑已发布文章内容时，桌面端通过 HTTP API 将最新数据推送至 Go 服务器：

```
PUT /api/v1/projects/:id/publish   → 发布配置 JSON
PUT /api/v1/projects/:id/articles/:aid/publish  → 文章内容（含渲染后的 HTML）
PUT /api/v1/projects/:id/whiteboards/:wid/publish → 白板 snapshot JSON
```

---

## 3. 后端：Go 发布服务

### 3.1 路由

```
GET  /pub/:projectId/wiki/          → Wiki 首页（文章列表）
GET  /pub/:projectId/wiki/:aid       → 单篇文章
GET  /pub/:projectId/ppt/:wid        → PPT 预览页
GET  /pub/:projectId/ui/:wid         → UI 原型预览页
GET  /pub/:projectId/mood/:wid       → Mood 画廊页（预留）
```

- 所有路由不带认证，完全公开
- 若项目 `publish.enabled === false`，全部返回 404
- 若指定资源未在发布列表中，返回 404

### 3.2 项目结构（新增文件）

```
server/internal/
├── handler/
│   └── publish_handler.go      # 新增：发布路由处理器
├── service/
│   └── publish_service.go      # 新增：发布业务逻辑
├── repository/
│   └── publish_repo.go         # 新增：发布数据查询
├── model/
│   └── publish.go              # 新增：发布相关模型
└── template/
    ├── wiki_index.html          # Wiki 首页模板
    ├── wiki_article.html        # 单篇文章模板
    ├── ppt_preview.html         # PPT 预览模板
    └── base.html                # 公共布局模板
```

### 3.3 数据库表

Go 服务器存储发布数据的副本：

```sql
CREATE TABLE IF NOT EXISTS publish_config (
    project_id   TEXT PRIMARY KEY,
    data         TEXT NOT NULL DEFAULT '{}',  -- JSON { enabled, wiki[], ppt[], ui[], mood[] }
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_articles (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',   -- 预渲染的 HTML
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_whiteboards (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    name         TEXT NOT NULL,
    wb_type      TEXT NOT NULL,              -- ppt | ui | mood
    snapshot     TEXT NOT NULL DEFAULT '{}',  -- JSON 快照
    updated_at   TEXT NOT NULL
);
```

### 3.4 渲染策略

**知识库文章**：桌面端推送时预渲染为 HTML（`content_html`），服务器直接嵌入模板。避免 Go 端需要理解 TipTap 自定义节点。

**PPT 预览**：服务器根据 `snapshot` JSON 生成 HTML。PPT 元素为 DOM 渲染（CSS 百分比定位），服务器端将 JSON 转为内联 HTML + CSS，逻辑与前端 `SlidePreview.tsx` 一致：
- 幻灯片 1280×720 比例，居中显示
- 背景色、不透明度
- 元素类型：rect/ellipse/text/image/arrow/group
- 文字使用富文本 HTML（`renderRichTextHTML`）
- 左右箭头翻页 + 底部进度条
- 纯静态，无 React 依赖

**UI/Mood**：预留，后续实现。

---

## 4. 发布流程

```
1. 用户打开项目设置 → 发布 tab
2. 开启「网站部署」开关 → 自动勾选全部知识库文章
3. 手动勾选需要发布的 PPT/UI/Mood
4. 桌面端调用 PUT /publish 推送配置到服务器
5. 桌面端依次推送已勾选资源的内容到服务器
6. 外部用户访问 /pub/:pid/wiki/ 查看 Wiki 首页
```

### 变更同步

```
用户编辑文章 → 保存 → 检查是否在发布列表中
  ├── 是 → PUT /publish 推送最新 HTML + 内容
  └── 否 → 不推送

用户修改发布配置 → 勾选/取消 → PUT /publish 推送新配置
  ├── 新增勾选 → 同时推送该资源内容
  └── 取消勾选 → 服务器标记不再对外暴露

用户关闭总开关 → PUT /publish { enabled: false }
  → 所有 /pub/ 路由返回 404
```

---

## 5. 安全

- 发布路由无认证，仅限已勾选的资源
- 不暴露项目元数据（名称、成员等）
- 不暴露未发布的资源
- 总开关关闭时，一切不可访问
- 无编辑/上传入口

---

## 6. 前端文件变更清单

| 文件 | 变更 |
|------|------|
| `src/pages/ProjectPage.tsx` | 新增「发布」tab |
| `src/components/project/PublishSettings.tsx` | 新增：发布设置组件 |
| `src/stores/projectStore.ts` | （可能）新增 publish 相关方法 |
| `src/services/api.ts` | 新增 publish 相关 API 调用 |

**本地模式处理**：若项目未连接到 Go 服务器（`syncStore.connected === false`），发布 tab 显示提示「发布功能需连接协作服务器」，所有控件禁用。

## 7. 后端文件变更清单

| 文件 | 变更 |
|------|------|
| `server/main.go` | 注册 `/pub/` 路由组 |
| `server/internal/handler/publish_handler.go` | 新增 |
| `server/internal/service/publish_service.go` | 新增 |
| `server/internal/repository/publish_repo.go` | 新增 |
| `server/internal/model/publish.go` | 新增 |
| `server/internal/template/*.html` | 新增 4 个 HTML 模板 |
