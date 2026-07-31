# 知识库协作系统完善设计

> 2026-07-31

## 概述

在现有 Go 协作服务器基础上，完善知识库协作的全生命周期管理：加入/退出/踢出/项目删除的完整流程、通知系统、请求级状态检查、离线恢复、以及前端二次确认交互。

---

## 1. 目标与范围

### 一期范围

- 覆盖知识库协作全部 15 个场景的状态流转
- 请求级状态检查（项目状态、成员身份）
- 离线通知拉取（被踢 / 项目被删 / 协作关闭）
- Member 主动退出项目
- Owner 踢出 Member 时通知对方
- Owner 关闭协作时自动踢出所有 Member
- Member 在线状态实时更新（通过 WebSocket 连接/断开）
- 审批/踢出操作增加二次确认（前端防误操作）
- 完整的 API README 文档

### 不在一期

- PPT 画布协作、外部链接协作
- 协作历史回放、版本对比
- 粒度更细的权限（按文章 ACL）
- 自定义角色

---

## 2. 协作场景全状态流转

### 场景 1：Owner 开启协作

```
状态：collab_disabled → collab_enabled
触发：Owner 在客户端设置面板点击「开启协作」
服务端：生成 invite_code，创建 project 记录，签发 Owner JWT
通知：无
```

### 场景 2：Member 申请加入

```
状态：无 → pending
触发：Member 输入邀请码点击「加入」
服务端：验证 invite_code，将 client_id 加入 pending_members
通知：WebSocket 广播 member_join_requested 给 Owner 所在通知房间
```

### 场景 3：Owner 审批通过

```
状态：pending → member
触发：Owner 在成员管理界面点击「通过」(二次确认)
服务端：从 pending 移除，加入 project_members，签发 Member JWT
通知：WebSocket 广播 member_approved 给该 client_id 所在通知房间（如果在线）
      同时在 notifications 表写入记录（万一离线）
```

### 场景 4：Owner 拒绝申请

```
状态：pending → 无
触发：Owner 在成员管理界面点击「拒绝」(二次确认)
服务端：从 pending_members 删除
通知：WebSocket 广播 member_rejected 给该 client_id 所在通知房间
      同时在 notifications 表写入记录（万一离线）
```

### 场景 5：Member 主动退出

```
状态：member → 无
触发：Member 在客户端点击「退出项目」
服务端：从 project_members 删除，记录 member_left 事件
通知：WebSocket 广播 member_left 给 Owner
      Owner 收到后更新成员列表 UI
```

### 场景 6：Owner 踢出 Member

```
状态：member → removed
触发：Owner 在成员管理界面点击「移出」(二次确认)
服务端：project_members.status 设为 'removed'（软删除，保留记录用于审计）
通知：WebSocket 广播 member_removed 给被踢 Member（如果在线）和 Owner
      同时在 notifications 表写入记录（万一离线）
      被踢 Member 的 JWT 后续请求会被 MemberCheckMiddleware 拒绝（403）
```

### 场景 7：Member 编辑文章 → 实时同步

```
状态：无变化
触发：Member 输入任意文字
服务端：WebSocket Yjs 协议广播给同房间其他客户端
通知：实时 update 消息
```

### 场景 8：文章创建/删除 → 成员感知

```
状态：无变化（文章数变化）
触发：任意成员创建/删除文章（HTTP API）
服务端：操作完成后调用 BroadcastProject(pid, "article_created", article)
通知：WebSocket 含 article_* 事件广播到通知房间
前端：收到后调用 syncFromServer 重新拉取文章列表
```

### 场景 9：Owner 关闭协作

```
状态：collab_enabled → collab_disabled
触发：Owner 在设置面板关闭协作开关（二次确认）
服务端：
  1. 将所有 project_members.status 标记为 'removed'
  2. 清空 invite_code
  3. 广播 collab_disabled 给所有通知房间中的客户端
  4. 为每个 member 写入 notification（offline 时拉取）
通知：所有在线成员收到 collab_disabled → 前端弹窗提示跳转首页
```

### 场景 10：Owner 删除项目

```
状态：active → deleted
触发：Owner 删除项目（客户端通知服务端）
服务端：
  1. projects.status 设为 'deleted'
  2. 所有 project_members.status 标记为 'removed'
  3. 广播 project_deleted 给所有通知房间中的客户端
  4. 为每个 member 写入 notification
通知：所有在线成员收到 project_deleted → 前端弹窗提示跳转首页
```

### 场景 11：Owner 轮换邀请码

```
状态：invite_code 变更
触发：Owner 点击「重新生成邀请码」
服务端：生成新 code，旧 code 立即失效
通知：无（已有成员不受影响）
```

### 场景 12：Member 上线/下线

```
状态：online ↔ offline
触发：Member WebSocket 连接/断开
服务端：
  连接时：SetMemberOnline(pid, client_id, true) + 广播 member_online
  断开时：SetMemberOnline(pid, client_id, false) + 广播 member_offline
通知：Owner 收到 member_online/member_offline → 更新成员列表 UI
```

### 场景 13：多 Member 同时编辑

```
状态：无变化
触发：多人打开同一篇文章
服务端：Yjs WebSocket 协议同步 + 光标位置通过 collaboration-cursor 扩展广播
前端：每个客户端显示其他编辑者的彩色光标
```

### 场景 14：网络断连

```
状态：无变化
触发：WebSocket 意外断开
前端：y-websocket 自动重连（3s 间隔），重连后：
  1. 先拉取离线通知（GET /notifications）
  2. 再同步文章列表（GET /articles）
  3. Yjs 自动 sync step1/step2 恢复文档状态
```

### 场景 15：Owner 查看成员列表

```
状态：无变化
触发：Owner 打开成员管理面板
服务端：GET /members 返回 [{client_id, display_name, online, status}]
前端：展示在线/离线状态，已移除的灰色显示
```

---

## 3. 数据库变更

### 3.1 表结构变更

```sql
-- projects 表增加 status 字段
ALTER TABLE projects ADD COLUMN status TEXT DEFAULT 'active';
-- status: 'active' | 'deleted'
```

```sql
-- project_members 表增加 status 字段
ALTER TABLE project_members ADD COLUMN status TEXT DEFAULT 'active';
-- status: 'active' | 'removed'
```

### 3.2 新增表

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    client_id  TEXT NOT NULL,
    type       TEXT NOT NULL,  -- 'approved'|'rejected'|'removed'|'collab_disabled'|'project_deleted'
    data       TEXT DEFAULT '{}', -- JSON: additional info
    is_read    INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_notifications_client ON notifications(client_id, is_read);
```

```sql
-- 以下为审计日志表（P2 延后实现，一期可不建）
CREATE TABLE IF NOT EXISTS collaboration_events (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type       TEXT NOT NULL,  -- 'member_joined'|'member_left'|'member_removed'|'collab_disabled'|'project_deleted'
    actor_id   TEXT NOT NULL,  -- who triggered (client_id)
    target_id  TEXT DEFAULT '', -- affected client_id
    data       TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX idx_events_project ON collaboration_events(project_id);
```

---

## 4. API 设计

### 4.1 通用规范

- Base URL：`http://{host}:3000`
- 编码：JSON (UTF-8)
- 认证方式：
  - Owner/会员 API：`Authorization: Bearer <jwt>`（HTTP）+ `?token=<jwt>`（WS）
  - 服务管理 API：`X-Server-Key: <key>`（客户端初次连接/开启协作时用）
- 错误响应格式：`{"error": "描述信息"}`

### 4.2 端点一览

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/health` | 无 | 健康检查 |
| `POST` | `/api/v1/projects/:pid/collab` | Server Key | 开启/关闭协作 |
| `POST` | `/api/v1/projects/join` | 无 | 用邀请码加入（申请） |
| `POST` | `/api/v1/projects/:pid/join` | 无 | 同上（带 project_id 校验） |
| `GET` | `/api/v1/projects/:pid/invite` | Server Key | 获取邀请码 |
| `POST` | `/api/v1/projects/:pid/invite/rotate` | Server Key | 轮换邀请码 |
| `GET` | `/api/v1/projects/:pid/members` | Server Key | 成员列表 |
| `DELETE` | `/api/v1/projects/:pid/members/:client_id` | Server Key | 踢出成员 |
| `GET` | `/api/v1/projects/:pid/pending` | Server Key | 待审批列表 |
| `POST` | `/api/v1/projects/:pid/pending/:client_id/approve` | Server Key | 审批通过 |
| `POST` | `/api/v1/projects/:pid/pending/:client_id/reject` | Server Key | 拒绝申请 |
| `POST` | `/api/v1/projects/:pid/leave` | JWT | **新增** — Member 主动退出 |
| `GET` | `/api/v1/projects/:pid/notifications` | JWT | **新增** — 拉取离线通知 |
| `GET` | `/api/v1/projects/:pid/status` | JWT | **新增** — 查询项目/成员状态 |
| `GET` | `/api/v1/projects/:pid/articles` | JWT | 文章列表 |
| `POST` | `/api/v1/projects/:pid/articles` | JWT | 创建文章 |
| `PUT` | `/api/v1/projects/:pid/articles/:aid` | JWT | 更新文章 |
| `DELETE` | `/api/v1/projects/:pid/articles/:aid` | JWT + Server Key | 删除文章 |
| `WS` | `/ws/:pid/:aid?token=<jwt>` | JWT | Yjs 实时协作连接 |

### 4.3 新增端点详细说明

#### 4.3.1 Member 主动退出

```
POST /api/v1/projects/:pid/leave
Authorization: Bearer <jwt>

Response 200:
{
  "ok": true
}

副作用：
  - 从 project_members 删除该 client_id
  - 记录 collaboration_event (type=member_left)
  - 广播 member_left 到项目通知房间
```

#### 4.3.2 拉取离线通知

```
GET /api/v1/projects/:pid/notifications
Authorization: Bearer <jwt>

Response 200:
{
  "notifications": [
    {
      "id": "n_xxx",
      "type": "removed",         // 被踢
      "data": "{}",
      "created_at": "2026-07-31T10:00:00Z",
      "is_read": false
    },
    {
      "id": "n_yyy",
      "type": "collab_disabled", // 协作关闭
      "data": "{}",
      "created_at": "2026-07-31T11:00:00Z",
      "is_read": false
    }
  ]
}

副作用：
  - 拉取后自动标记所有通知为 is_read = 1
  - 每次拉取时清理已读超过 7 天的通知（on-access cleanup，无需 cron）
```

#### 4.3.3 查询项目/成员状态

```
GET /api/v1/projects/:pid/status
Authorization: Bearer <jwt>

Response 200 (正常):
{
  "project_status": "active",
  "collab_enabled": true,
  "member_status": "active"
}

Response 403 (被踢):
{
  "project_status": "active",
  "collab_enabled": true,
  "member_status": "removed"
}

Response 403 (协作关闭):
{
  "project_status": "active",
  "collab_enabled": false,
  "member_status": "removed"
}

Response 410 (项目已删除):
{
  "project_status": "deleted",
  "collab_enabled": false,
  "member_status": "removed"
}
```

### 4.4 修改端点详细说明

#### 4.4.1 关闭协作（踢出所有 Member）

```
POST /api/v1/projects/:pid/collab
X-Server-Key: <key>

Request:
{
  "enabled": false,
  "owner_token": "...",
  "name": "项目名称"
}

副作用（当 enabled=false 时新增）：
  - 将 project_members 中所有成员的 status 标记为 'removed'
  - 为每个 member 写入 notification (type=collab_disabled)
  - 广播 collab_disabled 到项目通知房间
  - 清空 invite_code
```

#### 4.4.2 踢出 Member

```
DELETE /api/v1/projects/:pid/members/:client_id
X-Server-Key: <key>

Response 200:
{
  "ok": true
}

副作用（修改）：
  - project_members.status 设为 'removed'（软删除，之前是硬删除 DELETE）
  - 记录 collaboration_event (type=member_removed)
  - 写入 notification (type=removed) 给被踢成员
  - 广播 member_removed 到项目通知房间（如果被踢成员在线）
```

#### 4.4.3 删除项目

```
POST /api/v1/projects/:pid/collab
X-Server-Key: <key>

Request:
{
  "deleted": true,
  "owner_token": "...",
  "name": "项目名称"
}

副作用（新增 deleted 处理）：
  - projects.status 设为 'deleted'
  - 所有 project_members.status 标记为 'removed'
  - 为每个 member 写入 notification (type=project_deleted)
  - 广播 project_deleted 到项目通知房间
```

---

## 5. 请求级状态检查

### 5.1 MemberCheckMiddleware

在 `AuthMiddleware` 之后新增一层中间件，每个 API 请求验证：

```
AuthMiddleware (JWT 合法性)
    ↓
MemberCheckMiddleware (项目+成员状态)
    ↓
Handler
```

检查逻辑：

```go
func MemberCheckMiddleware(db *repository.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        session := c.MustGet("session").(*Session)
        pid := c.Param("pid")

        // 1. 检查项目状态
        proj, err := db.GetProject(pid)
        if err != nil || proj == nil || proj.Status == "deleted" {
            c.JSON(410, gin.H{"error": "project deleted", "code": "PROJECT_DELETED"})
            c.Abort()
            return
        }

        // 2. 检查协作状态
        if !proj.CollabEnabled {
            c.JSON(403, gin.H{"error": "collaboration disabled", "code": "COLLAB_DISABLED"})
            c.Abort()
            return
        }

        // 3. 检查成员身份
        memberStatus, err := db.GetMemberStatus(pid, session.ClientID)
        if err != nil || memberStatus != "active" {
            c.JSON(403, gin.H{"error": "you have been removed from this project", "code": "MEMBER_REMOVED"})
            c.Abort()
            return
        }

        c.Next()
    }
}
```

### 5.2 WebSocket 连接时状态检查

WS handler 中也增加同样的检查，连接建立前验证项目/成员状态。

```go
func (h *WSHandler) Handle(c *gin.Context) {
    // ...
    // 验证项目状态
    proj, err := h.db.GetProject(pid)
    if err != nil || proj.Status == "deleted" || !proj.CollabEnabled {
        c.JSON(403, gin.H{"error": "project unavailable"})
        return
    }
    // 验证成员状态
    status, err := h.db.GetMemberStatus(pid, clientID)
    if err != nil || status != "active" {
        c.JSON(403, gin.H{"error": "not a member"})
        return
    }
    // ... upgrade connection
}
```

---

## 6. 通知系统

### 6.1 通知类型

| type | 说明 | 触发时机 |
|------|------|----------|
| `approved` | 加入申请已通过 | Owner 审批通过 |
| `rejected` | 加入申请被拒绝 | Owner 拒绝申请 |
| `removed` | 被移出项目 | Owner 踢出 / 协作关闭 |
| `collab_disabled` | 协作已被关闭 | Owner 关闭协作 |
| `project_deleted` | 项目已被删除 | Owner 删除项目 |

### 6.2 通知传递

```
在线：WebSocket 广播即时通知 → 前端直接处理
离线：写入 notifications 表 → 客户端重连时 GET /notifications 拉取
     → 拉取后自动标记已读
     → cron/定时清理 7 天前已读通知
```

### 6.3 前端通知处理流程

```
客户端启动 / 重连
  ↓
GET /api/v1/projects/:pid/notifications
  ↓
  遍历 notifications：
    ├── removed / collab_disabled / project_deleted
    │   → 弹窗提示 → 跳转首页（或显示只读状态）
    ├── rejected
    │   → 弹窗提示「加入申请被拒绝」→ 返回项目概览
    └── approved
        → 静默确认（已在线上或通过轮询感知到）
  ↓
（如未被踢）正常进入协作模式：
    GET /articles → 同步文章列表
    WS 连接 → Yjs 实时编辑
```

---

## 7. 前端改动

### 7.1 文件清单

| 文件 | 改动 |
|------|------|
| `stores/syncStore.ts` | 新增 `notifications` 状态、`pullNotifications()` 方法 |
| `pages/KnowledgeBasePage.tsx` | 通知拉取、退出项目按钮、状态变更弹窗 |
| `components/project/PublishSettings.tsx` | 成员管理增加二次确认、退出按钮 |
| `components/share/InviteDialog.tsx` | 加入等待审批状态 UI |

### 7.2 二次确认 UX

**审批通过**

```
点击 [✓ 通过] → 弹窗 "确定通过 xxx 的加入申请吗？"
  → [取消] [确认通过]
  → 点击确认通过 → API 调用
```

**拒绝申请**

```
点击 [✗ 拒绝] → 弹窗 "确定拒绝 xxx 的加入申请吗？操作不可撤销。"
  → [取消] [确认拒绝]
  → 点击确认拒绝 → API 调用
```

**踢出成员**

```
点击 [移除] → 弹窗 "确定将 xxx 移出项目吗？对方将失去所有编辑权限。"
  → [取消] [确认移除]
  → 点击确认移除 → API 调用
```

**关闭协作**

```
点击 [关闭协作] → 弹窗 "确定关闭协作吗？所有成员将被移出项目。"
  → [取消] [确认关闭]
  → 点击确认关闭 → API 调用
```

**退出项目（Member 侧）**

```
点击 [退出项目] → 弹窗 "确定退出此项目吗？你将失去访问权限。"
  → [取消] [确认退出]
  → 点击确认退出 → POST /leave → 跳转首页
```

---

## 8. API README（Go Server）

### 8.1 部署与启动

```bash
# 构建
cd server && go build -o zell-server .

# 启动（默认端口 3000）
./zell-server

# 自定义端口/数据目录
ZELL_PORT=8080 ZELL_DATA_DIR=./mydata ./zell-server
```

首次启动自动在 `data/` 下创建 `zell.db` (SQLite) 和 `.jwt_secret`。

控制台输出本次 Server Key（用于客户端首次连接认证）。

### 8.2 认证体系

```
┌─────────────────────────────────────────────────────┐
│                   认证方式                           │
├──────────────┬──────────────────────────────────────┤
│ Server Key   │ X-Server-Key 头                     │
│              │ 每次启动随机生成，控制台输出           │
│              │ 用于：开启/关闭协作、管理成员         │
├──────────────┼──────────────────────────────────────┤
│ JWT          │ Authorization: Bearer <token>        │
│              │ 由 JWT Secret 签名（持久存储）       │
│              │ 用于：Member API 调用、WS 连接         │
│              │ 签发策略：                              │
│              │   - Owner: collab_toggle 时生成       │
│              │   - Member: approve_pending 时生成    │
│              │   - 有效期：365 天                    │
└──────────────┴──────────────────────────────────────┘
```

### 8.3 完整 API 参考

#### 健康检查

```
GET /health
→ 200 { "status": "ok" }
```

#### 协作管理（Server Key）

**开启/关闭协作**
```
POST /api/v1/projects/:pid/collab
X-Server-Key: <key>

请求体：
{
  "enabled": true,          // true=开启, false=关闭
  "owner_token": "client-...",  // 客户端唯一标识
  "name": "项目名称",
  "deleted": false          // true=删除项目
}

响应 200：
{
  "collab_enabled": true,
  "invite_code": "BNDL-1a2b-3c4d",
  "token": "eyJ..."          // Owner JWT
}
```

**获取邀请码**
```
GET /api/v1/projects/:pid/invite
X-Server-Key: <key>

响应 200：
{
  "invite_code": "BNDL-1a2b-3c4d",
  "updated_at": "2026-07-31T10:00:00Z"
}
```

**轮换邀请码**
```
POST /api/v1/projects/:pid/invite/rotate
X-Server-Key: <key>

响应 200：
{
  "invite_code": "BNDL-5e6f-7g8h"
}
```

**成员列表**
```
GET /api/v1/projects/:pid/members
X-Server-Key: <key>

响应 200：
[
  {
    "client_id": "client-abc",
    "display_name": "张三",
    "online": true,
    "status": "active"
  },
  {
    "client_id": "client-def",
    "display_name": "李四",
    "online": false,
    "status": "removed"
  }
]
```

**踢出成员**
```
DELETE /api/v1/projects/:pid/members/:client_id
X-Server-Key: <key>

响应 200：
{ "ok": true }
```

**待审批列表**
```
GET /api/v1/projects/:pid/pending
X-Server-Key: <key>

响应 200：
[
  {
    "client_id": "client-xyz",
    "display_name": "王五",
    "created_at": "2026-07-31T09:00:00Z"
  }
]
```

**审批通过**
```
POST /api/v1/projects/:pid/pending/:client_id/approve
X-Server-Key: <key>

响应 200：
{
  "ok": true,
  "token": "eyJ...",          // Member JWT
  "display_name": "王五"
}
```

**拒绝申请**
```
POST /api/v1/projects/:pid/pending/:client_id/reject
X-Server-Key: <key>

响应 200：
{ "ok": true }
```

#### 成员 API（JWT）

**加入项目**
```
POST /api/v1/projects/:pid/join

请求体：
{
  "code": "BNDL-1a2b-3c4d",
  "client_id": "client-mine",
  "display_name": "赵六"
}

响应 200（已是成员，直接返回 token）：
{
  "status": "approved",
  "project_id": "...",
  "project_name": "...",
  "token": "eyJ...",
  "display_name": "赵六"
}

响应 200（新申请，等待审批）：
{
  "status": "pending",
  "project_id": "..."
}
```

**退出项目**
```
POST /api/v1/projects/:pid/leave
Authorization: Bearer <jwt>

响应 200：
{ "ok": true }
```

**拉取离线通知**
```
GET /api/v1/projects/:pid/notifications
Authorization: Bearer <jwt>

响应 200：
{
  "notifications": [
    {
      "id": "n_xxx",
      "type": "removed",
      "data": "{}",
      "created_at": "2026-07-31T10:00:00Z",
      "is_read": false
    }
  ]
}
```

**查询状态**
```
GET /api/v1/projects/:pid/status
Authorization: Bearer <jwt>

响应 200/403/410：
{
  "project_status": "active",     // "active" | "deleted"
  "collab_enabled": true,
  "member_status": "active"       // "active" | "removed"
}
```

#### 文章 API（JWT + 请求级状态检查）

**文章列表**
```
GET /api/v1/projects/:pid/articles
Authorization: Bearer <jwt>

响应 200：
[
  {
    "id": "article-uuid",
    "project_id": "...",
    "title": "文章标题",
    "content": "# Markdown 内容",
    "content_json": "{...}",
    "parent_id": null,
    "sort_order": 0,
    "version": 3,
    "created_at": "...",
    "updated_at": "..."
  }
]

错误：
  403 { "error": "collaboration disabled", "code": "COLLAB_DISABLED" }
  403 { "error": "you have been removed", "code": "MEMBER_REMOVED" }
  410 { "error": "project deleted", "code": "PROJECT_DELETED" }
```

**创建文章**
```
POST /api/v1/projects/:pid/articles
Authorization: Bearer <jwt>

请求体：
{
  "id": "uuid-or-empty",      // 留空自动生成 UUIDv7
  "title": "新文章",
  "content": "# 新文章\n内容...",
  "content_json": "{...}",
  "parent_id": null
}

响应 201：文章对象
```

**更新文章**
```
PUT /api/v1/projects/:pid/articles/:aid
Authorization: Bearer <jwt>

请求体：
{
  "title": "更新后的标题",
  "content": "更新后的 Markdown 内容",
  "content_json": "{...}"
}

响应 200：更新后的文章对象
```

**删除文章**
```
DELETE /api/v1/projects/:pid/articles/:aid
Authorization: Bearer <jwt>
X-Server-Key: <key>             // 同时需要 Server Key（仅 Owner 可删）

响应 200：
{ "ok": true }
```

#### WebSocket（Yjs 协作）

```
ws://host:3000/ws/:pid/:aid?token=<jwt>&client_id=xxx

协议：y-websocket 兼容

消息类型：
  [0] sync_step1  - 客户端发送本地状态向量
  [1] sync_step2  - 服务端发送差异更新
  [2] update      - 实时编辑增量广播

文本消息（UTF-8）：
  {"type":"article_created","project_id":"...","data":{...}}
  {"type":"member_online","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_offline","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_left","project_id":"...","data":{"client_id":"..."}}
  {"type":"member_removed","project_id":"...","data":{"client_id":"..."}}
  {"type":"collab_disabled","project_id":"..."}
  {"type":"project_deleted","project_id":"..."}
```

#### 通知 WebSocket 房间

```
ws://host:3000/ws/:pid/__notifications__?token=<jwt>

专用通知频道（非 Yjs 编辑），用于接收 project-level 事件：
- member_* 事件
- collab_disabled / project_deleted

客户端需额外维护一个通知 WS 连接（轻量级，不涉及 Yjs 同步）。
```

### 8.4 错误码参考

| HTTP | code | 说明 |
|------|------|------|
| 400 | - | 请求参数错误 |
| 401 | - | JWT 无效或已过期 |
| 403 | `COLLAB_DISABLED` | 协作已关闭 |
| 403 | `MEMBER_REMOVED` | 你已被移出项目 |
| 403 | - | Server Key 无效 |
| 404 | - | 资源不存在 |
| 410 | `PROJECT_DELETED` | 项目已删除 |

---

## 9. 前后端数据流

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│   Owner 客户端 │          │   Go Server   │          │ Member 客户端 │
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
       │ ① POST /collab          │                         │
       │ (enabled:true)         │                         │
       │ ──────────────────────→ │                         │
       │ ←─ token + invite_code  │                         │
       │                         │                         │
       │                         │  ② POST /join          │
       │                         │ (invite_code)          │
       │                         │ ←──────────────────── │
       │                         │ → pending              │
       │  ③ WS: join_requested  │                         │
       │ ←────────────────────── │                         │
       │                         │                         │
       │  ④ APP /approve         │                         │
       │ ──────────────────────→ │                         │
       │  二次确认弹窗            │ → member + JWT          │
       │ ←── ok                  │                         │
       │                         │  ⑤ WS: approved (token)│
       │                         │ ──────────────────────→ │
       │                         │                         │
       │                         │  ⑥ GET /articles        │
       │                         │ ←────────────────────   │
       │                         │ → [articles]            │
       │                         │                         │
       │                         │  ⑦ WS /ws/:pid/:aid     │
       │                         │ ←══ Yjs sync ═══→      │
       │                         │                         │
       │                         │  ⑧ POST /leave          │
       │                         │ ←────────────────────   │
       │  ⑨ WS: member_left     │                         │
       │ ←────────────────────── │                         │
       │                         │                         │
       │  ⑩ DELETE /members/:cid │                         │
       │ ──────────────────────→ │                         │
       │  二次确认弹窗            │ → status=removed        │
       │ ←── ok                  │                         │
       │                         │  ⑪ WS: member_removed   │
       │                         │ ──────────────────────→ │
       │                         │  + notification 写入     │
       │                         │                         │
       │  ⑫ POST /collab         │                         │
       │ (enabled:false)        │                         │
       │ ──────────────────────→ │                         │
       │  二次确认弹窗            │ → all members removed    │
       │ ←── ok                  │                         │
       │                         │  ⑬ WS: collab_disabled  │
       │                         │ ═══ to all ════→      │
```

---

## 10. 实现顺序建议

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0 | 数据库表结构迁移 + 新增端点（leave / notifications / status） | 无 |
| P1 | MemberCheckMiddleware + WS 鉴权改造 | P0 |
| P2 | 通知系统完善（广播消息 + 离线通知拉取） | P0 |
| P3 | 前端：二次确认 UX + 退出项目 + 通知处理 | P1, P2 |
| P4 | 在线状态实时更新（WS connect/disconnect → online 字段） | P0 |
| P5 | 联调测试 + API README | P3, P4 |
