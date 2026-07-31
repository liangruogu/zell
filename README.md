# Zell

> 🚧 **项目正在开发中，功能尚不稳定，请勿用于生产环境。**

> 一个开源免费的、可自托管的、支持实时协作的全方位设计工具。

Zell 覆盖从知识整理、创意脑暴到演示文稿制作的全流程。本地单机即可使用，启动内置服务器即可在局域网内开启团队实时协作。

---

## 核心功能

### 📚 知识库

- **Markdown 所见即所得编辑**：基于 TipTap，支持标题、表格、任务列表、代码高亮
- **分屏模式**：左侧源码编辑 + 右侧实时预览，拖拽调节宽度
- **图片管理**：支持拖入/粘贴图片，双模式存储（Base64 内嵌 / 文件引用）
- **导出 Word/PDF**：一键导出
- **文章大纲**：自动生成标题树，可折叠、点击跳转
- **全文搜索**：FTS5 搜索引擎
- **快捷键面板**：`Ctrl+/` 查看所有快捷键
- **自定义主题**：4 套 Markdown 预设主题 + 自定义 CSS

### 🤖 AI 智能助手
- **Agent 工具调用**：6 个内置工具（搜索知识库、搜索外部资源、读取文章、获取项目背景等）
- **多 Provider 支持**：兼容任意 OpenAI API 的服务（DeepSeek、Ollama、Groq 等）
- **流式输出**：实时打字机效果
- **项目上下文注入**：自动注入背景信息

### 🎨 设计画布（三种类型）

| 类型 | 状态 | 说明 |
|------|------|------|
| **PPT** | ✅ | 自研 DOM Canvas 幻灯片编辑器。矩形/圆形/箭头/文本/图片，Zoom/Pan 无限画布，对齐吸附，多选/成组/框选，图层面板，属性面板，全屏预览。导出 PDF。 |
| **Mood** | 🔜 | AI 辅助创作画布，用于图片/视频生成、头脑风暴（品牌设计、产品设计） |
| **UI** | 🔜 | 原型设计工具 |

### 🔗 外部资源

- **链接管理**：URL 链接 + 本地文件（PDF/Word/PPT/图片）
- **文本提取**：PDF 自动提取文本
- **一键打开**：系统浏览器打开链接

### 🌐 团队协作

- **Go 协作服务器**：单二进制，SQLite，局域网零配置
- **Yjs CRDT 实时编辑**：知识库文章多人同时编辑，光标同步显示
- **邀请码系统**：一键开启协作，自动生成邀请码，直接加入无需审批
- **成员管理**：Owner 可踢出成员，成员可自行退出
- **实时通知**：WebSocket 推送项目更新、成员变动、文章变更
- **自动同步**：离线成员重连后自动拉取最新数据

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **桌面框架** | Tauri 2.x (Rust) |
| **前端** | React 19 + TypeScript + Tailwind CSS 4 |
| **编辑器** | TipTap 3.x (ProseMirror) |
| **PPT 画布** | 自研 DOM Canvas（Zustand + CSS Transform） |
| **AI 框架** | LangChain (ChatOpenAI + bindTools) |
| **协作引擎** | Yjs + y-websocket |
| **协作后端** | Go + Gin + gorilla/websocket + modernc.org/sqlite |
| **状态管理** | Zustand 5.x |
| **数据库** | SQLite (rusqlite, FTS5) |
| **构建** | Vite 6.x + pnpm |

---

## 部署步骤

### 桌面客户端

```bash
# 1. 克隆项目
git clone https://github.com/liangruogu/zell.git
cd zell

# 2. 安装前端依赖
cd app && pnpm install

# 3. 启动开发模式
pnpm tauri dev

# 4. 构建发布版本
pnpm tauri build
```

### 协作服务器

```bash
# 1. 进入 server 目录
cd server

# 2. 下载依赖
go mod tidy

# 3. 启动（开发模式，支持热重载）
go install github.com/air-verse/air@latest
air

# 4. 或直接编译运行
go build -o zell-server.exe  # Windows
go build -o zell-server       # Linux/Mac
./zell-server

# 5. 交叉编译 Linux 版本（在 Windows 上）
GOOS=linux GOARCH=amd64 go build -o zell-server
```

### 启动协作

1. 启动服务器（`./zell-server`，默认监听 `0.0.0.0:3000`）
2. 打开 Zell 桌面客户端 → 设置 → 服务器 → 填入 `http://localhost:3000` → 连接
3. 进入项目 → 项目概览 → 点击「开启团队协作」→ 复制邀请码
4. 其他人在项目列表页点击「加入项目」→ 输入邀请码 → 自动同步

---

## License

MIT
