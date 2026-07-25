# Bindle 协作服务器设计

> 2026-07-25

## 概述

为 Bindle 添加 Go 后端协作服务器，支持局域网内知识库实时协作编辑。单二进制部署，SQLite 存储，Yjs CRDT 同步，邀请码认证。

---

## 1. 目标与范围

### 一期范围

- 知识库文章 CRDT 实时协作（Yjs + y-websocket 协议）
- 邀请码认证系统（生成、分享、加入、撤销）
- 局域网零配置部署（单二进制运行）
- 前端通过设置面板管理服务器连接

### 不在一期

- 设计画布协作、外部资源同步
- 离线队列、重连断点续传
- Docker 部署、CI/CD

---

## 2. 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 语言 | Go 1.22+ | 单二进制，跨平台 |
| HTTP | Gin | 轻量路由框架 |
| WebSocket | gorilla/websocket | Go 最成熟的 WebSocket 库 |
| 数据库 | modernc.org/sqlite | 纯 Go SQLite，零 CGO，可交叉编译 |
| CRDT | Yjs (前端) + y-websocket 协议 | 客户端冲突解决，服务端广播+持久化 |
| JWT | golang-jwt/jwt | 无状态会话令牌 |

---

## 3. 项目结构

```
server/
├── main.go
├── go.mod
├── go.sum
├── internal/
│   ├── config/config.go
│   ├── handler/
│   │   ├── article_handler.go
│   │   ├── invite_handler.go
│   │   └── ws_handler.go
│   ├── ws/
│   │   ├── hub.go              # 房间管理 + 广播
│   │   ├── client.go           # 单 WebSocket 连接
│   │   └── protocol.go         # Yjs sync step1/2 编解码
│   ├── repository/
│   │   ├── article_repo.go
│   │   └── invite_repo.go
│   ├── model/
│   │   ├── article.go
│   │   └── invite.go
│   └── middleware/
│       └── auth.go             # JWT 验证
└── data/
    └── bindle.db               # 运行时自动创建
```

---

## 4. 数据库表结构

```sql
CREATE TABLE articles (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT DEFAULT '',       -- Markdown 源码
    content_json TEXT DEFAULT '',       -- ProseMirror JSON（Yjs 初始状态）
    parent_id    TEXT DEFAULT NULL,
    sort_order   INTEGER DEFAULT 0,
    version      INTEGER DEFAULT 0,     -- 乐观锁
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT DEFAULT NULL
);

CREATE TABLE invite_codes (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    code         TEXT NOT NULL UNIQUE,  -- BNDL-{16位Base62}
    display_name TEXT NOT NULL,
    role         TEXT DEFAULT 'editor', -- editor | viewer
    created_at   TEXT NOT NULL,
    expires_at   TEXT DEFAULT NULL
);

CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    invite_code_id  TEXT NOT NULL,
    client_id       TEXT NOT NULL UNIQUE,
    token           TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    last_seen       TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE yjs_snapshots (
    doc_id     TEXT PRIMARY KEY,       -- "article:{article_id}"
    state      BLOB NOT NULL,          -- Yjs 编码状态
    updated_at TEXT NOT NULL
);
```

---

## 5. API

### 通用规范

- 编码：JSON (UTF-8)
- 认证：`Authorization: Bearer <jwt>`（WebSocket 通过 query param `?token=<jwt>`）
- 地址：`http://{host}:3000`

### 端点

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| `GET` | `/health` | 健康检查（前端探测服务在线） | 无 |
| `POST` | `/api/v1/projects/:pid/join` | 用邀请码加入，返回 JWT | 无 |
| `GET` | `/api/v1/projects/:pid/articles` | 文章列表 | JWT |
| `POST` | `/api/v1/projects/:pid/articles` | 创建文章 | JWT |
| `PUT` | `/api/v1/projects/:pid/articles/:aid` | 更新文章元信息 | JWT |
| `DELETE` | `/api/v1/projects/:pid/articles/:aid` | 删除文章 | JWT |
| `GET` | `/api/v1/projects/:pid/invites` | 邀请码列表 | JWT (owner) |
| `POST` | `/api/v1/projects/:pid/invites` | 生成邀请码 | JWT (owner) |
| `DELETE` | `/api/v1/projects/:pid/invites/:iid` | 撤销邀请码 | JWT (owner) |
| `WS` | `/ws/:pid?token=<jwt>` | Yjs 协作连接 | JWT |

---

## 6. Yjs WebSocket 协议

### 消息类型

| 类型 | 值 | 方向 | 说明 |
|------|-----|------|------|
| `sync_step1` | 0 | C→S→C | 客户端发送本地状态向量，服务端转发 |
| `sync_step2` | 1 | S→C | 服务端发送差异更新（含 Yjs snapshot） |
| `update` | 2 | C→S→C | 实时编辑增量，广播给房间内其他人 |

### 消息格式

每条消息 = 1 字节类型 + Yjs 编码的二进制 payload（`Y.encodeStateAsUpdate` / `Y.encodeStateVector`）

### 房间管理

- 房间 ID = `project_article:{pid}:{aid}`
- 同一篇文章的所有编辑者在同一个房间
- 服务端对该房间内的消息做广播 + 定期持久化 snapshot

---

## 7. 前端改动

### 新增文件

| 文件 | 说明 |
|------|------|
| `stores/syncStore.ts` | 连接状态、JWT、WS 生命周期管理 |
| `hooks/useCollaboration.ts` | 封装 Yjs + y-websocket provider，暴露 ydoc 给编辑器 |
| `lib/yjs/provider.ts` | y-websocket provider 封装（连接/重连/认证） |
| `components/share/ServerManager.tsx` | 设置面板中的服务器管理 UI |
| `components/share/InviteDialog.tsx` | 邀请码生成/复制/撤销 UI |

### 修改文件

| 文件 | 改动 |
|------|------|
| `SettingsDialog.tsx` | 服务器标签增加地址输入、启动本地服务器按钮、状态灯 |
| `MarkdownEditor.tsx` | 团队模式下启用 TipTap Collaboration 扩展 |
| `KnowledgeBasePage.tsx` | 读 syncStore 判断是否在线模式 |
| `stores/settingsStore.ts` | `server_url` 配置使用 |
| `stores/knowledgeStore.ts` | 在线模式下通过 HTTP API 操作文章 |

### Rust/Tauri 命令

| 命令 | 说明 |
|------|------|
| `start_bindle_server` | spawn Go 二进制子进程 |
| `stop_bindle_server` | 关停子进程 |
| `get_server_status` | 查询进程是否存活 |

---

## 8. 用户操作流程

### 启动服务器

```
设置 → 服务器 → 点击「启动本地服务器」
→ Tauri spawn Go 二进制
→ 前端轮询 /health 确认启动
→ 显示绿灯 + 本机 IP:端口
```

### 邀请协作者

```
项目页面 → 分享按钮 → 生成邀请码
→ 复制 "BNDL-xxxx-xxxx-xxxx"
→ 发给同事
```

### 加入协作

```
同事打开 Bindle → 设置 → 服务器 → 填入主机 IP:3000
→ 打开项目 → 输入邀请码 → 加入
→ 知识库文章列表同步
→ 打开文章 → 实时协作编辑（看到对方光标）
```

## 9. 交叉编译

```bash
# Linux
GOOS=linux GOARCH=amd64 go build -o bindle-server ./server

# Windows
GOOS=windows GOARCH=amd64 go build -o bindle-server.exe ./server
```

纯 Go SQLite 驱动 `modernc.org/sqlite` 无需 CGO，任意平台交叉编译。
