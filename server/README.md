# Zell Collaboration Server

单二进制部署的 Go 协作服务器，支持知识库文章 CRDT 实时协作编辑。SQLite 存储，JWT 认证，WebSocket 同步。邀请码直接加入（无需审批）。

## 快速开始

```bash
cd server
go build -o zell-server .

# 启动（默认端口 3000）
./zell-server

# 自定义端口/数据目录
ZELL_PORT=8080 ZELL_DATA_DIR=./mydata ./zell-server
```

首次启动自动在 `data/` 下创建 `zell.db` (SQLite) 和 `.jwt_secret`。

控制台输出本次 **Server Key**（每次启动随机生成，用于客户端首次连接认证）。

---

## 认证体系

| 方式 | 说明 |
|------|------|
| **Server Key** | `X-Server-Key` 头，每次启动随机生成，控制台输出。用于：开启/关闭协作、管理成员 |
| **JWT** | `Authorization: Bearer <token>`，由 JWT Secret 签名（持久存储）。用于：Member API 调用、WebSocket 连接。签发策略：Owner/Member 在加入项目时签发。有效期 365 天 |

---

## API 端点一览

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/health` | 无 | 健康检查 |
| `POST` | `/api/v1/projects/:pid/collab` | Server Key | 开启/关闭协作/删除项目 |
| `POST` | `/api/v1/projects/join` | 无 | 邀请码直接加入 |
| `POST` | `/api/v1/projects/:pid/join` | 无 | 同上（带 project_id 校验） |
| `GET` | `/api/v1/projects/:pid/invite` | Server Key | 获取邀请码（Server Key） |
| `GET` | `/api/v1/projects/:pid/invite-code` | JWT | 获取邀请码（JWT） |
| `POST` | `/api/v1/projects/:pid/invite/rotate` | Server Key | 轮换邀请码 |
| `PUT` | `/api/v1/projects/:pid/info` | Server Key | 更新项目名称/描述 |
| `GET` | `/api/v1/projects/:pid/info` | JWT | 获取项目名称/描述 |
| `GET` | `/api/v1/projects/:pid/members` | Server Key | 成员列表 |
| `DELETE` | `/api/v1/projects/:pid/members/:client_id` | Server Key | 踢出成员 |
| `POST` | `/api/v1/projects/:pid/leave` | JWT | Member 主动退出 |
| `GET` | `/api/v1/projects/:pid/notifications` | JWT | 拉取离线通知 |
| `GET` | `/api/v1/projects/:pid/status` | JWT | 查询项目/成员状态 |
| `GET` | `/api/v1/projects/:pid/articles` | JWT | 文章列表 |
| `POST` | `/api/v1/projects/:pid/articles` | JWT | 创建文章 |
| `PUT` | `/api/v1/projects/:pid/articles/:aid` | JWT | 更新文章 |
| `DELETE` | `/api/v1/projects/:pid/articles/:aid` | Server Key 或 JWT | 删除文章（Owner 或 Member 均可） |
| `WS` | `/ws/:pid/:aid?token=<jwt>` | JWT | Yjs 实时协作连接 |

---

## 端点详细说明

### 健康检查

```
GET /health
→ 200 { "status": "ok" }
```

### 开启/关闭协作

```
POST /api/v1/projects/:pid/collab
X-Server-Key: <key>

请求体：
{
  "enabled": true,            // true=开启, false=关闭
  "owner_token": "client-...", // 客户端唯一标识
  "name": "项目名称",
  "deleted": false            // true=删除项目
}

响应 200：
{
  "collab_enabled": true,
  "invite_code": "BNDL-1a2b-3c4d",
  "token": "eyJ..."            // Owner JWT
}

副作用：
  enabled=false：广播 collab_disabled（不踢出成员），写入 notifications
  deleted=true：软删除项目，踢出所有成员，广播 project_deleted，写入 notifications
```

### 获取邀请码

```
# Server Key 方式（Owner 使用）
GET /api/v1/projects/:pid/invite
X-Server-Key: <key>
→ 200 { "invite_code": "BNDL-1a2b-3c4d", "updated_at": "..." }

# JWT 方式（用于前端自动拉取）
GET /api/v1/projects/:pid/invite-code
Authorization: Bearer <jwt>
→ 200 { "invite_code": "BNDL-1a2b-3c4d", "updated_at": "..." }
```

### 轮换邀请码

```
POST /api/v1/projects/:pid/invite/rotate
X-Server-Key: <key>
→ 200 { "invite_code": "BNDL-5e6f-7g8h" }
```

### 更新项目信息

```
PUT /api/v1/projects/:pid/info
X-Server-Key: <key>

请求体：
{ "name": "新项目名", "description": "新描述" }
→ 200 { "ok": true }

副作用：广播 project_updated 给所有在线成员
```

### 成员列表

```
GET /api/v1/projects/:pid/members
X-Server-Key: <key>

响应 200：
[{
  "client_id": "client-abc",
  "display_name": "张三",
  "online": true,
  "status": "active"
}]
```

### 踢出成员

```
DELETE /api/v1/projects/:pid/members/:client_id
X-Server-Key: <key>
→ 200 { "ok": true }

副作用：软删除（status='removed'），写入 notification，广播 member_removed
```

### 加入项目（直接加入，无需审批）

```
POST /api/v1/projects/:pid/join

请求体：
{
  "code": "BNDL-1a2b-3c4d",
  "client_id": "client-mine",
  "display_name": "赵六"
}

响应 200（新成员）：
{ "status": "approved", "project_id": "...", "project_name": "...", "token": "eyJ...", "display_name": "赵六" }

响应 200（已是成员）：
{ "status": "already_member", "project_id": "...", "display_name": "赵六" }

响应 401：邀请码无效或已过期
响应 409：该显示名称已被占用
```

### 退出项目

```
POST /api/v1/projects/:pid/leave
Authorization: Bearer <jwt>
→ 200 { "ok": true }

副作用：从 members 删除，广播 member_left
```

### 拉取离线通知

```
GET /api/v1/projects/:pid/notifications
Authorization: Bearer <jwt>

响应 200：
{
  "notifications": [{
    "id": "n_xxx",
    "type": "removed",        // "approved"|"rejected"|"removed"|"collab_disabled"|"project_deleted"
    "data": "{}",
    "created_at": "2026-07-31T10:00:00Z",
    "is_read": false
  }]
}

副作用：标记已读、清理 7 天前通知
```

### 查询项目/成员状态

```
GET /api/v1/projects/:pid/status
Authorization: Bearer <jwt>

响应 200 (正常)：{ "project_status": "active", "collab_enabled": true, "member_status": "active" }
响应 403 (被踢)：{ "project_status": "active", "collab_enabled": true, "member_status": "removed" }
响应 403 (协作关闭)：{ "project_status": "active", "collab_enabled": false, "member_status": "removed" }
响应 410 (项目已删)：{ "project_status": "deleted", "collab_enabled": false, "member_status": "removed" }
```

### 文章 API

受 `MemberCheckMiddleware` 保护，验证 JWT + 项目状态 + 成员身份（Owner 通过 owner_token 豁免）。

```
GET    /api/v1/projects/:pid/articles          → 文章列表
POST   /api/v1/projects/:pid/articles          → 创建文章
PUT    /api/v1/projects/:pid/articles/:aid     → 更新文章
DELETE /api/v1/projects/:pid/articles/:aid     → 删除文章（需 Server Key）
Authorization: Bearer <jwt>

创建/更新请求体：
{
  "id": "uuid-or-empty",
  "title": "标题",
  "content": "# Markdown",
  "content_json": "{...}",
  "parent_id": null
}

响应：文章对象
{ "id": "...", "project_id": "...", "title": "...", "content": "...", "content_json": "...", ... }
```

### WebSocket (Yjs 协作)

```
ws://host:3000/ws/:pid/:aid?token=<jwt>&client_id=xxx

协议：y-websocket 兼容

二进制消息（Yjs sync/update）：
  [0] sync_step1  — 客户端发送本地状态向量
  [1] sync_step2  — 服务端发送差异更新
  [2] update      — 实时编辑增量广播

文本消息（UTF-8 JSON，通知频道）：
  ws://host:3000/ws/:pid/__notifications__?token=<jwt>

  事件类型：
  {"type":"article_created","project_id":"...","data":{...}}
  {"type":"article_updated","project_id":"...","data":{...}}
  {"type":"article_deleted","project_id":"...","data":{"id":"..."}}
  {"type":"member_joined","project_id":"...","data":{"client_id":"...","display_name":"..."}}
  {"type":"member_online","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_offline","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_left","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_removed","project_id":"...","data":{"client_id":"..."}}
  {"type":"project_updated","project_id":"...","data":{"name":"...","description":"..."}}
  {"type":"collab_disabled","project_id":"..."}
  {"type":"project_deleted","project_id":"..."}
```

---

## 错误码

| HTTP | code | 说明 |
|------|------|------|
| 400 | - | 请求参数错误 |
| 401 | - | JWT 无效或已过期 |
| 403 | `COLLAB_DISABLED` | 协作已关闭 |
| 403 | `MEMBER_REMOVED` | 你已被移出项目 |
| 403 | - | Server Key 无效 |
| 404 | - | 资源不存在 |
| 409 | - | 名称已被占用 |
| 410 | `PROJECT_DELETED` | 项目已删除 |

---

## 部署

```bash
# 交叉编译
GOOS=linux   GOARCH=amd64 go build -o zell-server ./server
GOOS=windows GOARCH=amd64 go build -o zell-server.exe ./server
GOOS=darwin  GOARCH=amd64 go build -o zell-server ./server
GOOS=darwin  GOARCH=arm64 go build -o zell-server ./server
```

纯 Go SQLite (`modernc.org/sqlite`) 无需 CGO，任意平台交叉编译。

## 项目结构

```
server/
├── main.go
├── go.mod
├── internal/
│   ├── config/config.go            # 配置 (端口/JWT/ServerKey)
│   ├── handler/
│   │   ├── article_handler.go     # 文章 CRUD + 广播
│   │   ├── invite_handler.go      # 加入/退出/成员管理/通知/项目信息
│   │   ├── publish_handler.go     # 发布 API
│   │   └── ws_handler.go          # WebSocket 连接管理
│   ├── ws/
│   │   ├── hub.go                 # 房间管理 + 广播
│   │   └── client.go              # 单连接读写
│   ├── repository/
│   │   ├── db.go                  # 数据库连接 + 迁移
│   │   ├── project_repo.go        # 项目/成员/状态 CRUD
│   │   ├── invite_repo.go         # 邀请码/会话/快照
│   │   ├── notification_repo.go   # 通知 CRUD
│   │   ├── article_repo.go        # 文章 CRUD
│   │   └── publish_repo.go        # 发布 CRUD
│   ├── middleware/
│   │   └── auth.go                # JWT/ServerKey/MemberCheck 中间件
│   └── template/                  # HTML 模板
└── data/                          # 运行时数据 (zell.db, .jwt_secret)
```
