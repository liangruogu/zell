# Zell 开发进度报告

> 最后更新：2026-07-25

---

## 一、项目概述

Zell 是一个基于 **Tauri 2.x + React 19 + TypeScript** 的桌面端项目知识管理工具。Rust 后端使用 SQLite 本地存储，Go 后端提供局域网协作能力。前端通过 TipTap 编辑器、自研 PPT Canvas 等组件提供知识库、设计画布（PPT/Mood/UI）、外部资源链接等功能。

---

## 二、当前已完成功能

### 阶段一：基础设施（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 2.x 项目初始化 | ✅ | Vite 6 + React 19 + TypeScript |
| Tailwind CSS 4 + 主题色 | ✅ | 自定义 `bindle-prose` 样式 + 4 套主题 |
| shadcn/ui 风格组件 | ✅ | Button, Input, Textarea, Dialog, Card, Badge |
| Zustand 状态管理 | ✅ | 10 个 Store：project, knowledge, whiteboard, link, settings, ai, editor, sidebar, sync, file |
| Rust SQLite 数据库 | ✅ | 7 张表，WAL 模式 |
| 路由系统 | ✅ | React Router v7，5 个路由 |

### 阶段二：知识库（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| TipTap 富文本编辑器 | ✅ | StarterKit + Image + Table + TaskList + Highlight + Link + CodeBlockLowlight + Collaboration |
| 分屏模式 | ✅ | 左侧 Markdown 源码编辑，右侧实时 HTML 预览 |
| HTML ↔ Markdown 双向转换 | ✅ | `turndown` + `marked` |
| 文章 CRUD | ✅ | 6 个 Rust 命令 |
| 文章列表 + 大纲 | ✅ | 双 Tab：文件列表 + 大纲树 |
| 图片粘贴/拖入/右键 | ✅ | Base64 + 文件双模式，右键调整尺寸 |
| 导出 Word/PDF | ✅ | HTML-based .doc + Pandoc PDF |
| 快捷键面板 | ✅ | `Ctrl+/` 按页面显示专属快捷键 |
| 自定义主题 | ✅ | 4 套预设主题 + 自定义 CSS 编辑器 |
| 图片并排（WIP） | 🔧 | Shift+点击多选 → 右键并排，持久化待完善 |

### 阶段三：设计画布 — PPT 模块（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 自研 DOM Canvas | ✅ | React + CSS Transform，Zustand Store 驱动 |
| 6 种元素类型 | ✅ | Text, Rect, Ellipse, Arrow, Line, Image |
| Zoom/Pan 无限画布 | ✅ | Ctrl+滚轮，中键拖拽，聚焦复位 |
| 对齐吸附系统 | ✅ | 6px 阈值，动态蓝色参考线 |
| 属性面板 | ✅ | Figma 风格 ColorChip + ScrubInput + 双 Tab |
| 图层管理 | ✅ | 拖拽重排序，双向选中同步 |
| 幻灯片管理 | ✅ | 拖拽排序 + FLIP 动画，复制粘贴，多选 |
| 成组/解组 | ✅ | Ctrl+G / Ctrl+Shift+G |
| 撤销/重做 | ✅ | 100 步 |
| 全屏预览 | ✅ | 左右导航 + 进度条 |
| 导出 PDF | ✅ | Pandoc + 引擎检测 |

### 阶段四：外部资源链接（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 链接 CRUD | ✅ | 4 个 Rust 命令 |
| 文件导入 | ✅ | PDF/Word/PPT/图片/Markdown |
| 文本提取 | ✅ | PDF/TXT/MD → FTS5 |

### 阶段五：AI Agent（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| LangChain Agent | ✅ | 6 个工具，流式输出 |
| 多 Provider | ✅ | 任意 OpenAI 兼容 API |
| 知识库搜索工具 | ✅ | FTS5 全文搜索 |
| 项目上下文注入 | ✅ | 自动注入背景 + 文章列表 |
| 代码高亮 | ✅ | highlight.js 12 种语言 |

### 阶段六：协作服务器（进行中）

| 功能 | 状态 | 说明 |
|------|------|------|
| Go 服务端框架 | ✅ | Gin + gorilla/websocket + SQLite (WAL) |
| 文章 REST API | ✅ | CRUD + 列表 |
| Yjs WebSocket | ✅ | y-websocket 协议，房间广播 |
| 邀请码系统 | ✅ | 一键开关，单项目单码，30 分钟轮换 |
| 加入项目 | ✅ | HomePage 输入邀请码加入 |
| 服务器进程管理 | ✅ | Rust 命令 start/stop/get_status |
| 自动连接检测 | ✅ | 启动时自动 health check |
| 本机 IP 显示 | ✅ | UDP 连接获取局域网 IP |
| MarkdownEditor 协作 | 🔧 | Collaboration 扩展已集成，待端到端测试 |
| 光标感知 | ❌ | 待实现 |

### 阶段七：完善交付（待完成）

| 功能 | 状态 |
|------|------|
| 应用图标 | ✅ |
| 设置模态框 | ✅ |
| 自动更新 | ❌ |
| CI/CD | ❌ |
| Docker Compose | ❌ |
| E2E 测试 | ❌ |

---

## 三、技术架构

### 前端

| 类别 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| UI | React | 19.x |
| 语言 | TypeScript | 5.x |
| 状态管理 | Zustand | 5.x |
| 路由 | React Router | 7.x |
| CSS | Tailwind CSS | 4.x |
| 编辑器 | TipTap | 3.x |
| 协作 | Yjs + y-websocket | 13.x / 3.x |
| PPT 画布 | 自研 DOM Canvas | — |
| 构建 | Vite | 6.x |
| 包管理 | pnpm | 10.x |

### 后端

| 类别 | 技术 |
|------|------|
| 本地数据库 | SQLite (rusqlite, bundled) |
| 协作后端 | Go 1.22+ (Gin + gorilla/websocket) |
| 协作数据库 | SQLite (modernc.org/sqlite, 纯 Go) |
| 实时同步 | Yjs CRDT + y-websocket 协议 |

---

## 四、开发路线图

### 当前 — 协作服务器收尾
- [ ] 端到端协作测试（两人同时编辑同一篇文章）
- [ ] 协作光标感知
- [ ] 断线重连 + 离线队列

### Phase 2 — 知识库增强
- [ ] 图片并排持久化
- [ ] 文章版本历史
- [ ] 模板系统

### Phase 3 — AI 辅助生成
- [ ] PPT AI 单页精细调整
- [ ] PPT AI 全局框架生成
- [ ] Mood 画布实现
- [ ] UI 画布实现

### Phase 4 — 分发与完善
- [ ] 自动更新
- [ ] CI/CD 多平台构建
- [ ] Docker Compose 部署
- [ ] E2E 测试
