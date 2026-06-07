# Bindle 应用技术框架与实现路径

---

## 目录

1. [项目概述](#1-项目概述)
2. [总体架构](#2-总体架构)
3. [技术栈详解](#3-技术栈详解)
4. [项目目录结构](#4-项目目录结构)
5. [数据库设计](#5-数据库设计)
6. [API 设计](#6-api-设计)
7. [功能模块详细实现](#7-功能模块详细实现)
   - [7.1 项目管理](#71-项目管理)
   - [7.2 知识库](#72-知识库)
   - [7.3 外部资源链接](#73-外部资源链接)
   - [7.4 头脑风暴区](#74-头脑风暴区)
   - [7.5 分享与协作](#75-分享与协作)
   - [7.6 AI 能力集成](#76-ai-能力集成)
8. [数据同步与协作机制](#8-数据同步与协作机制)
9. [安全设计](#9-安全设计)
10. [设计模式应用](#10-设计模式应用)
11. [开发实施路径](#11-开发实施路径)
12. [部署方案](#12-部署方案)
13. [附录：技术选型对比](#13-附录技术选型对比)

---

## 1. 项目概述

Bindle 是一个将项目所有资料与上下文（Context）打包并呈现在统一平台上的桌面应用。支持本地单机使用，也可通过自托管后端实现团队协作。

### 核心功能

| 功能 | 描述 |
|------|------|
| 项目管理 | 创建/编辑项目，填写背景信息与基础元数据 |
| 知识库 | Markdown 协作编辑、导出 Word/PDF（带样式） |
| 外部资源链接 | 聚合 Canva PPT、GitHub 仓库等外部资产，一键打开 |
| 头脑风暴 | 画笔/文字/矩形/箭头画布，AI 辅助思维发散与图片生成 |
| 分享协作 | 密钥制分享链接，项目独立命名空间，无需注册登录 |

### 运行模式

```
┌─────────────────────────────────────────────┐
│                  Bindle App                  │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐    │
│  │  本地模式    │    │   团队协作模式     │    │
│  │ (Tauri Only) │    │ (Tauri + Go 后端) │    │
│  │             │    │                  │    │
│  │ • 本地SQLite│    │ • 远程PostgreSQL  │    │
│  │ • 本地文件  │    │ • 文件同步服务    │    │
│  │ • API调用AI│     │ • 实时协作(CRDT)  │    │
│  │ • 离线可用  │    │ • AI代理服务      │    │
│  └─────────────┘    └──────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 2. 总体架构

### 2.1 分层架构图

```
┌──────────────────────────────────────────────────────────┐
│                    前端层 (Tauri WebView)                  │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │  React   │ │ TipTap   │ │  tldraw   │ │ TailwindCSS │ │
│  │  18.x   │ │ 编辑器    │ │  画布     │ │ + shadcn/ui │ │
│  └─────────┘ └──────────┘ └───────────┘ └─────────────┘ │
├──────────────────────────────────────────────────────────┤
│                    Tauri 桥接层 (Rust)                     │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ 文件系统 │ │ SQLite   │ │ 系统托盘   │ │ 自动更新    │ │
│  │   API   │ │  本地DB  │ │  快捷键   │ │   服务      │ │
│  └─────────┘ └──────────┘ └───────────┘ └─────────────┘ │
├──────────────────────────────────────────────────────────┤
│                    Go 后端服务 (自托管)                     │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ REST API│ │ WebSocket│ │ 文档转换   │ │  文件存储   │ │
│  │  (Gin)  │ │ (实时协作)│ │ Word/PDF  │ │  (本地/MinIO)│ │
│  └─────────┘ └──────────┘ └───────────┘ └─────────────┘ │
├──────────────────────────────────────────────────────────┤
│                    基础设施层                              │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │
│  │PostgreSQL│ │  Redis   │ │  Docker   │ │  Nginx/Caddy│ │
│  └─────────┘ └──────────┘ └───────────┘ └─────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户操作 → React状态管理(Zustand) → 本地SQLite(即时写入)
                                   ↘
                                    同步引擎(SyncEngine)
                                       ↓
                                 WebSocket/HTTP
                                       ↓
                                  Go 后端服务器
                                       ↓
                                  PostgreSQL (持久化)
                                       ↓
                                  Yjs CRDT 广播 → 其他在线用户
```

### 2.3 双模式切换策略

- **本地模式**：无需连接后端，所有数据存储于本地 SQLite，文件存于本地文件系统
- **团队模式**：连接到 Go 后端，数据经 CRDT 同步至服务器，冲突自动解决
- **模式切换**：在设置中配置后端地址，连接成功后自动将本地数据同步至服务器
- **离线降级**：团队模式下网络断开时，操作保存在本地队列中，恢复连接后自动同步

---

## 3. 技术栈详解

### 3.1 前端技术栈

| 类别 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| **桌面框架** | Tauri | 2.x | Rust 内核，安装包小（~5MB），跨平台，原生性能 |
| **UI 框架** | React | 18.x | 生态丰富，社区成熟，大量现成组件 |
| **语言** | TypeScript | 5.x | 类型安全，提升代码质量 |
| **状态管理** | Zustand | 5.x | 轻量（<1KB），简洁 API，支持中间件 |
| **UI 组件库** | shadcn/ui | latest | 基于 Radix UI，无样式依赖，可定制 |
| **CSS** | Tailwind CSS | 4.x | 原子化 CSS，快速开发，与 shadcn/ui 天然契合 |
| **Markdown 编辑器** | TipTap | 2.x | 基于 ProseMirror，高度可扩展，支持实时协作(Yjs) |
| **画布/白板** | tldraw | 2.x | 开源白板 SDK，内置画笔/形状/箭头等工具 |
| **协作引擎** | Yjs | 13.x | 成熟 CRDT 实现，支持多种数据类型 |
| **网络请求** | TanStack Query | 5.x | 服务端状态管理，缓存/重试/乐观更新 |
| **构建工具** | Vite | 6.x | 快速 HMR，Rollup 打包 |
| **包管理** | pnpm | 9.x | 节省磁盘，严格依赖管理 |

### 3.2 Rust/Tauri 层

| 类别 | 技术 | 选型理由 |
|------|------|----------|
| **Rust 版本** | Stable 1.80+ | Tauri 2.x 要求 |
| **SQLite 驱动** | `rusqlite` | 本地数据库 |
| **文件操作** | `tauri-plugin-fs` | Tauri 官方文件系统插件 |
| **进程管理** | `tauri-plugin-shell` | 执行本地命令（如 Pandoc 调用） |
| **自动更新** | `tauri-plugin-updater` | 桌面应用自动更新 |
| **通知** | `tauri-plugin-notification` | 系统级通知 |
| **剪贴板** | `tauri-plugin-clipboard-manager` | 剪贴板管理 |
| **日志** | `tracing` + `tracing-subscriber` | Rust 端日志 |
| **加密** | `ring` / `aes-gcm` | 本地数据加密 |

### 3.3 后端技术栈 (Go)

| 类别 | 技术 | 选型理由 |
|------|------|----------|
| **语言** | Go 1.22+ | 高性能、低资源占用、编译为单一二进制 |
| **HTTP 框架** | Gin | 高性能、中间件生态完善 |
| **WebSocket** | `nhooyr.io/websocket` | 现代 WebSocket 库，支持 context 取消 |
| **数据库** | PostgreSQL 16 | 生产环境首选，支持 JSONB |
| **ORM** | Bun | 类型安全，性能优于 GORM |
| **文档转换** | `unioffice` + LibreOffice | Word/PDF 模板渲染 |
| **文件存储** | 本地 FS / MinIO | 简单部署用本地，扩展用 MinIO |
| **日志** | `zerolog` | 高性能零分配日志 |
| **配置** | `viper` | 支持多种配置格式 |
| **CLI** | `cobra` | 服务管理命令行 |
| **测试** | `testify` + `httptest` | 标准测试套件 |
| **API 文档** | Swagger/OpenAPI | 自动生成 API 文档 |

### 3.4 AI 集成

| 类别 | 技术 | 选型理由 |
|------|------|----------|
| **LLM 客户端** | Vercel AI SDK | 统一多模型接口（OpenAI/Anthropic/Ollama） |
| **协议** | Server-Sent Events (SSE) | LLM 流式响应 |
| **本地模型** | Ollama | 局域网自托管大模型 |
| **图片生成** | OpenAI DALL-E / Stability AI | 头脑风暴区图片生成 |
| **Prompt 管理** | 模板引擎 + 上下文注入 | 自动注入项目背景信息 |

---

## 4. 项目目录结构

```
bindle/
├── README.md
├── ARCHITECTURE.md                    # 本文档
│
├── app/                               # Tauri 前端应用
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   │
│   ├── src/                           # React 源码
│   │   ├── main.tsx                   # 入口
│   │   ├── App.tsx                    # 根组件 + 路由
│   │   ├── router.tsx                 # 路由配置
│   │   │
│   │   ├── assets/                    # 静态资源
│   │   │   ├── icons/
│   │   │   └── fonts/
│   │   │
│   │   ├── components/                # 通用组件
│   │   │   ├── ui/                    # shadcn/ui 基础组件
│   │   │   ├── layout/               # 布局组件
│   │   │   │   ├── AppShell.tsx       # 主布局壳
│   │   │   │   ├── Sidebar.tsx        # 侧边栏
│   │   │   │   └── Header.tsx         # 顶栏
│   │   │   ├── editor/               # 编辑器相关
│   │   │   │   ├── MarkdownEditor.tsx # TipTap 封装
│   │   │   │   ├── EditorToolbar.tsx  # 工具栏
│   │   │   │   └── AIPromptPanel.tsx  # AI提示面板
│   │   │   ├── canvas/               # 白板相关
│   │   │   │   ├── Whiteboard.tsx     # tldraw 封装
│   │   │   │   └── CanvasAIButton.tsx # AI 触发按钮
│   │   │   ├── project/              # 项目相关
│   │   │   │   ├── ProjectCard.tsx
│   │   │   │   ├── ProjectForm.tsx
│   │   │   │   └── ProjectSettings.tsx
│   │   │   └── share/                # 分享相关
│   │   │       ├── ShareDialog.tsx
│   │   │       └── InviteCodeList.tsx
│   │   │
│   │   ├── pages/                    # 页面组件
│   │   │   ├── HomePage.tsx          # 项目列表首页
│   │   │   ├── ProjectPage.tsx       # 项目详情页
│   │   │   ├── KnowledgeBasePage.tsx # 知识库页
│   │   │   ├── WhiteboardPage.tsx    # 头脑风暴页
│   │   │   └── SettingsPage.tsx      # 设置页
│   │   │
│   │   ├── stores/                   # Zustand 状态
│   │   │   ├── projectStore.ts       # 项目状态
│   │   │   ├── editorStore.ts        # 编辑器状态
│   │   │   ├── whiteboardStore.ts    # 白板状态
│   │   │   ├── aiStore.ts            # AI相关状态
│   │   │   └── syncStore.ts          # 同步状态
│   │   │
│   │   ├── hooks/                    # 自定义 Hooks
│   │   │   ├── useProject.ts
│   │   │   ├── useMarkdown.ts
│   │   │   ├── useCollaboration.ts   # Yjs协作Hook
│   │   │   ├── useAI.ts
│   │   │   └── useExport.ts
│   │   │
│   │   ├── services/                 # 服务层
│   │   │   ├── db.ts                 # SQLite 操作
│   │   │   ├── api.ts                # HTTP 请求
│   │   │   ├── syncEngine.ts         # 同步引擎
│   │   │   ├── aiService.ts          # AI 服务
│   │   │   ├── exportService.ts      # 导出服务
│   │   │   └── fileService.ts        # 文件服务
│   │   │
│   │   ├── lib/                      # 工具库
│   │   │   ├── yjs/                  # Yjs 配置
│   │   │   │   ├── doc.ts            # Y.Doc 初始化
│   │   │   │   ├── awareness.ts      # 用户感知
│   │   │   │   └── provider.ts       # WebSocket Provider
│   │   │   ├── crypto.ts             # 加密工具
│   │   │   ├── markdown.ts           # Markdown 工具
│   │   │   └── constants.ts          # 常量
│   │   │
│   │   └── types/                    # TypeScript 类型
│   │       ├── project.ts
│   │       ├── knowledge.ts
│   │       ├── whiteboard.ts
│   │       ├── ai.ts
│   │       └── share.ts
│   │
│   └── src-tauri/                    # Tauri Rust 后端
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json
│       ├── icons/
│       └── src/
│           ├── main.rs               # Rust入口
│           ├── lib.rs
│           ├── db/                   # SQLite 操作
│           │   ├── mod.rs
│           │   ├── migrations.rs
│           │   └── models.rs
│           ├── commands/             # Tauri 命令
│           │   ├── mod.rs
│           │   ├── project.rs
│           │   ├── file.rs
│           │   └── system.rs
│           └── crypto/               # 本地加密
│               ├── mod.rs
│               └── vault.rs
│
├── server/                           # Go 后端服务
│   ├── go.mod
│   ├── go.sum
│   ├── main.go                       # 服务入口
│   ├── cmd/
│   │   ├── root.go                   # cobra 根命令
│   │   ├── serve.go                  # 启动服务
│   │   └── migrate.go               # 数据库迁移
│   │
│   ├── internal/
│   │   ├── config/                   # 配置管理
│   │   │   └── config.go
│   │   ├── handler/                  # HTTP/WS 处理器
│   │   │   ├── project_handler.go
│   │   │   ├── knowledge_handler.go
│   │   │   ├── whiteboard_handler.go
│   │   │   ├── export_handler.go
│   │   │   ├── share_handler.go
│   │   │   ├── ai_handler.go
│   │   │   └── ws_handler.go         # WebSocket handler
│   │   ├── service/                  # 业务逻辑层
│   │   │   ├── project_service.go
│   │   │   ├── knowledge_service.go
│   │   │   ├── whiteboard_service.go
│   │   │   ├── export_service.go
│   │   │   ├── share_service.go
│   │   │   └── ai_service.go
│   │   ├── repository/               # 数据访问层
│   │   │   ├── project_repo.go
│   │   │   ├── knowledge_repo.go
│   │   │   ├── whiteboard_repo.go
│   │   │   └── share_repo.go
│   │   ├── model/                    # 数据模型
│   │   │   ├── project.go
│   │   │   ├── knowledge.go
│   │   │   ├── whiteboard.go
│   │   │   └── share.go
│   │   ├── middleware/               # 中间件
│   │   │   ├── auth.go               # 密钥验证
│   │   │   ├── cors.go
│   │   │   └── logger.go
│   │   ├── ws/                       # WebSocket 管理
│   │   │   ├── hub.go                # 连接中心
│   │   │   ├── client.go             # 客户端封装
│   │   │   └── message.go            # 消息协议
│   │   └── converter/                # 文档转换
│   │       ├── word.go
│   │       └── pdf.go
│   │
│   ├── migrations/                   # SQL迁移脚本
│   │   ├── 001_create_projects.up.sql
│   │   ├── 001_create_projects.down.sql
│   │   └── ...
│   │
│   └── test/
│       └── ...
│
├── docs/                             # 文档
│   ├── api/                          # API 文档
│   └── guides/                       # 用户指南
│
├── docker-compose.yml                # Docker 编排
├── Dockerfile.server                 # Go 服务镜像
└── .github/
    └── workflows/                    # CI/CD
        ├── build-app.yml             # Tauri 多平台构建
        └── build-server.yml          # Docker 镜像构建
```

---

## 5. 数据库设计

### 5.1 本地 SQLite 表结构

```sql
-- 项目表
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,          -- UUID v7
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    background  TEXT DEFAULT '',          -- 项目背景(长文本Markdown)
    icon        TEXT DEFAULT '',           -- 图标/emoji
    settings    JSON DEFAULT '{}',        -- 项目设置(JSON)
    created_at  TEXT NOT NULL,             -- ISO 8601
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT DEFAULT NULL          -- 软删除
);

-- 知识库文章表
CREATE TABLE knowledge_articles (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    title       TEXT NOT NULL,
    content     TEXT DEFAULT '',           -- Markdown 原始内容
    content_json JSON DEFAULT '{}',        -- ProseMirror JSON 格式(协作用)
    parent_id   TEXT DEFAULT NULL,         -- 层级目录/嵌套文章
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT DEFAULT NULL
);

CREATE INDEX idx_knowledge_project ON knowledge_articles(project_id);

-- 外部资源链接表
CREATE TABLE external_links (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT DEFAULT '',
    link_type   TEXT DEFAULT 'web',        -- web | github | figma | canva | ...
    favicon     TEXT DEFAULT '',           -- 网站图标
    ai_skill    TEXT DEFAULT '',           -- 给AI的附加提示词skill
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT DEFAULT NULL
);

CREATE INDEX idx_links_project ON external_links(project_id);

-- 白板数据表
CREATE TABLE whiteboards (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    name        TEXT NOT NULL,
    snapshot    BLOB DEFAULT NULL,         -- tldraw 快照(JSON序列化)
    update_log  BLOB DEFAULT NULL,         -- 增量更新日志(CRDT)
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT DEFAULT NULL
);

CREATE INDEX idx_whiteboard_project ON whiteboards(project_id);

-- AI对话记录表
CREATE TABLE ai_conversations (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    source_type TEXT NOT NULL,             -- knowledge | whiteboard
    source_id   TEXT DEFAULT NULL,         -- 关联资源ID(选中文档/白板时)
    selected_text TEXT DEFAULT NULL,      -- 选中的上下文文本
    messages    JSON DEFAULT '[]',         -- 对话消息数组
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX idx_ai_project ON ai_conversations(project_id);

-- 分享邀请码表
CREATE TABLE invite_codes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    code        TEXT NOT NULL UNIQUE,      -- 邀请密钥
    display_name TEXT NOT NULL,            -- 项目所有者为受邀者自定义的名称
    role        TEXT DEFAULT 'editor',     -- editor | viewer
    created_at  TEXT NOT NULL,
    expires_at  TEXT DEFAULT NULL          -- 过期时间，NULL=永不过期
);

CREATE INDEX idx_invite_project ON invite_codes(project_id);

-- 设置表（应用全局配置）
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
```

### 5.2 服务端 PostgreSQL 表结构

服务端表结构与本地基本一致，增加以下字段以支持多用户协作：

```sql
-- 用户身份表（基于密钥，非传统登录）
CREATE TABLE identities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_code_id UUID NOT NULL REFERENCES invite_codes(id),
    client_id   TEXT NOT NULL UNIQUE,       -- 客户端生成的唯一标识
    last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 操作日志表（审计/冲突追踪）
CREATE TABLE operation_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id),
    identity_id UUID NOT NULL REFERENCES identities(id),
    resource    TEXT NOT NULL,              -- 资源类型
    resource_id TEXT NOT NULL,              -- 资源ID
    operation   TEXT NOT NULL,              -- create | update | delete
    payload     JSONB DEFAULT '{}',
    clock       BIGINT NOT NULL,            -- HLC (混合逻辑时钟)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 实体关系图 (ER)

```
Projects (1) ──┬── (N) KnowledgeArticles
               ├── (N) ExternalLinks
               ├── (N) Whiteboards
               ├── (N) AIConversations
               └── (N) InviteCodes ──── (N) Identities
```

---

## 6. API 设计

### 6.1 通用规范

- **协议**：REST over HTTPS，WebSocket over WSS
- **编码**：JSON (UTF-8)
- **认证**：Header `X-Bindle-Key: <invite_code>`（无需登录，密钥即身份）
- **版本**：URL 前缀 `/api/v1`

### 6.2 端点清单

#### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects` | 获取项目列表 |
| `POST` | `/api/v1/projects` | 创建项目 |
| `GET` | `/api/v1/projects/:id` | 获取项目详情 |
| `PUT` | `/api/v1/projects/:id` | 更新项目信息 |
| `DELETE` | `/api/v1/projects/:id` | 删除项目（软删除） |

#### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects/:id/knowledge` | 获取知识库文章列表 |
| `POST` | `/api/v1/projects/:id/knowledge` | 创建文章 |
| `GET` | `/api/v1/projects/:id/knowledge/:aid` | 获取单篇文章 |
| `PUT` | `/api/v1/projects/:id/knowledge/:aid` | 更新文章 |
| `DELETE` | `/api/v1/projects/:id/knowledge/:aid` | 删除文章 |
| `POST` | `/api/v1/projects/:id/knowledge/:aid/export` | 导出Word/PDF |

#### 外部链接

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects/:id/links` | 获取链接列表 |
| `POST` | `/api/v1/projects/:id/links` | 添加链接 |
| `PUT` | `/api/v1/projects/:id/links/:lid` | 更新链接 |
| `DELETE` | `/api/v1/projects/:id/links/:lid` | 删除链接 |

#### 白板

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects/:id/whiteboards` | 获取白板列表 |
| `POST` | `/api/v1/projects/:id/whiteboards` | 创建白板 |
| `GET` | `/api/v1/projects/:id/whiteboards/:wid` | 获取白板快照 |
| `DELETE` | `/api/v1/projects/:id/whiteboards/:wid` | 删除白板 |

#### AI

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/projects/:id/ai/chat` | 发送对话消息(SSE流式) |
| `POST` | `/api/v1/projects/:id/ai/image` | 生成图片 |

#### 分享

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects/:id/invites` | 获取邀请码列表 |
| `POST` | `/api/v1/projects/:id/invites` | 生成邀请码 |
| `DELETE` | `/api/v1/projects/:id/invites/:cid` | 撤销邀请码 |
| `POST` | `/api/v1/projects/:id/join` | 使用邀请码加入项目 |

#### WebSocket

```
路径: /ws/:project_id?key=<invite_code>
协议: Yjs WebSocket Protocol (y-websocket)
功能: CRDT 实时协作同步
```

---

## 7. 功能模块详细实现

### 7.1 项目管理

**目标**：创建和管理项目，填写背景信息作为 AI 上下文基础。

**实现方案**：

```
场景流程：
  创建工作区 → 填写项目信息 → 自动建立上下文索引

前端实现：
  ├── ProjectForm.tsx          # React Hook Form + Zod 校验
  ├── ProjectCard.tsx          # 项目卡片(名称/描述/更新时间)
  └── ProjectSettings.tsx      # 设置面板(修改背景信息/AI配置)

后端实现：
  ├── POST /projects           # 创建，自动生成项目密钥
  ├── GET  /projects           # 列表，按 update_time DESC 排序
  └── PUT  /projects/:id       # 更新，触发上下文重建

设计模式：
  ├── Builder Pattern          # 项目创建时逐步构建上下文
  └── Observer Pattern         # 项目信息变更 → 通知关联模块刷新
```

**上下文注入管道** (每次 AI 调用时自动注入)：

```
[项目背景] + [知识库最近文章摘要] + [相关外部链接] → Prompt 模板 → AI模型
```

使用 **Chain of Responsibility 模式**：每个上下文源（背景/知识库/链接）作为独立 `ContextProvider`，按优先级组装最终 prompt。

### 7.2 知识库

**目标**：以 Markdown 为基础进行协作编辑，支持层级目录，导出 Word/PDF 时保持排版样式。

#### 7.2.1 Markdown 编辑器实现

**技术选型**：TipTap (基于 ProseMirror)

**扩展注册**：

```typescript
// TipTap 扩展列表
extensions: [
  StarterKit,           // 基础 Markdown 语法(标题/列表/加粗/代码等)
  Image,                // 图片插入/拖拽
  Table,                // 表格
  TaskList,             // 任务列表 - [ ]
  Highlight,            // 高亮
  Link,                 // 链接
  Placeholder,          // 占位符
  CharacterCount,       // 字数统计
  Collaboration,        // Yjs 实时协作(团队模式)
  AISlashCommand,       // 自定义: /ai 触发AI辅助写作
]
```

**关键功能实现**：

| 功能 | 实现方式 |
|------|----------|
| 实时预览 | TipTap 所见即所得(WYSIWYG)模式，无需预览窗口 |
| Markdown 快捷键 | StarterKit 内置（`#` → 标题，`-` → 列表等） |
| 图片粘贴 | 监听 `paste` 事件 → 读取剪贴板图片 → 存本地/上传 → 插入 |
| @AI 召唤 | 选中文字 → 浮动菜单出现「AI 提问」→ 弹出 AI 面板 |
| 代码高亮 | `@tiptap/extension-code-block-lowlight` + highlight.js |
| 目录导航 | 解析标题 AST → 生成侧边大纲，联动 Scrollspy |
| 文件引用 | `[[文件名]]` 语法 → 知识库内链，类似 Obsidian |

**CRDT 协作实现**：

```typescript
// hooks/useCollaboration.ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { TiptapCollabProvider } from '@tiptap/extension-collaboration';

const ydoc = new Y.Doc();
const ytext = ydoc.getText('article-content');

// WebSocket 连接到 Go 后端
const wsProvider = new WebsocketProvider(
  `ws://${serverUrl}/ws/${projectId}`,
  `article-${articleId}`,
  ydoc
);

// TipTap 绑定
const collabExt = Collaboration.configure({
  document: ydoc,
  field: 'article-content',
});
```

#### 7.2.2 Word/PDF 导出

**导出流水线**：

```
Markdown/ProseMirror JSON → AST 解析 → 模板渲染 → 格式输出
```

**实现策略**（在 Go 后端完成，保证样式一致性）：

```
┌─────────────────────────────────────────────────────┐
│                   导出流程                            │
│                                                     │
│ 1. Markdown 文本                                    │
│       ↓                                             │
│ 2. Goldmark 解析为 AST (Go Markdown 解析器)          │
│       ↓                                             │
│ 3. 遍历 AST 节点，应用样式映射表                      │
│       ↓                                             │
│ 4. Word: unioffice 库生成 .docx                      │
│    - 强制标题样式 (Heading1/2/3) 而非手动加粗         │
│    - 正文字体: 宋体/等线 11pt                         │
│    - 标题字体: 黑体                                   │
│    - 表格带边框样式                                   │
│    - 代码块等宽字体 + 灰色背景                        │
│       ↓                                             │
│ 5. PDF: 通过 LibreOffice --headless 转换             │
│    或使用 go-wkhtmltopdf (基于 WebKit 渲染引擎)       │
│    - 先将 Markdown → HTML (带CSS样式表)              │
│    - 再 HTML → PDF (固定页边距/页眉页脚/页码)         │
└─────────────────────────────────────────────────────┘
```

**样式映射表**（Word 导出关键）：

```go
var WordStyleMap = map[string]StyleConfig{
    "heading1":  {Font: "黑体", Size: 22, Bold: true,  SpaceBefore: 12, SpaceAfter: 6, OutlineLevel: 1},
    "heading2":  {Font: "黑体", Size: 16, Bold: true,  SpaceBefore: 10, SpaceAfter: 4, OutlineLevel: 2},
    "heading3":  {Font: "黑体", Size: 14, Bold: true,  SpaceBefore: 8,  SpaceAfter: 3, OutlineLevel: 3},
    "paragraph": {Font: "等线", Size: 11, Bold: false, SpaceBefore: 0,  SpaceAfter: 6, LineSpacing: 1.5},
    "codeblock": {Font: "Consolas", Size: 10, Bold: false, Background: "#f4f4f4", BorderStyle: "single"},
    "table":     {Font: "等线", Size: 10, Bold: false, BorderStyle: "single"},
    "blockquote":{Font: "等线", Size: 11, Italic: true, LeftIndent: 24, BorderLeft: "3px solid #ccc"},
}
```

### 7.3 外部资源链接

**目标**：聚合外部平台资源（Canva/Google Docs/GitHub 等），一键打开网页，并为 AI 提供 skill 上下文。

**实现方案**：

```typescript
// types/project.ts
interface ExternalLink {
  id: string;
  title: string;
  url: string;
  linkType: 'web' | 'github' | 'figma' | 'canva' | 'notion' | 'other';
  aiSkill: string;      // 给AI的附加说明
  favicon?: string;
}

// services/aiService.ts 中的 Skill注入逻辑
function buildContextFromLinks(links: ExternalLink[]): string {
  return links
    .filter(l => l.aiSkill)
    .map(l => `资源"[${l.title}](${l.url})": ${l.aiSkill}`)
    .join('\n');
}
```

**前端交互**：
- 卡片式布局展示外部链接，显示 favicon → 点击调用 `tauri-plugin-shell` 的 `open()` 在默认浏览器打开
- 支持拖拽排序
- 链接类型自动检测（输入 GitHub URL → 自动识别类型并拉取 repo 名）

### 7.4 头脑风暴区

**目标**：可自由绘制的白板画布，支持画笔/文字/矩形/箭头，选中文本时 @AI 进行思维发散或图片生成。

#### 7.4.1 画布实现

**技术选型**：tldraw 2.x

tldraw 原生支持：
- ✅ 画笔（Draw tool）
- ✅ 文字（Text tool）
- ✅ 矩形/圆角矩形/圆形（Geo tool）
- ✅ 箭头/连线（Arrow tool + Line tool）
- ✅ 颜色/粗细/样式（Style panel）
- ✅ 粘贴图片
- ✅ 无限画布/缩放/平移
- ✅ 完整的 undo/redo

**自定义扩展**：

```typescript
// 自定义 AI 工具
class AITool extends StateNode {
  static override id = 'ai';
  
  override onEnter() {
    // 显示AI面板
    this.editor.setCursor({ type: 'crosshair' });
  }
  
  override onPointerDown(info) {
    const selectedText = this.editor.getSelectedShapeIds()
      .map(id => {
        const shape = this.editor.getShape(id);
        return shape?.type === 'text' ? shape.props.text : null;
      })
      .filter(Boolean)
      .join('\n');
    
    if (selectedText) {
      // 弹出 AI 操作菜单
      showAIPanel({
        context: selectedText,
        actions: ['brainstorm', 'generate_image', 'summarize', 'expand']
      });
    }
  }
}

// 注册自定义工具
const customTools = [AITool];
```

**白板数据持久化**：

tldraw 使用 `TLStore` 进行数据管理，快照 (snapshot) 序列化为 JSON 存数据库：

```
tldraw editor → getSnapshot() → JSON.stringify → SQLite/PostgreSQL BLOB
                                                      ↓
                                              Yjs CRDT 同步(团队模式)
```

**实时协作**（团队模式）：

tldraw 原生支持 Yjs 绑定：

```typescript
import { useYjsStore } from './yjsStore';

function Whiteboard() {
  const store = useYjsStore({
    roomId: `whiteboard-${whiteboardId}`,
    hostUrl: wsUrl,
  });

  return <Tldraw store={store} />;
}
```

#### 7.4.2 AI 辅助头脑风暴

**交互流程**：

```
用户选中白板上的文字
     ↓
浮动工具栏出现 "✨ AI 发散" 按钮
     ↓
点击后弹出面板，选择模式：
  ├── "思维发散"    → LLM 生成更多想法/关联概念
  ├── "图片生成"    → DALL-E/Stable Diffusion 生成插图
  ├── "总结摘要"    → LLM 提炼核心观点
  └── "扩展论述"    → LLM 将简短想法扩展为段落
     ↓
结果展示在画布上（文字以新 Shape 插入，图片以 Image Shape 插入）
```

**Prompt 设计**：

```
思维发散：
  你是项目顾问。以下是项目背景：{projectBackground}
  用户在头脑风暴中写了："{selectedText}"
  请从5个不同维度进行发散思考，每个维度给出2-3个具体想法。
  使用 Markdown 格式。

图片生成：
  基于以下项目背景和文字描述生成一张示意图片：
  项目背景：{projectBackground}
  描述文字："{selectedText}"
  风格：专业商务 / 简洁现代
```

### 7.5 分享与协作

**目标**：无需登录系统，通过密钥 + 命名标识进行项目和成员的识别与管理。

**设计原理**：

```
┌─────────────────────────────────────────────────────┐
│                 密钥制身份系统                        │
│                                                     │
│  项目所有者                                         │
│     │                                               │
│     │ 创建邀请码                                     │
│     ↓                                               │
│  ┌──────────────────────────────────────┐          │
│  │ 邀请码: BNDL-xxxx-xxxx-xxxx          │          │
│  │ 人员名称: "张三" (所有者自定义)        │          │
│  │ 权限: editor / viewer                │          │
│  │ 过期时间: 30天后 / 永不过期           │          │
│  └──────────────────────────────────────┘          │
│     │                                               │
│     │ 分享链接: https://bindle.example.com/join/     │
│     │         ?code=BNDL-xxxx-xxxx-xxxx             │
│     ↓                                               │
│  被邀请者打开链接                                    │
│     │                                               │
│     │ Bindle App 自动识别链接参数                    │
│     │ 本地生成唯一 Client ID (SHA-256)              │
│     │ 携带邀请码请求加入                             │
│     ↓                                               │
│  后端验证邀请码 → 绑定 Client ID → 返回会话JWT       │
│     │                                               │
│     │ 后续请求均携带 JWT (本地存储, 明文不可追溯)      │
│     ↓                                               │
│  建立 WebSocket 协作连接                             │
└─────────────────────────────────────────────────────┘
```

**核心实现**：

```go
// server/internal/model/share.go
type InviteCode struct {
    ID          uuid.UUID  `json:"id"`
    ProjectID   uuid.UUID  `json:"project_id"`
    Code        string     `json:"code"`         // BNDL-xxxx
    DisplayName string     `json:"display_name"` // 人员标识名称
    Role        string     `json:"role"`         // editor | viewer
    ExpiresAt   *time.Time `json:"expires_at"`
}

// 加入项目流程
// POST /api/v1/projects/:id/join
// Body: { "code": "BNDL-xxxx...", "client_id": "auto-generated" }
// 
// 1. 查询 invite_codes WHERE code = ? AND (expires_at IS NULL OR expires_at > NOW())
// 2. 查询或创建 identities WHERE invite_code_id = ? AND client_id = ?
// 3. 签发 JWT: { sub: identity_id, project_id, role, iat, exp }
// 4. 返回 JWT (后续请求放 Authorization: Bearer <jwt>)
```

**优势**：
- 无需用户注册/密码管理
- 项目所有者完全控制参与者身份
- 分享链接即邀请，体验流畅
- JWT 不包含个人身份信息，仅包含 UI 显示名

### 7.6 AI 能力集成

**目标**：AI 能感知项目上下文，避免重复输入背景信息。

**实现架构**：

```
┌──────────────────────────────────────────────────┐
│                 AI Service 层                     │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │        ContextBuilder (上下文构建器)       │    │
│  │                                         │    │
│  │  输入:                                  │    │
│  │  ├── project.background (必选)          │    │
│  │  ├── selectedText     (可选,用户选中)    │    │
│  │  ├── recentKnowledge  (可选,最近文档)    │    │
│  │  └── externalLinkSkills (可选,链接技能)  │    │
│  │                                         │    │
│  │  输出: 组装后的 System Prompt            │    │
│  └─────────────────────────────────────────┘    │
│                      ↓                           │
│  ┌─────────────────────────────────────────┐    │
│  │         Provider Router (模型路由)        │    │
│  │                                         │    │
│  │  根据任务类型选择模型:                    │    │
│  │  ├── 文本生成 → OpenAI GPT / Claude      │    │
│  │  ├── 图片生成 → DALL-E / Stable Diffusion │    │
│  │  └── 本地模型 → Ollama (局域网模式)       │    │
│  │                                         │    │
│  │  根据 settings 中的 provider 配置路由     │    │
│  └─────────────────────────────────────────┘    │
│                      ↓                           │
│  ┌─────────────────────────────────────────┐    │
│  │          Response Handler               │    │
│  │                                         │    │
│  │  ├── SSE 流式输出 (文本生成)             │    │
│  │  ├── 图片 URL/Base64 (图片生成)          │    │
│  │  └── 错误处理 + 重试 + 降级              │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

**前端 AI 调用流程**：

```typescript
// hooks/useAI.ts
function useAI() {
  const project = useProjectStore(s => s.currentProject);
  
  const chat = async (text: string, options: AIChatOptions) => {
    return fetch(`/api/v1/projects/${project.id}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bindle-Key': getInviteKey(),
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        source_type: options.sourceType,   // 'knowledge' | 'whiteboard'
        source_id: options.sourceId,
        selected_text: options.selectedText,
      }),
    });
    // 服务端自动注入项目上下文到 system prompt
  };
  
  const generateImage = async (prompt: string) => {
    return fetch(`/api/v1/projects/${project.id}/ai/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  };
  
  return { chat, generateImage };
}
```

**Go 后端 AI 服务实现**：

```go
// server/internal/service/ai_service.go
type AIService struct {
    provider   AIProvider          // 接口
    contextMgr *ContextManager
}

func (s *AIService) Chat(ctx context.Context, req ChatRequest) (<-chan string, error) {
    // 1. 从数据库加载项目上下文
    projectCtx, _ := s.contextMgr.BuildContext(ctx, req.ProjectID)
    
    // 2. 组装 messages
    messages := []Message{
        {Role: "system", Content: buildSystemPrompt(projectCtx, req.SelectedText)},
    }
    messages = append(messages, req.Messages...)
    
    // 3. 调用 AI Provider (SSE流)
    stream, err := s.provider.ChatStream(ctx, messages)
    
    // 4. 保存对话记录
    go s.saveConversation(ctx, req.ProjectID, messages, stream)
    
    return stream, err
}
```

**AI Provider 配置**（存储在项目的 settings 中）：

```json
{
  "ai": {
    "text_provider": "openai",
    "text_model": "gpt-4o",
    "text_api_key": "sk-...",
    "image_provider": "openai",
    "image_model": "dall-e-3",
    "local_ollama_url": "http://localhost:11434",
    "local_ollama_model": "llama3:8b",
    "fallback_to_local": true
  }
}
```

---

## 8. 数据同步与协作机制

### 8.1 同步总体策略

```
本地模式: React State → Zustand → Tauri SQLite (最终一致)
                                    ↓
                          Tauri invoke() 调用 Rust 命令

团队模式: React State → Zustand → Yjs CRDT → WebSocket → Go Server
                  ↓ (双重写入)                          ↓
           本地 SQLite(离线队列)                 PostgreSQL(持久化)
                                                     ↓
                                              广播给其他在线用户
```

### 8.2 CRDT 与冲突解决

**Yjs 数据类型映射**：

| 业务数据 | Yjs 类型 | 说明 |
|---------|---------|------|
| 项目信息 | `Y.Map` | 键值对，自动合并 |
| 知识库文本 | `Y.Text` | 富文本协作(绑定 TipTap) |
| 白板快照 | `Y.Map` (嵌套) | tldraw store 快照 |
| 外部链接列表 | `Y.Array<Y.Map>` | 有序列表 |

**HLC (混合逻辑时钟)**：

```go
// 在操作日志中使用 HLC 作为排序依据
type HLC struct {
    Timestamp int64  // 物理时间 (Unix毫秒)
    Counter   uint16 // 逻辑计数器 (同毫秒内递增)
    NodeID    string // 节点标识
}
// 比较规则: 先比 Timestamp → 再比 Counter → 最后比 NodeID
```

### 8.3 离线队列与重连

```
写入操作
  ↓
先写本地 SQLite (标记 sync_status = 'pending')
  ↓
放入 SyncQueue (内存 + 持久化)
  ↓
尝试 WebSocket 发送
  ├── 成功 → 标记 sync_status = 'synced'
  └── 失败/离线 → 保持 'pending'，定时重试
       ↓
   重连后批量发送，按 HLC 排序
       ↓
   服务端合并 → 广播
```

---

## 9. 安全设计

### 9.1 数据安全

| 层面 | 措施 |
|------|------|
| **传输** | 强制 HTTPS/WSS，TLS 1.3 |
| **本地存储** | SQLite 文件使用 AES-256-GCM 加密（Tauri Rust 端） |
| **API 认证** | 邀请码验证 + 短期 JWT (15分钟过期) |
| **文件访问** | 所有文件通过 API 代理，携带 JWT 鉴权 |
| **密钥生成** | `crypto/rand` 生成 256 位随机密钥 |

### 9.2 密钥管理

```
邀请码格式: BNDL-{16字符Base62编码随机数}
例: BNDL-a3Fk9mZx2WpL7qRt

生成方式:
  1. crypto.randomBytes(12) → 96位随机值
  2. Base62 编码 → 16字符
  3. 前缀 BNDL- → 用于前端自动识别

有效期控制:
  - 创建时可设置过期时间（天/永不过期）
  - 后端定期清理过期邀请码(每日 cron)
  - 可随时手动撤销(软删除)
```

### 9.3 本地数据加密

```rust
// src-tauri/src/crypto/vault.rs (Rust)
use aes_gcm::{Aes256Gcm, Key, Nonce};
use ring::rand::SecureRandom;

pub struct Vault {
    cipher: Aes256Gcm,
    key: Key<Aes256Gcm>,
}

impl Vault {
    pub fn new(master_password: &[u8]) -> Self {
        // 使用 Argon2id 从主密码派生 256 位密钥
        let derived_key = argon2::hash_raw(master_password, &salt, &config);
        let key = Key::<Aes256Gcm>::from_slice(&derived_key);
        Self { cipher: Aes256Gcm::new(key), key: *key }
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Vec<u8> {
        let nonce = generate_nonce();
        self.cipher.encrypt(&nonce, plaintext)
    }

    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>> {
        self.cipher.decrypt(&nonce, ciphertext)
    }
}
```

---

## 10. 设计模式应用

### 10.1 前端设计模式

| 设计模式 | 应用场景 | 实现 |
|---------|---------|------|
| **Flux/单向数据流** | 全局状态管理 | Zustand Store → Component → Action → Store |
| **观察者模式** | 同步状态变更广播 | `syncStore.subscribe()` → 通知 UI 更新 |
| **命令模式** | 白板操作 undo/redo | tldraw StateNode + History 记录 |
| **策略模式** | AI Provider 切换 | `AIProvider` 接口，OpenAI/Ollama 实现 |
| **适配器模式** | Tauri API 封装 | `TauriFSAdapter` 统一文件操作接口 |
| **工厂模式** | TipTap 扩展构建 | `createEditorExtensions(mode)` 按需组装 |
| **中介者模式** | 模块间通信 | `EventBus` 解耦组件间通信 |
| **装饰器模式** | 编辑器功能增强 | TipTap Extension 即装饰器 |
| **MVC** | 页面结构 | Page (View) → Zustand (Model) → Service (Controller) |
| **仓储模式** | 数据访问抽象 | `ProjectRepository` 屏蔽本地/远程差异 |

### 10.2 后端设计模式

| 设计模式 | 应用场景 | 实现 |
|---------|---------|------|
| **Clean Architecture** | 整体分层 | Handler → Service → Repository → DB |
| **仓储模式** | 数据访问抽象 | `ProjectRepository` 接口 + PostgreSQL/SQLite 实现 |
| **依赖注入** | 服务组合 | 构造函数注入（手写，不用 DI 框架） |
| **策略模式** | 导出格式切换 | `Exporter` 接口 → WordExporter / PDFExporter |
| **责任链模式** | AI 上下文构建 | `ContextBuilder` → BackgroundProvider → KnowledgeProvider → LinksProvider |
| **发布-订阅** | WebSocket 广播 | Hub-Broadcast 模式（goroutine + channel） |
| **管道模式** | 文档转换流水线 | Parse → Transform → Render → Output |
| **单例模式** | 全局配置/连接池 | `config.Global` / `db.Pool` |
| **选项模式** | 服务配置 | `NewAIService(WithProvider(...), WithModel(...))` |

### 10.3 同步引擎设计模式

| 设计模式 | 应用场景 |
|---------|---------|
| **乐观并发** | 本地先写入，后同步，冲突时以 HLC + CRDT 解决 |
| **队列模式** | 离线操作入队，在线后按序消费 |
| **观察者模式** | 本地变更监听 → 触发同步 |

---

## 11. 开发实施路径

### 阶段一：基础设施搭建 (第 1-2 周)

```
□ Tauri 2.x 项目初始化（Vite + React + TypeScript 模板）
□ shadcn/ui + Tailwind CSS 安装配置
□ Zustand 状态管理骨架
□ Tauri Rust 端 SQLite 初始化与迁移脚本
□ 项目创建/编辑/列表基础 CRUD 完成
□ 应用设置页（AI Provider 配置保存）
```

### 阶段二：知识库核心 (第 3-5 周)

```
□ TipTap 编辑器集成，基础 Markdown 扩展
□ 文章 CRUD（本地 SQLite 存取）
□ 层级目录/文档树组件
□ 图片拖拽/粘贴/上传
□ 代码块语法高亮
□ Word 导出（Go 后端 unioffice 模板渲染）
□ PDF 导出（LibreOffice 无头模式 / go-wkhtmltopdf）
□ 样式映射表调试与完善
```

### 阶段三：头脑风暴区 (第 5-7 周)

```
□ tldraw 集成与自定义主题
□ 白板 CRUD（本地 SQLite 存取）
□ 画布基础工具验证（画笔/文字/矩形/箭头/颜色）
□ 选中文字 → AI 按钮浮层（自定义工具）
□ AI 思维发散接入（LLM 流式输出到画布文本框）
□ AI 图片生成接入（DALL-E → 插入为画布图片）
```

### 阶段四：外部资源链接 (第 7-8 周)

```
□ 外部链接 CRUD
□ 链接类型自动检测
□ 一键打开系统浏览器（tauri-plugin-shell::open）
□ AI Skill 上下文注入
```

### 阶段五：分享与协作 (第 8-10 周)

```
□ 邀请码生成/管理/撤销
□ 密钥验证中间件
□ JWT 签发与验证
□ 分享链接生成与解析
□ 客户端 Client ID 生成与管理
```

### 阶段六：实时协作 (第 10-13 周)

```
□ Go 后端基础框架搭建（Gin + 路由 + WebSocket Hub）
□ PostgreSQL 数据模型 + 迁移
□ Yjs WebSocket Provider 服务端
□ 知识库 CRDT 实时协作
□ 白板 CRDT 实时协作
□ 离线队列与重连机制
□ 操作日志与审计
```

### 阶段七：完善与交付 (第 13-16 周)

```
□ Docker Compose 一键部署编排
□ 自动更新服务（tauri-plugin-updater）
□ 性能优化（大文件加载、虚拟滚动）
□ 错误处理完善（Tauri 崩溃报告、Sentry 集成）
□ E2E 测试（Playwright + Tauri driver）
□ 多平台 CI/CD（Windows/Mac/Linux 构建流水线）
□ 文档编写（API 文档 / 用户指南）
□ 开放源码仓库准备（License / CONTRIBUTING / CODE_OF_CONDUCT）
```

---

## 12. 部署方案

### 12.1 本地部署 (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'

services:
  bindle-server:
    image: bindle/server:latest
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_USER=bindle
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=bindle
      - JWT_SECRET=${JWT_SECRET}
      - FILE_STORAGE_PATH=/data/files
    volumes:
      - bindle_files:/data/files
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=bindle
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=bindle
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U bindle"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  libreoffice:                            # PDF 转换服务
    image: libreoffice/online:latest
    ports:
      - "9980:9980"
    restart: unless-stopped

volumes:
  bindle_files:
  pgdata:
```

### 12.2 桌面应用分发

```
Tauri 构建产物:
  ├── Windows: bindle_0.1.0_x64.msi / .exe (NSIS 安装器)
  ├── macOS:   bindle_0.1.0_x64.dmg / .app
  └── Linux:   bindle_0.1.0_amd64.deb / .AppImage / .rpm

自动更新:
  ├── tauri-plugin-updater
  ├── 更新服务器: 静态文件托管(如 GitHub Releases / S3)
  └── 签名验证: Ed25519 签名确保更新包完整性
```

### 12.3 CI/CD 流水线

```yaml
# .github/workflows/build-app.yml (简化版)
name: Build App

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-22.04, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: app/pnpm-lock.yaml
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies (Linux)
        if: matrix.os == 'ubuntu-22.04'
        run: sudo apt-get install -y libwebkit2gtk-4.1-dev ...
      - name: Build
        run: cd app && pnpm install && pnpm tauri build
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: bindle-${{ matrix.os }}
          path: app/src-tauri/target/release/bundle/
```

---

## 13. 附录：技术选型对比

### 13.1 桌面框架

| 方案 | 包体积 | 启动速度 | 生态 | 结论 |
|------|--------|---------|------|------|
| **Tauri 2.x** | ~5MB | 快 | 成长中 | ✅ 采用 |
| Electron | ~120MB | 慢 | 最成熟 | ❌ 体积大 |
| Flutter Desktop | ~30MB | 中等 | 成熟 | ❌ 非Web技术栈 |
| Wails | ~5MB | 快 | 小 | ⚠️ 备选 |

### 13.2 白板/画布库

| 方案 | 画笔 | 箭头 | 文字 | 协作 | 自定义 | 结论 |
|------|------|------|------|------|--------|------|
| **tldraw** | ✅ | ✅ | ✅ | ✅ Yjs | ✅ 高 | ✅ 采用 |
| Excalidraw | ✅ | ✅ | ✅ | ✅ 自有 | ✅ 中 | ⚠️ 备选 |
| Fabric.js | ❌ | ❌ | ❌ | ❌ | ✅ 高 | ❌ 太底层 |
| Konva.js | ❌ | ❌ | ❌ | ❌ | ✅ 高 | ❌ 太底层 |

### 13.3 Markdown 编辑器

| 方案 | 所见即所得 | 协作 | 扩展性 | 结论 |
|------|-----------|------|--------|------|
| **TipTap** | ✅ | ✅ Yjs | ✅ 极强 | ✅ 采用 |
| Milkdown | ✅ | ✅ Yjs | ✅ 强 | ⚠️ 备选 |
| Monaco | ❌ 纯文本 | ❌ | ❌ 有限 | ❌ 不适合 |
| ByteMD | ❌ 预览分离 | ❌ | ❌ | ❌ 功能少 |

---

> **文档版本**：v1.0  
> **最后更新**：2026-06-07  
> **维护者**：Bindle 开发团队
