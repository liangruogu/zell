# Bindle

> 将项目的所有资料与上下文打包，呈现在同一个地方。

Bindle 是一个基于 **Tauri 2.x + React 19 + LangChain** 的桌面端项目知识管理工具。支持本地单机使用，未来可通过自托管后端实现团队协作。

---

## 核心功能

### 📚 知识库
- **Markdown 所见即所得编辑**：基于 TipTap，支持标题、表格、任务列表、代码高亮
- **分屏模式**：左侧源码编辑 + 右侧实时预览，拖拽调节宽度
- **图片管理**：支持拖入/粘贴图片，双模式存储（Base64 内嵌 / 文件引用）
- **导出 Word**：一键导出为 .doc 文件
- **文章大纲**：自动生成标题树，可折叠、点击跳转
- **全文搜索**：FTS5 搜索引擎，支持知识库文章搜索

### 🤖 AI 智能助手
- **Agent 工具调用**：6 个内置工具（搜索知识库、搜索外部资源、读取文章、获取项目背景等）
- **多 Provider 支持**：兼容任意 OpenAI API 的服务（DeepSeek、Ollama、Groq 等）
- **流式输出**：实时打字机效果
- **项目上下文注入**：自动将项目背景、文章列表注入 Prompt，减少工具调用
- **代码高亮**：支持 12 种编程语言

### 🎨 创意白板
- **tldraw 画布**：画笔、文字、矩形、箭头等完整工具
- **快照持久化**：自动保存画布状态
- **多白板管理**：创建、重命名、删除

### 🔗 外部资源
- **链接管理**：URL 链接 + 本地文件（PDF/Word/PPT/图片）
- **文本提取**：PDF 自动提取文本内容
- **一键打开**：系统浏览器打开链接
- **AI 可读**：提取的文本供 AI 作为上下文

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **桌面框架** | Tauri 2.x (Rust) |
| **前端** | React 19 + TypeScript + Tailwind CSS 4 |
| **编辑器** | TipTap 3.x (ProseMirror) |
| **白板** | tldraw 5.x |
| **AI 框架** | LangChain (ChatOpenAI + bindTools) |
| **状态管理** | Zustand 5.x |
| **数据库** | SQLite (rusqlite, FTS5) |
| **构建** | Vite 6.x + pnpm |

---

## 已实现功能清单

- [x] 项目创建/编辑/删除，4 种状态标签（萌芽/冲刺/打磨/预警）
- [x] 知识库文章 CRUD，层级大纲导航
- [x] Markdown 所见即所得 + 分屏模式
- [x] 图片拖入/粘贴/右键调整尺寸，Base64 + 文件双模式
- [x] 导出 Word
- [x] AI Agent 对话，流式输出，6 个工具调用
- [x] 多 AI Provider 管理（Base URL + API Key + Model）
- [x] 项目上下文自动注入
- [x] 代码块语法高亮（12 种语言）
- [x] 白板 CRUD + tldraw 快照持久化
- [x] 外部链接管理 + PDF 文本提取
- [x] FTS5 全文搜索（知识库 + 外部资源）
- [x] 设置面板（外观、AI 服务、编辑器偏好、服务器）
- [x] 侧边栏/面板/AI 面板状态持久化
- [x] Emoji 项目图标选择器
- [x] 应用图标（全平台）

---

## 待开发功能

### Phase 2 — 外部资源增强
- [ ] GitHub 仓库同步（读取 README + 文件树）
- [ ] 网页正文抓取（firecrawl 集成）
- [ ] Canva 设计同步
- [ ] DOCX/PPTX 文本提取
- [ ] 文件预览（PDF/图片内置查看器）

### Phase 3 — 协作与同步
- [ ] Go 自托管后端
- [ ] 密钥制邀请系统（无需注册）
- [ ] Yjs CRDT 实时协作编辑
- [ ] 协作光标显示
- [ ] 操作历史与版本回溯

### Phase 4 — AI 能力增强
- [ ] 白板 AI 生图（DALL-E / Stable Diffusion）
- [ ] 选中文本 AI 润色/扩写/缩短
- [ ] 多轮工具调用优化
- [ ] 本地模型支持（Ollama 深度集成）

### Phase 5 — 分发与完善
- [ ] Docker Compose 一键部署
- [ ] 自动更新服务
- [ ] CI/CD 多平台构建
- [ ] E2E 测试
- [ ] 用户文档

---

## 开发

```bash
# 安装依赖
cd app && pnpm install

# 启动开发服务器
pnpm tauri dev

# 构建
pnpm tauri build
```

### 测试

```bash
# AI Agent 测试
npx tsx test/agent-test.ts
```

---

## License

MIT
