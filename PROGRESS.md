# Zell 开发进度报告

> 最后更新：2026-07-27

---

## 一、项目概述

Zell 是一个开源免费的、可自托管的全方位设计工具，覆盖知识整理、创意脑暴到演示文稿制作。基于 **Tauri 2.x + React 19 + TypeScript**，Rust 后端 SQLite 本地存储，Go 后端提供局域网协作和 Web 发布能力。

---

## 二、当前已完成功能

### 阶段一：基础设施（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 2.x 项目初始化 | ✅ | Vite 6 + React 19 + TypeScript |
| Tailwind CSS 4 + 主题色 | ✅ | 3 套 Markdown 预设主题 |
| shadcn/ui 风格组件 | ✅ | Button, Input, Textarea, Dialog, Card, Badge |
| Zustand 状态管理 | ✅ | project, knowledge, whiteboard, link, settings, ai, sync, file |
| Rust SQLite 数据库 | ✅ | 7 张表，WAL 模式 + FTS5 |
| 路由系统 | ✅ | React Router v7 |

### 阶段二：知识库（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| TipTap 富文本编辑器 | ✅ | StarterKit + Image + Table + TaskList + Highlight + Link + CodeBlockLowlight |
| 文章 CRUD | ✅ | 6 个 Rust 命令 |
| 文章列表 + 大纲 | ✅ | 双 Tab：文件列表 + 大纲树 |
| 图片粘贴/拖入 | ✅ | Base64 存储 |
| 导出 Word/PDF | ✅ | HTML-based .doc + Pandoc PDF |
| 自定义主题 | ✅ | 3 套预设 + 项目级外观设置 |

### 阶段三：设计画布 — PPT 模块（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 自研 DOM Canvas | ✅ | React + CSS Transform，Zustand Store 驱动 |
| 6 种元素类型 | ✅ | Text, Rect, Ellipse, Arrow, Line, Image |
| Zoom/Pan 无限画布 | ✅ | Ctrl+滚轮，中键拖拽，聚焦复位 |
| 对齐吸附系统 | ✅ | 6px 阈值，动态蓝色参考线 |
| 属性/图层面板 | ✅ | Figma 风格 + 拖拽重排序 |
| 幻灯片管理 | ✅ | 拖拽排序 + FLIP 动画 |
| 成组/解组 | ✅ | Ctrl+G / Ctrl+Shift+G |
| 全屏预览 + 导出 PDF | ✅ | 左右导航 + 进度条 |

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
| 多 Provider 支持 | ✅ | 任意 OpenAI 兼容 API |
| 知识库搜索 | ✅ | FTS5 全文搜索 |
| 项目上下文注入 | ✅ | AI 面板自动注入背景 |

### 阶段六：协作与发布服务器（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| Go 服务端框架 | ✅ | Gin + gorilla/websocket + SQLite (WAL) |
| 服务器密钥认证 | ✅ | 启动时随机生成，保护管理 API |
| 项目共享开关 | ✅ | 每项目独立开关，toggle 控制 |
| 邀请码系统 | ✅ | 自动生成，30 分钟轮换 |
| 审批流程 | ✅ | 加入者填名称 → owner 审批通过/拒绝 |
| 成员管理 | ✅ | 在线状态 + 踢出 |
| Yjs WebSocket | ✅ | 知识库实时协作 |
| 文章同步到服务器 | ✅ | 创建/保存时自动推送 |
| Wiki 发布 | ✅ | Goldmark 渲染，项目标题，公开访问 |
| PPT 网页预览 | ✅ | 生成 HTML 预览页面 |
| 发布配置 | ✅ | 按资源类型勾选，带复制链接 |

### 阶段七：架构优化（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 设置重构 | ✅ | 外观/同步移入项目设置，AI 保留全局浮窗 |
| 移除图标/状态 | ✅ | 简化项目模型 |
| 图片统一 Base64 | ✅ | 移除文件存储模式 |
| AI 框架清理 | ✅ | 删除 Vercel AI SDK 残留代码 |
| 编辑器优化 | ✅ | 移除 block drag 抓手 |

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

### 后端

| 类别 | 技术 |
|------|------|
| 本地数据库 | SQLite (rusqlite, bundled) |
| 协作/发布后端 | Go 1.22+ (Gin + gorilla/websocket) |
| 服务端数据库 | SQLite (modernc.org/sqlite, 纯 Go) |
| 实时同步 | Yjs CRDT + y-websocket 协议 |
| Wiki 渲染 | Goldmark (Markdown → HTML) |

---

## 四、开发路线图

### 待完成
- [ ] 端到端协作测试（两人同时编辑）
- [ ] 协作光标感知
- [ ] 断线重连 + 离线队列
- [ ] Mood 画布实现
- [ ] UI 画布实现
- [ ] PPT AI 内容生成
- [ ] 自动更新
- [ ] CI/CD 多平台构建
- [ ] Docker Compose 部署
