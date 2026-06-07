# Bindle 开发进度报告

> 最后更新：2026-06-08

---

## 一、项目概述

Bindle 是一个基于 **Tauri 2.x + React 19 + TypeScript** 的桌面端项目知识管理工具。Rust 后端使用 SQLite 本地存储，前端通过 TipTap 编辑器、tldraw 白板等组件提供知识库、头脑风暴、外部资源链接等功能。

---

## 二、当前已完成功能

### 阶段一：基础设施（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 2.x 项目初始化 | ✅ | Vite 6 + React 19 + TypeScript |
| Tailwind CSS 4 + 主题色 | ✅ | `@tailwindcss/typography` 插件，自定义 `bindle-prose` 样式 |
| shadcn/ui 风格组件 | ✅ | Button, Input, Textarea, Dialog, Card, Badge 6 个基础组件 |
| Zustand 状态管理 | ✅ | 9 个 Store：project, knowledge, whiteboard, link, settings, ai, editor, sidebar, sync |
| Rust SQLite 数据库 | ✅ | 7 张表，WAL 模式 + `synchronous=NORMAL` |
| 路由系统 | ✅ | React Router v6，5 个路由 |

### 阶段二：知识库（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| TipTap 富文本编辑器 | ✅ | StarterKit + Image + Table + TaskList + Highlight + Link + CodeBlockLowlight |
| 分屏模式 | ✅ | 左侧 Markdown 源码编辑，右侧实时 HTML 预览，拖拽调节宽度 |
| HTML ↔ Markdown 双向转换 | ✅ | `turndown` (HTML→MD) + `marked` (MD→HTML)，保留图片尺寸 |
| 文章 CRUD | ✅ | 6 个 Rust 命令：create/get/list/update/delete/reorder |
| 文章列表 + 大纲 | ✅ | 双 Tab：文件列表（hover 导出/删除）+ 大纲树（可折叠，点击跳转） |
| 图片粘贴/拖入/右键菜单 | ✅ | Ctrl+V 粘贴、拖入文件自动插入，右键菜单调整尺寸（滑块 50-800px + 预设） |
| Ctrl+S 手动保存 | ✅ | 立即保存跳过 800ms 防抖，状态栏绿色 `✓ 已保存` 提示 |
| Ctrl+F 编辑器内搜索 | ✅ | 编辑器内原生搜索；`Ctrl+Shift+F` 搜索文章 |
| Ctrl+Shift+X 创建 TODO | ✅ | 切换任务列表 |
| 导出 Word | ✅ | 生成 HTML-based .doc 文件下载 |

### 阶段三：头脑风暴区（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| tldraw 白板 | ✅ | 完整画笔/文字/矩形/箭头等工具 |
| 白板 CRUD | ✅ | 6 个 Rust 命令：create/get/list/save_snapshot/rename/delete |
| 快照持久化 | ✅ | tldraw snapshot prop 自动加载/保存 JSON |
| 白板列表 | ✅ | 左侧面板，hover 删除，底部内联新建 |

### 阶段四：外部资源链接（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 链接 CRUD | ✅ | 4 个 Rust 命令：create/list/update/delete |
| 链接类型自动检测 | ✅ | 输入 URL 自动识别 GitHub/Figma/Canva/Notion |
| 一键打开浏览器 | ✅ | `@tauri-apps/plugin-shell::open()` 调用系统浏览器 |
| AI Skill 字段 | ✅ | 附注说明，供 AI 上下文注入 |
| 链接表单 | ✅ | 右侧编辑面板，标题/URL/类型/描述/AI Skill |

### 阶段五：分享协作（未开始）

| 功能 | 状态 |
|------|------|
| 邀请码生成/管理 | ❌ |
| 密钥验证中间件 | ❌ |
| JWT 签发与验证 | ❌ |
| Go 后端服务 | ❌ |
| WebSocket 实时协作 | ❌ |

### 阶段六：完善交付（部分完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 应用图标 | ✅ | `logo.png` → `pnpm tauri icon` 生成全平台图标 |
| 设置模态框 | ✅ | 4 个分类：外观（字号+工具栏开关）、AI 服务、编辑器、服务器 |
| Toast 通知 | ✅ | 保存成功 2 秒自动消失 |
| 自动更新 | ❌ | |
| CI/CD | ❌ | |
| Docker Compose | ❌ | |

---

## 三、特色功能详情

### 3.1 侧边栏

- 默认收起（`collapsed: true`）
- `w-56` ↔ `w-14` 切换，仅图标模式
- 手动点击 toggle 切换，不会自动展开/收起
- 移除品牌文字 "Bindle"
- 底部：新建项目 + 设置按钮

### 3.2 知识库面板

- **文件 Tab**：文章列表，hover 显示导出/删除
- **大纲 Tab**：当前文章标题树，可折叠，点击跳转
- **新建文章**：内联输入框，Enter 确认 / Esc 取消
- **搜索**：`Ctrl+Shift+F` 弹出搜索框
- **导入**：拖拽 `.md` 文件到列表区域自动导入，重名自动追加 `(1)` 后缀
- **侧边栏**：`Ctrl+Shift+L` 切换，可拖拽调节宽度（120-400px），<80px 自动吸附收起

### 3.3 Markdown 编辑器

- **所见即所得模式**：TipTap 富文本，工具栏 17 个按钮
- **分屏模式**：左侧源码编辑，右侧实时预览，中间可拖拽调节宽度（20%-80%）
- **底部状态栏**：字符数 + 代码语言名（Typora 风格）+ 更新于时间 / 保存提示
- **点击状态栏文字**切换视图模式
- **Tab 键**插入制表符，不跳出编辑器

### 3.4 图片处理

- **粘贴**：`Ctrl+V` 粘贴剪贴板图片 → base64 插入
- **拖入**：从文件管理器拖入图片 → base64 插入
- **右键菜单**：滑块调节宽度（50-800px）+ 预设（小/中/大/原始）+ 复制图片/链接
- **持久化**：`[alt](url =400x)` 自定义语法双向保留图片尺寸

### 3.5 项目状态

4 种状态标签，存储在 `settings` JSON 的 `status` 字段：

| 状态 | 标签 | 颜色 | 含义 |
|------|------|------|------|
| `seedling` | 萌芽 | 绿色 | 项目起步，初步发展 |
| `sprint` | 冲刺 | 蓝色 | 快速推进 |
| `polish` | 打磨 | 紫色 | 临近结束，细微修改 |
| `alert` | 预警 | 琥珀色 | 推进过慢，需加速 |

### 3.6 Emoji 选择器

4 个分类（常用/趣味/自然/物件），共 64 个 emoji，Tab 切换。

---

## 四、技术架构

### 4.1 前端

| 类别 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| UI | React | 19.x |
| 语言 | TypeScript | 6.0 |
| 状态管理 | Zustand | 5.x |
| 路由 | React Router | 7.x |
| CSS | Tailwind CSS | 4.x |
| 组件 | shadcn/ui 风格手写 | - |
| 编辑器 | TipTap | 3.x |
| 白板 | tldraw | 5.x |
| Markdown 转换 | turndown + marked | 7.x / 18.x |
| 代码高亮 | lowlight + highlight.js | 3.x / 11.x |
| 构建 | Vite | 6.x |
| 包管理 | pnpm | 10.x |

### 4.2 Rust 后端

| 类别 | 技术 |
|------|------|
| 数据库 | SQLite (rusqlite, bundled) |
| ORM | 无（直接 SQL） |
| UUID | uuid v7（时间排序） |
| 时间 | chrono |
| 加密 | aes-gcm + ring（骨架） |
| 插件 | tauri-plugin-shell, tauri-plugin-fs, tauri-plugin-dialog, tauri-plugin-log |

### 4.3 数据库表结构

| 表名 | 说明 |
|------|------|
| `projects` | 项目（含 settings JSON） |
| `knowledge_articles` | 知识库文章 |
| `external_links` | 外部资源链接 |
| `whiteboards` | 白板快照 |
| `ai_conversations` | AI 对话记录 |
| `invite_codes` | 分享邀请码 |
| `settings` | 全局键值设置 |

### 4.4 Tauri 命令清单（23 个）

**项目管理（7 个）**：`create_project`, `get_projects`, `get_project`, `update_project`, `delete_project`, `get_setting`, `set_setting`

**知识库（6 个）**：`create_knowledge_article`, `get_knowledge_articles`, `get_knowledge_article`, `update_knowledge_article`, `delete_knowledge_article`, `reorder_knowledge_articles`

**白板（6 个）**：`create_whiteboard`, `get_whiteboards`, `get_whiteboard`, `save_whiteboard_snapshot`, `rename_whiteboard`, `delete_whiteboard`

**外部链接（4 个）**：`create_external_link`, `get_external_links`, `update_external_link`, `delete_external_link`

---

## 五、快捷键汇总

| 快捷键 | 位置 | 功能 |
|--------|------|------|
| `Ctrl+S` | 编辑器 | 手动保存当前文章 |
| `Ctrl+F` | 编辑器内 | 浏览器原生搜索文章内容 |
| `Ctrl+F` | 编辑器外 | 打开文章搜索框 |
| `Ctrl+Shift+F` | 任意 | 打开文章搜索框 |
| `Ctrl+Shift+X` | 编辑器 | 创建/切换 TODO |
| `Ctrl+Shift+L` | 知识库/白板/链接 | 切换左侧面板 |
| `Tab` | 编辑器 | 插入制表符 |
| `Esc` | 搜索框 | 关闭搜索 |

---

## 六、项目文件结构

```
bindle/
├── ARCHITECTURE.md
├── README.md
├── PROGRESS.md                    # 本文档
├── logo.png                       # 应用图标源文件
│
├── app/                           # Tauri 前端应用
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── index.css
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                # Button, Input, Textarea, Dialog, Card, Badge
│   │   │   ├── layout/           # AppShell, Sidebar, Header, ResizablePanel
│   │   │   ├── editor/           # MarkdownEditor, EditorToolbar, FloatingImageMenu
│   │   │   ├── project/          # ProjectCard, CreateProjectDialog, ProjectForm, EmojiPicker
│   │   │   └── share/            # SettingsDialog
│   │   │
│   │   ├── pages/                 # Home, Project, KnowledgeBase, Whiteboard, ExternalLinks, Settings
│   │   ├── stores/                # 9 Zustand stores
│   │   ├── types/                 # TypeScript 类型定义
│   │   └── lib/                   # utils, constants, format, markdown
│   │
│   └── src-tauri/                 # Rust 后端
│       ├── Cargo.toml
│       ├── tauri.conf.json
│       └── src/
│           ├── main.rs
│           ├── lib.rs
│           ├── db/                # mod, models, migrations
│           ├── commands/          # project, knowledge, whiteboard, link
│           └── crypto/            # vault (placeholder)
```

---

## 七、待办事项

### 高优先级

- [ ] **Go 后端サービス**：REST API + WebSocket + 文档转换
- [ ] **分享协作**：邀请码生成/管理 + 密钥验证
- [ ] **AI 聊天面板 UI**：前端聊天界面（store 已有骨架）
- [ ] **Word/PDF 导出服务端实现**：目前 Word 导出是 HTML-based，需 Go 后端 unioffice
- [ ] **数据同步引擎**：Yjs CRDT + 离线队列

### 中优先级

- [ ] **白板自动保存**：定期保存 tldraw snapshot 到 SQLite
- [ ] **图片上传到本地文件系统**：当前图片以 base64 存储在 Markdown 中
- [ ] **提示词模板管理**：AI 上下文自动注入
- [ ] **性能优化**：代码分割（当前 JS 3.5MB），按路由懒加载 tldraw

### 低优先级

- [ ] **Docker Compose 部署**：PostgreSQL + Redis + Nginx/Caddy
- [ ] **CI/CD 流水线**：GitHub Actions 多平台构建
- [ ] **自动更新**：tauri-plugin-updater
- [ ] **E2E 测试**：Playwright + Tauri driver
