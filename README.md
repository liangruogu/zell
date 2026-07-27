# Zell

> 🚧 **项目正在开发中，功能尚不稳定，请勿用于生产环境。**

> 一个开源免费的、可自托管的、支持实时协作的全方位设计工具。

Zell 覆盖从知识整理、创意脑暴到演示文稿制作的全流程。本地单机即可使用，启动内置服务器即可在局域网内开启团队实时协作。

---

## 核心功能

### 📚 知识库

- **Markdown 所见即所得编辑**：基于 TipTap，支持标题、表格、任务列表、代码高亮
- **文章大纲**：自动生成标题树，可折叠、点击跳转
- **全文搜索**：FTS5 搜索引擎
- **导出 Word/PDF**：一键导出（通过 Pandoc）
- **图片管理**：直接嵌入 Base64

### 🌐 项目共享与发布

- **项目级服务器管理**：每个项目独立配置服务器，支持多项目多服务器
- **开关共享**：一键开启/关闭项目共享，自动生成邀请码
- **审批流程**：加入者填写显示名申请 → 项目 owner 审批通过 → 加入协作
- **成员管理**：在线状态显示，支持踢出成员
- **服务器密钥**：启动时自动生成随机密钥，防止未授权项目注册
- **Wiki 发布**：知识库一键发布为网页，Goldmark 实时渲染 Markdown
- **复制链接**：一键复制 Wiki 访问地址

### 🤖 AI 智能助手

- **LangChain Agent**：6 个内置工具（搜索知识库、搜索外部资源、读取文章等）
- **多 Provider**：兼容任意 OpenAI API 的服务（DeepSeek、Ollama、Groq 等）
- **流式输出**：实时打字机效果
- **项目上下文注入**：自动注入背景信息

### 🎨 设计画布（三种类型）

| 类型 | 状态 | 说明 |
|------|------|------|
| **PPT** | ✅ | 自研 DOM Canvas 幻灯片编辑器。支持发布为网页预览 |
| **Mood** | 🔜 | AI 辅助创作画布，用于图片/视频生成、头脑风暴 |
| **UI** | 🔜 | 原型设计工具 |

### 🔗 外部资源

- **链接管理**：URL 链接 + 本地文件（PDF/Word/PPT/图片）
- **文本提取**：PDF 自动提取文本
- **一键打开**：系统浏览器打开链接

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
| **Wiki 渲染** | Goldmark (Markdown → HTML) |
| **状态管理** | Zustand 5.x |
| **数据库** | SQLite (rusqlite, FTS5) |
| **构建** | Vite 6.x + pnpm |

---

## 部署步骤

### 桌面客户端

```bash
git clone https://github.com/liangruogu/zell.git && cd zell
cd app && pnpm install
pnpm tauri dev
```

### 协作服务器

```bash
cd server
go mod tidy
go build -o zell-server
./zell-server  # 启动后控制台输出服务器密钥
```

### 开启共享

1. 启动服务器 → 复制控制台输出的密钥
2. 打开 Zell 桌面端 → 进入项目 → 项目概览 → 打开「项目服务器」开关
3. 填入服务器地址和密钥 → 点击「连接」
4. 复制邀请码发给团队成员
5. 团队成员：首页「加入项目」→ 填入服务器地址、邀请码、自己的名称

### 发布 Wiki

1. 项目设置 → 发布 tab → 开启网站部署
2. 勾选要发布的文章
3. 复制访问地址，在浏览器中查看

---

## License

MIT
