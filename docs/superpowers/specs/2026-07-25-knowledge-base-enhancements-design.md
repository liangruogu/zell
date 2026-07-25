# 知识库增强功能设计

> 2026-07-25

## 概述

为知识库模块增加三项增强功能：快捷键帮助面板、自定义 Markdown 样式、图片并排+标题。

---

## 功能一：快捷键帮助面板

### 触发方式

按 `Ctrl+/` 弹出浮动面板，按 `Esc` 或点击面板外部关闭。

### 内容范围

**按当前路由显示专属快捷键**，不展示其他页面的快捷键。

| 路由 | 显示内容 |
|------|---------|
| `/project/:id/knowledge` | 知识库快捷键 |
| `/project/:id/whiteboard` | PPT 画布快捷键 |
| `/project/:id/links` | 外部资源快捷键（只有面板切换） |
| 其他 | 全局快捷键 |

### 各页面快捷键清单

#### 全局（所有页面）
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+L` | 切换左侧面板 |
| `Ctrl+Shift+K` | 切换 AI 面板 |
| `Ctrl+/` | 打开/关闭快捷键帮助 |

#### 知识库
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存文章 |
| `Ctrl+Shift+X` | 切换任务列表 |
| `Ctrl+F` | 编辑器内搜索 |
| `Ctrl+Shift+F` | 搜索文章列表 |
| `Escape` (搜索时) | 关闭搜索 |
| `Tab` | 缩进 |
| `#` 开头 | 增加标题级别 |
| `Backspace` (标题开头) | 降低标题级别 |

#### PPT 画布
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销/重做 |
| `Ctrl+C` / `Ctrl+V` | 复制/粘贴幻灯片 |
| `Ctrl+G` / `Ctrl+Shift+G` | 成组/解组 |
| `Ctrl+滚轮` | 缩放画布 |
| `Ctrl+0` | 重置缩放 |
| `Delete/Backspace` | 删除选中元素或幻灯片 |
| `Shift+拖动` | 轴锁定移动 |
| `Alt+拖动` | 复制元素 |
| `Shift+点击` | 追加选中 |
| `Ctrl+点击` | 多选追加 |

### 组件结构

```
components/share/KeyboardShortcutDialog.tsx
```

- 快捷键数据集中定义为一个静态配置对象
- 组件用 `useLocation` 匹配当前路由，过滤快捷键列表
- 渲染为模态浮动卡片，显示快捷键分组和说明
- 键盘事件监听在 `AppShell` 或顶层组件中全局注册 `Ctrl+/`

---

## 功能二：自定义 Markdown 样式

### 预设主题

提供 4 套预设主题，在设置 → 外观中选择。主题通过 CSS 变量切换实现。

| 主题 | key | 说明 |
|------|-----|------|
| Bindle 默认 | `bindle` | 当前样式，蓝灰基调 |
| GitHub | `github` | 类 GitHub markdown 风格，更紧凑 |
| Notion | `notion` | 类 Notion 清爽风格，大标题 |
| 极简 | `minimal` | 最小样式，接近纯文本 |

### 自定义 CSS

在设置 → 外观中新增"自定义 CSS"编辑区：

- **文本区域**：`<textarea>` 代码编辑器（等宽字体，暗色背景）
- **元素参考**：折叠面板，列出关键 CSS 选择器及修改示例
  ```css
  /* 修改 H1 标题颜色 */
  .bindle-prose h1 { color: #your-color; }

  /* 修改正文字体和大小 */
  .bindle-prose { font-family: 'your-font', sans-serif; font-size: 16px; }

  /* 修改代码块背景色 */
  .bindle-prose pre { background: #1e1e1e; }

  /* 修改链接颜色 */
  .bindle-prose a { color: #your-color; }

  /* 修改表格边框 */
  .bindle-prose table { border-color: #your-color; }
  ```

### 数据存储

- 预设主题存入 `settings` 表的 `appearance` JSON 中，新增 `theme` 字段
- 自定义 CSS 存入 `settings` 表的 `custom_css` 键（与现有 `appearance` 平级）

```json
// appearance 结构更新
{
  "fontSize": "16",
  "showToolbar": true,
  "theme": "bindle"
}
```

### 运行时注入

- 主题选择：在 `index.css` 中为每个主题定义 CSS 变量集，通过 `body[data-bindle-theme="xxx"]` 切换
- 自定义 CSS：`MarkdownEditor` 挂载时从 store 读取 `custom_css`，动态创建 `<style data-bindle-custom>` 标签注入 `<head>`
- 主题 + 自定义 CSS 叠加生效，自定义 CSS 优先级高于主题

### 设置 UI 变更

在 `SettingsDialog.tsx` 的"外观"标签中新增：
1. **主题选择**：4 个卡片式选项，点击即可预览切换效果
2. **自定义 CSS**：可折叠区域，包含 textarea 和元素参考

---

## 功能三：图片并排 + 标题

### 交互流程

```
选中图片（Shift+点击多选）
    → 右键 → 「并排显示」
    → 图片包裹为 imageGroup，flex 等分宽度
    → 每张图下方出现可编辑小字标题

点击 imageGroup
    → 右键 → 「解除并排」
    → 拆回单张图片，保留各自标题为 alt 文本
```

### 技术方案

自定义 TipTap 扩展 `ImageGroup`：

**Schema 定义**：
```typescript
// 节点类型：imageGroup
{
  group: 'block',
  content: 'image+',       // 至少 1 张图片
  defining: true,
  parseHTML: [{ tag: 'div[data-image-group]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-image-group': '', ...HTMLAttributes }, 0],
}
```

**NodeView 渲染**：
```
┌─ imageGroup (display: flex; gap: 8px) ─────────┐
│ ┌─────────────┐  ┌─────────────┐               │
│ │   <img/>    │  │   <img/>    │               │
│ │ [标题输入框] │  │ [标题输入框] │               │
│ └─────────────┘  └─────────────┘               │
└────────────────────────────────────────────────┘
```

- flex 容器，子元素 `flex: 1` 等分宽度
- 每张图下方有一个 `<input>` 用于编辑标题
- 标题存储在 imageGroup 节点的 `captions` 属性中（JSON 数组）

**右键菜单集成**：
- 扩展现有 `FloatingImageMenu` 组件
- 新增「并排显示」选项（选中多张图片时显示）
- 新增「解除并排」选项（选中 imageGroup 时显示）
- 通过 `editor.commands` 操作节点：`wrapIn` / `lift` 风格命令

**多选支持**：
- 为图片节点添加 selection 状态跟踪（React state）
- `Shift+点击` 图片节点 → 标记为已选（蓝色虚线框），追加到选中集合
- 右键时读取选中集合，判断是否 ≥2 张图片

### 存储格式

```html
<!-- 并排前 -->
<img src="..." alt="" />
<img src="..." alt="" />

<!-- 并排后 -->
<div data-image-group>
  <img src="..." alt="" />
  <img src="..." alt="" />
</div>
```

标题存储在 `data-captions` 属性中：
```html
<div data-image-group data-captions='["标题1","标题2"]'>
  ...
</div>
```

### 需要新建/修改的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/share/KeyboardShortcutDialog.tsx` | 新建 | 快捷键帮助面板 |
| `components/editor/ImageGroupExtension.ts` | 新建 | TipTap imageGroup 扩展 |
| `components/editor/ImageGroupView.tsx` | 新建 | imageGroup NodeView 组件 |
| `components/editor/FloatingImageMenu.tsx` | 修改 | 新增并排/解除并排菜单项 + 多选支持 |
| `components/editor/MarkdownEditor.tsx` | 修改 | 注册 ImageGroup 扩展，注入自定义 CSS |
| `components/share/SettingsDialog.tsx` | 修改 | 新增主题选择和自定义 CSS 编辑区 |
| `index.css` | 修改 | 新增主题 CSS 变量、imageGroup 样式 |
| `lib/markdown.ts` | 修改 | markdown 转换支持 imageGroup 格式 |
| `stores/settingsStore.ts` | 修改 | 新增 `custom_css` 到加载列表 |
