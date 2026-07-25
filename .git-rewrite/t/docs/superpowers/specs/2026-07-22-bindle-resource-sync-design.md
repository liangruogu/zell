# Bindle 资源同步与架构优化设计

> 日期：2026-07-22
> 状态：部分完成，Phase 4 进行中

---

## 1. 设计目标

解决当前 Bindle 项目中资源链接的同步痛点，修复已知 Bug，并为后续的自托管协作和 AI 辅助功能奠定架构基础。

### 核心问题

1. **资源重复导入**：用户更新 PPT/PDF/Word 后需要反复拖入导入
2. **外部服务链接**：GitHub/Canva 等第三方平台的内容无法自动同步
3. **图片存储 Bug**：`bindle-img:` URI 解析在包含 width title 属性时失败
4. **白板加载错误**：tldraw store 初始化可能缺少必要配置

---

## 2. 资源同步架构

### 2.1 总体策略：差异化同步 + 轻量级 ResourceProvider

每种资源使用最适合的同步方式，不强制统一。在 Rust 端定义一个轻量级 `ResourceProvider` trait 作为代码组织框架，而非重型调度引擎。

### 2.2 ResourceProvider trait（Rust）

```rust
/// 资源同步结果的统一表示
struct ResourceSnapshot {
    title: String,          // 展示名称
    preview_url: String,    // 预览用（图片/HTML data URL 等）
    text_content: String,   // AI 上下文提取文本
    metadata: JSON,         // 类型特定元数据
    link_url: String,       // 一键跳转的原始链接
}

/// 每种外部资源实现此 trait
trait ResourceProvider {
    /// 资源类型标识
    fn resource_type() -> &'static str;
    
    /// 同步/刷新资源：拉取最新内容，返回快照
    fn sync(&self, link: &ExternalLink) -> Result<ResourceSnapshot>;
    
    /// 是否支持自动同步（文件监控、Webhook 等）
    fn supports_auto_sync() -> bool { false }
    
    /// 启动自动同步
    fn start_auto_sync(&self, link: &ExternalLink, on_update: Box<dyn Fn(ResourceSnapshot)>) { }
}
```

### 2.3 各 Provider 实现方案

| Provider | `sync()` 行为 | auto_sync | 备注 |
|----------|--------------|-----------|------|
| **LocalFileProvider** | 读取文件 → 提取文本 → 生成 preview | ✅ `notify` crate 监听文件变更 | 每项目指定一个根文件夹 |
| **GitHubProvider** | L1: GitHub API 拉 README + 文件树<br>L2: `git clone --depth=1` 全量代码 | ❌ 定时轮询（可配置间隔，默认 30 分钟） | L2 由用户手动触发 |
| **CanvaProvider** | Connect REST API：拉设计元数据 + 导出预览图 | ✅ Webhook 被动通知变更 | 用户跳转 Canva 编辑器编辑，Bindle 存链接 + 同步内容 |
| **WebPageProvider** | HTTP fetch / firecrawl 提取正文 | ❌ 仅手动触发或在对话中 @ 时实时抓取 | 轻量，不缓存 |
| **ImageProvider** | 修复 `bindle-img:` 协议解析 Bug | ❌ 按需解析 | 保持现有 base64/file 双模式 |

### 2.4 资源类型与存储映射

| 资源类型 | 存储位置 | 同步触发方式 |
|---------|---------|------------|
| 本地文件 (PPT/PDF/DOCX/图片) | `external_links` 表 + `link_type='file'`, 原始路径存 URL 字段 | 文件夹监控自动触发 |
| GitHub 仓库 | `external_links` 表 + `link_type='github'` | 定时轮询 + 手动 @ 触发 |
| Canva 设计 | `external_links` 表 + `link_type='canva'` | Webhook + 手动刷新 |
| 网页链接 | `external_links` 表 + `link_type='web'` | 手动触发 / @ 实时抓取 |
| Markdown 内嵌图片 | 文件系统 `projects/{id}/images/` | 编辑器加载时 resolve |

### 2.5 文件夹监控行为

- 每个项目关联**一个**本地根文件夹
- Rust 端用 `notify` crate 递归监听文件夹内所有文件变更（创建/修改/删除）
- 文件变更时自动重新提取文本，更新 `external_links` 对应记录
- 支持的文件类型：PPTX/DOCX/PDF/TXT/MD/常见图片格式
- 文本提取优先级：TXT/MD（完整读取）→ PDF/DOCX/PPTX（后续阶段，用 `pdf-extract` / zip+xml 解析）

---

## 3. Bug 修复计划

### 3.1 Bug #1：图片 URL 渲染失败

**现象**：图片存储模式设为 `file` 时，`bindle-img:projectId/fileName` 引用在重新打开软件后无法渲染。

**根因**：`MarkdownEditor.tsx` 中 `resolveBindleRefs` 的正则 `\(bindle-img:([^)]+)\)` 在遇到 ` ![alt](bindle-img:xxx/file.jpg "width=260")` 时会捕获到 `xxx/file.jpg "width=260"`，导致传给 `resolve_project_image` 的文件名错误。

**修复**：修改正则，只捕获不带空格和引号的文件路径部分：

```
// 旧: /!\[([^\]]*)\]\(bindle-img:([^)]+)\)/g
// 新: /!\[([^\]]*)\]\(bindle-img:([^)\s"]+)[^)]*\)/g
```

### 3.2 Bug #2：白板打开报错

**现象**：打开白板页面时发生错误。

**怀疑原因**：`WhiteboardPage.tsx` 中 `createTLStore()` 在 tldraw v5 可能需要 schema 参数；store 生命周期在切换白板时可能有冲突。

**修复**：检查实际 tldraw 版本 API，必要时：
- 为 `createTLStore()` 添加 schema 参数
- 确保在切换白板时正确重建 store 并销毁旧实例

### 3.3 Bug #3：编辑器拖入图片功能

**现状**：`MarkdownEditor.tsx` 中 `handleDrop` 已实现拖入图片逻辑。需实测确认是否正常工作。

**修复**：
- 实测验证当前拖入功能是否正常
- 如果不工作，排查 TipTap 的 `handleDrop` 返回值与事件冒泡问题
- 添加拖入时的视觉反馈（高亮边框）

---

## 4. 功能路线图

### Phase 1 — 立即修复（当前阶段）

- [ ] 修复 Bug #1：`bindle-img:` 解析
- [ ] 修复 Bug #2：白板加载错误
- [ ] 验证 Bug #3：拖入图片（修复如需）
- [ ] 重构资源架构：引入 `ResourceProvider` trait + `LocalFileProvider`
- [ ] 文件夹监控：`notify` crate + UI 配置项
- [ ] 外部链接数据结构改造：支持 `sync_status`、`last_synced_at`、`synced_content` 字段
- [ ] GitHubProvider：L1（README + 文件树）

### Phase 2 — 外部服务集成（短期）

- [ ] GitHubProvider：L2（`git clone --depth=1`，用户手动触发）
- [ ] CanvaProvider：Connect API 集成
- [ ] WebPageProvider：按需抓取 + firecrawl 提取

### Phase 3 — 自托管协作（中期）

- [ ] Go 后端：REST API + WebSocket
- [ ] 密钥制身份：邀请码生成/管理 + JWT
- [ ] Yjs CRDT 实时同步（知识库 + 白板）
- [ ] 协作光标/标签显示（以项目为单位邀请）
- [ ] Docker Compose 部署

### Phase 4 — AI 辅助（中远期）

- [ ] 侧边栏 AI 对话面板（前端 UI）
- [ ] 选中文本 → AI 润色/扩写/缩短 → 直接修改编辑器内容
- [ ] AI Context 自动注入管道（项目背景 + 知识库 + 关联资源）
- [ ] 白板 AI 生图：MCP 操控画布画架构图
- [ ] 白板 AIGC 生图：类似 Lovart 交互，选中素材 → 对话生成 → 本地保存并渲染

### Phase 5 — 高级功能（远期）

- [ ] 知识库历史版本回溯（类似 Overleaf 时间线）
- [ ] 白板共享协作
- [ ] 白板 AI 增强（在 Phase 4 基础上扩展）

---

## 5. 代码重构范围

### 5.1 Rust 端

- **新增**: `commands/resource.rs` — 统一的资源同步命令入口
- **新增**: `db/resource_provider.rs` — `ResourceProvider` trait 及各 Provider 实现
- **修改**: `commands/link.rs` — 增加 `sync_link` 命令，关联 ResourceProvider
- **修改**: `db/models.rs` — `ExternalLink` 增加 `sync_status`, `last_synced_at`, `last_snapshot` 字段
- **修改**: `db/migrations.rs` — 新增 migration 为 `external_links` 加字段
- **新增**: `commands/file_watcher.rs` — `notify` crate 文件夹监控逻辑

### 5.2 前端

- **修改**: `components/editor/MarkdownEditor.tsx` — 修复 `resolveBindleRefs` 正则
- **修改**: `pages/WhiteboardPage.tsx` — 修复 tldraw store 初始化
- **新增**: `components/resource/ResourceCard.tsx` — 资源卡片（含同步状态显示）
- **修改**: `pages/ExternalLinksPage.tsx` — 整合新的 Provider-based 资源列表
- **修改**: `types/share.ts` — 更新 `ExternalLink` 类型
- **新增**: `stores/resourceStore.ts` — 资源同步状态管理

---

## 6. 技术决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 资源同步架构 | 差异化 + 轻量 Provider trait | 务实，避免过度抽象；每种资源走最佳路径 |
| Canva 集成方式 | Connect API + 外部链接 | Canva 不提供可嵌入编辑器，只能 API 同步 |
| GitHub 同步深度 | 双层（L1 默认 + L2 按需） | 兼顾速度与深度代码分析需求 |
| 本地文件同步 | `notify` 文件监控 | 用户打开软件后直接修改原文件，无需重复导入 |
| 文件夹监控粒度 | 每项目一个根文件夹 | 简单清晰，避免多路径管理复杂度 |
| 协作身份 | 密钥制 + 所有者命名 | 无需用户注册，项目所有者完全控制 |

---

## 7. 外部 API 依赖

| 服务 | API | 用途 | 优先级 |
|------|-----|------|--------|
| GitHub | REST API v3 | 拉取 README、文件树、仓库元数据 | Phase 1 |
| Git | `git clone --depth=1` | L2 全量代码拉取 | Phase 2 |
| Canva | Connect REST API | 读取设计内容、导出预览 | Phase 2 |
| Canva | Connect Webhook | 被动接收设计变更通知 | Phase 2 |
| firecrawl / HTTP fetch | 网页正文提取 | 网页链接 AI 上下文 | Phase 2 |
