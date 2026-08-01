# Zell

> 开源设计协作平台 — 文档、画布、演示，自托管，实时协同。

Zell 将文档编辑、设计画布和演示文稿整合在同一个工作空间中。所有数据本地存储，启动内置服务器即可在团队内实时协作。正在陆续开发 PPT 编辑器、Mood 创意画布和 UI 设计模块。

---

## 功能

### 文档协作
所见即所得的 Markdown 编辑器，支持表格、任务列表、代码块、数学公式。全文搜索，一键导出 PDF/DOCX/HTML。自托管服务器 + 邀请码，团队成员可实时协同编辑同一篇文档。

### Wiki 发布
选中文档一键发布为网页，适合用作团队知识库或个人博客。

### 外部资源
管理链接和本地文件（PDF、Word、图片），自动提取 PDF 文本。

### AI 助手
接入 OpenAI 兼容 API（DeepSeek、Ollama 等），AI 可搜索你的知识库、读取文档内容、辅助写作。

### 设计画布（开发中）
- **PPT** — 自研幻灯片编辑器，可发布为网页预览
- **Mood** — AI 创意画布，用于头脑风暴和视觉探索
- **UI** — 原型设计工具

---

## 安装

从 [Releases](https://github.com/liangruogu/zell/releases) 下载对应平台的安装包：**Windows** `.msi`、**Linux** `.deb` / `.AppImage`。

---

## 自托管协作服务器

```bash
cd server && go mod tidy && go build -o zell-server
./zell-server   # 控制台输出服务器密钥
```

在桌面端 → 项目概览 → 填入地址和密钥 → 连接 → 复制邀请码分享给团队。

---

## 从源码构建

```bash
git clone https://github.com/liangruogu/zell.git
cd zell/app && pnpm install && pnpm tauri dev
```

---

## 技术栈

Tauri 2.x / React 19 / TypeScript / Tailwind CSS / TipTap (ProseMirror) / Yjs + y-websocket / Go + Gin / SQLite

## License

MIT
