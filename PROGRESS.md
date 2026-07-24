# Bindle 开发进度报告

> 最后更新：2026-07-25

---

## 一、项目概述

Bindle 是一个基于 **Tauri 2.x + React 19 + TypeScript** 的桌面端项目知识管理工具。Rust 后端使用 SQLite 本地存储，前端通过 TipTap 编辑器、自研 PPT Canvas 等组件提供知识库、创意白板（PPT/AIGC/UI）、外部资源链接等功能。

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
| 图片粘贴/拖入/右键菜单 | ✅ | Ctrl+V 粘贴、拖入文件自动插入，右键菜单调整尺寸 |
| Ctrl+S 手动保存 | ✅ | 立即保存跳过 800ms 防抖，状态栏绿色 `✓ 已保存` 提示 |
| Ctrl+F 编辑器内搜索 | ✅ | 编辑器内原生搜索；`Ctrl+Shift+F` 搜索文章 |
| Ctrl+Shift+X 创建 TODO | ✅ | 切换任务列表 |
| 导出 Word | ✅ | 生成 HTML-based .doc 文件下载 |

### 阶段三：创意白板 — PPT 模块（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 自研 DOM Canvas | ✅ | 替换 tldraw，React + CSS Transform，Zustand Store 驱动 |
| 6 种元素类型 | ✅ | Text, Rect, Ellipse, Arrow, Line, Image |
| 8+8 缩放手柄 | ✅ | 四角圆形 + 四边条形，缩放时对齐吸附 |
| Zoom/Pan 无限画布 | ✅ | Ctrl+滚轮缩放，中键拖拽平移，聚焦按钮复位 |
| 对齐吸附系统 | ✅ | 边缘/中心吸附，动态蓝色虚线参考线 |
| 属性面板（Figam 风格） | ✅ | 双 Tab（属性+图层），ScrubInput 拖拽调节数值，ColorChip 色块+hex+透明度 |
| 元素属性 | ✅ | 填充色/边框色/边框粗细（可开关）、阴影（多层，弹出面板）、圆角（四角独立） |
| 图层管理 | ✅ | 拖拽重排序，插入条动画，双击重命名，双向选中同步 |
| 幻灯片管理 | ✅ | 缩略图拖拽排序（Pointer Events）+ FLIP 动画，复制粘贴（Ctrl+C/V），多选（Shift/Ctrl+click），重命名，隐藏 |
| 框选/多选 | ✅ | 画布空白区拖拽框选，Shift 追加选择 |
| 成组/解组 | ✅ | Ctrl+G 成组，Ctrl+Shift+G 解组。组内元素只读，整体拖拽/缩放/复制 |
| 多选整体操作 | ✅ | 外围虚线大方框，拖拽同步移动（Shift 轴锁定），Alt 整体复制 |
| 撤销/重做 | ✅ | Ctrl+Z / Ctrl+Shift+Z，100 步，离散操作立即快照+拖拽去重 |
| 全屏预览 | ✅ | 左下角 Play 按钮 → 全屏 API，左右点击导航，ESC 退出，蓝色进度条，自动隐藏光标 |
| 导出 PDF | ✅ | Pandoc + 引擎检测（xelatex→wkhtmltopdf→pdflatex），中文支持 |
| 白板类型选择 | ✅ | Free/PPT/AIGC/UI 四种类型在创建时选择 |

### 阶段四：外部资源链接（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 链接 CRUD | ✅ | 4 个 Rust 命令：create/list/update/delete |
| 文件拖入导入 | ✅ | 支持 PDF/Word/PPT/图片/Markdown，自动文本提取 |
| 文本提取 | ✅ | PDF/TXT/MD 自动提取，索引到 FTS5 |
| 文件描述字段 | ✅ | 用户可添加描述，注入 AI 上下文 |
| 文件重命名 | ✅ | 双击内联编辑 |
| 一键打开浏览器 | ✅ | `opener` crate 跨平台打开文件/链接 |

### 阶段五：AI Agent（已完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| LangChain Agent | ✅ | ChatOpenAI + bindTools，6 个工具 |
| 流式对话 | ✅ | 实时打字机效果 |
| 多 Provider 管理 | ✅ | 任意 OpenAI 兼容 API（DeepSeek/Ollama/Groq 等） |
| 知识库搜索工具 | ✅ | search_knowledge：FTS5 全文搜索文章 |
| 外部资源搜索工具 | ✅ | search_resources：搜索文件/链接提取文本 |
| 文章读取工具 | ✅ | get_article / list_articles |
| 项目上下文注入 | ✅ | 自动注入项目背景 + 文章列表 + 文件描述 |
| 代码高亮 | ✅ | highlight.js 12 种语言 |
| Token 用量可视化 | ✅ | SVG 圆环 + hover tooltip |

### 阶段六：完善交付（部分完成）

| 功能 | 状态 | 说明 |
|------|------|------|
| 应用图标 | ✅ | `logo.png` → `pnpm tauri icon` 生成全平台图标 |
| 设置模态框 | ✅ | 4 个分类：外观、AI 服务、编辑器、服务器 |
| Toast 通知 | ✅ | 保存成功 2 秒自动消失 |
| 自动更新 | ❌ | |
| CI/CD | ❌ | |
| Docker Compose | ❌ | |

---

## 三、PPT 模块技术要点

### 3.1 Canvas 架构

```
app/src/modules/ppt/
├── PptCanvas.tsx         # 主组件，调度 CanvasViewport + PropsPanel + SlideStrip + PptToolbar
├── CanvasViewport.tsx    # Zoom/Pan + 中键拖拽 + 框选 + 参考线渲染 + GroupBoundingBox
├── CanvasElement.tsx     # 6 种元素渲染 + useDrag Hook（单拖/分组拖/Shift轴锁定/Alt复制）
├── ElementHandles.tsx    # 8 个缩放手柄 + Zoom自适应尺寸 + 对齐吸附
├── PropsPanel.tsx        # Figma风格属性面板：ColorChip/ScrubInput/LayersTab/ShadowSection/CornerSection
├── PptToolbar.tsx        # 浮动工具栏（添加元素按钮）
├── SlideStrip.tsx        # 幻灯片缩略图 + 拖拽排序(FLIP动画) + 插入按钮 + Delete键删除
├── SlidePreview.tsx      # 全屏预览模式 + 左右导航 + 进度条
├── store.ts              # Zustand PptStore（slides/elements CRUD/undo-redo/group/snap）
└── types.ts              # Slide, CanvasElement, PptData 类型定义
```

### 3.2 数据模型

```typescript
interface CanvasElement {
  id: string; name?: string; type: ElementType;  // text/rect/ellipse/line/arrow/image/group
  x: number; y: number; w: number; h: number; opacity: number;
  props: { fill, stroke, strokeWidth, borderRadius, shadows[], ... };
  groupChildren?: CanvasElement[];  // 编组子元素（相对坐标）
}
interface Slide { id, name, elements[], background, backgroundOpacity, hidden? }
```

### 3.3 快捷键（PPT 专用）

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销/重做 |
| `Ctrl+C` / `Ctrl+V` | 复制/粘贴幻灯片 |
| `Ctrl+G` / `Ctrl+Shift+G` | 成组/解组 |
| `Ctrl+滚轮` | 缩放画布 |
| `Delete/Backspace` | 删除选中元素或幻灯片 |
| `Shift+拖动` | 轴锁定移动 |
| `Alt+拖动` | 复制元素 |
| `Shift+Alt+拖动` | 轴锁定复制 |
| `Shift+点击` | 范围多选（幻灯片） |
| `Ctrl+点击` | 追加选中 |
| `Ctrl+Shift+L` | 侧边栏切换 |

---

## 四、技术架构

### 4.1 前端

| 类别 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | 2.x |
| UI | React | 19.x |
| 语言 | TypeScript | 5.x |
| 状态管理 | Zustand | 5.x |
| 路由 | React Router | 7.x |
| CSS | Tailwind CSS | 4.x |
| 编辑器 | TipTap | 3.x |
| PPT 画布 | 自研 DOM Canvas | — |
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
| 导出 | Pandoc（PDF）+ Word（HTML-based） |
| 插件 | tauri-plugin-shell, tauri-plugin-fs, tauri-plugin-dialog, tauri-plugin-log |

### 4.3 数据库表结构

| 表名 | 说明 |
|------|------|
| `projects` | 项目（含 settings JSON） |
| `knowledge_articles` | 知识库文章 |
| `external_links` | 外部资源链接 |
| `whiteboards` | 白板（含 wb_type: free/ppt/aigc/ui + snapshot JSON） |
| `ai_conversations` | AI 对话记录 |
| `invite_codes` | 分享邀请码 |
| `settings` | 全局键值设置 |

---

## 五、开发路线图

### 当前 — PPT 模块完善中

- [ ] **图片工具**：抠图模型部署、裁切、蒙版笔刷羽化边缘
- [ ] **箭头工具**：曲线箭头、折线箭头（拐弯处圆角）
- [ ] **文字工具**：字体选择、行高、对齐等高级属性
- [ ] **新图形**：三角形、梯形等
- [ ] **导出 PPT**：PPTX 格式导出

### Phase 2 — AI 辅助生成

- [ ] PPT AI 单页精细调整模式（自然语言驱动元素修改）
- [ ] PPT AI 全局框架生成模式（一键生成幻灯片结构）
- [ ] AI 工具接入知识库（搜索文章/外部资源）
- [ ] AIGC 白板（生图/生视频工作台 + 提示词模板）
- [ ] UI 白板（原型设计 + 动效演示）

### Phase 3 — 实时协作

- [ ] Go 后端服务（REST API + WebSocket + 文档转换）
- [ ] Yjs CRDT 实时协作引擎（知识库 + PPT + 白板）
- [ ] 协作光标感知（看到伙伴的鼠标位置和操作）
- [ ] 密钥制邀请系统（分享链接加入项目）
- [ ] 离线队列与重连

### Phase 4 — 分发与完善

- [ ] Docker Compose 一键部署
- [ ] 自动更新服务
- [ ] CI/CD 多平台构建
- [ ] E2E 测试

---

## 六、项目文件结构

```
bindle/
├── ARCHITECTURE.md
├── README.md
├── PROGRESS.md
├── logo.png
│
├── app/                           # Tauri 前端应用
│   ├── src/
│   │   ├── components/            # ui/, layout/, editor/, project/, share/
│   │   ├── pages/                 # Home, Project, KnowledgeBase, Whiteboard, ExternalLinks, Settings
│   │   ├── modules/ppt/           # PPT 自研 Canvas 模块（10 个文件）
│   │   ├── stores/                # 9 Zustand stores
│   │   ├── services/              # db, api, aiService, exportService, fileService
│   │   └── lib/                   # utils, constants, markdown
│   └── src-tauri/                 # Rust 后端（SQLite + Commands）
│
├── server/                        # Go 后端（规划中）
└── docs/superpowers/              # 设计文档和实现计划
```
