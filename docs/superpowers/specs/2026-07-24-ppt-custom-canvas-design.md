# Bindle PPT Module Design

> 用自建 HTML DOM Canvas 替换 tldraw，作为创意白板的 PPT 类型基础。

## Architecture

```
ExternalLinksPage (whiteboard route)
  ├── 左侧：白板列表（现有）
  ├── 中间：<FreeCanvas /> | <PptCanvas /> | 未来其他类型
  ├── 右侧：属性面板（选中元素时展开）
  └── 底部：幻灯片缩略图横条（仅 PPT 模式）

PptCanvas
  ├── 顶部：工具栏（选择/文本/形状/线条/箭头/图片）
  ├── 中间：DOM Canvas 画布
  │   ├── 固定视口（始终居中当前幻灯片）
  │   ├── 元素渲染（div/img 绝对定位 + CSS transform scale）
  │   └── 选择框/缩放手柄
  └── 底部：SlideStrip 缩略图
```

## Data Model

```typescript
// 整个白板的 snapshot JSON
interface WhiteboardSnapshot {
  slides: Slide[]
}

interface Slide {
  id: string
  name: string
  elements: CanvasElement[]
  background: string // CSS color or empty
}

interface CanvasElement {
  id: string
  type: 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'image'
  x: number; y: number; w: number; h: number
  rotation: number  // degrees
  opacity: number   // 0-1
  props: {
    text?: string           // type=text
    fontSize?: number       // type=text
    fontColor?: string      // type=text
    fontWeight?: string     // type=text
    fill?: string           // type=rect,ellipse
    stroke?: string         // border color
    strokeWidth?: number    // border width
    borderRadius?: number   // type=rect
    src?: string            // type=image (data URL or bindle-img: ref)
  }
  // future: aiGenerated, locked, groupId, etc.
}
```

## Core Features (MVP)

### 1. Canvas Engine
- React + CSS `transform: scale()` 实现视口缩放
- 元素用 `position: absolute` 的 div/img
- 选择框用边框虚线 + 四角手柄
- 拖拽：mousedown + mousemove + mouseup 事件
- 缩放：四角 handle 拖拽
- 删除：选中后 Delete 键
- 复制粘贴：Ctrl+C / Ctrl+V

### 2. Slide Management
- 底部横排缩略图（宽130px，16:9比例）
- 新建幻灯片追加到末尾
- 删除（最后一张不可删）
- 复制（在后面插入副本）
- 拖拽排序（HTML5 Drag and Drop）
- 双击缩略图 → 重命名（prompt）

### 3. Basic Elements
| 类型 | 渲染 | 默认样式 |
|------|------|---------|
| 文本 | `<div contentEditable>` | 16px, #333 |
| 矩形 | `<div>` with border-radius | 200x120, #e2e8f0 fill |
| 圆形 | `<div>` border-radius:50% | 120x120, #e2e8f0 fill |
| 线条 | SVG `<line>` inside div | 200x2, #94a3b8 |
| 箭头 | SVG `<line>` + arrowhead | 200x2, #94a3b8 |
| 图片 | `<img>` | 400x300, placeholder |

### 4. Style Editing (右侧属性面板)
- 选中元素时自动展开面板
- 文本类型：fontSize, fontColor, fontWeight, text align
- 矩形/圆形：fill, stroke, strokeWidth, borderRadius, opacity
- 线条/箭头：stroke, strokeWidth
- 图片：无额外属性（尺寸通过手柄调整）

### 5. Export
- 单个幻灯片导出为 PNG
- 使用 `html2canvas` 或 `dom-to-image` 库
- 弹出保存对话框选择路径
- 未来扩展：全部页面导出为 PDF

## Removed Dependencies
- 卸载 tldraw npm 包
- 移除 tldraw 相关 import 和 CSS
- 移除 PptCanvas 中的 Tldraw 组件
- ExternalLinksPage 不再需要 TLStore 管理

## New Dependencies
- `html2canvas` 或 `dom-to-image-more` — 导出功能
- 无其他新依赖（Canvas 用纯 DOM + React）

## AI Integration (Phase 2)
- AI 通过 `createSlide` / `addElement` / `updateElement` 函数操作 canvas
- 这些函数设计为纯数据操作，AI 工具可直接调用
- 提供 MCP-style 接口：`createSlide(template?)`, `addElement(slideId, element)`, `updateElement(elementId, props)`

## File Structure
```
modules/ppt/
  ├── PptCanvas.tsx         # 主组件（工具栏 + 画布 + 面板 + 缩略图）
  ├── CanvasViewport.tsx    # 视口缩放和固定相机
  ├── CanvasElement.tsx     # 单个元素渲染
  ├── ElementHandles.tsx    # 选择框和缩放手柄
  ├── PptToolbar.tsx        # 顶部工具栏
  ├── SlideStrip.tsx        # 底部缩略图
  ├── PropsPanel.tsx        # 右侧属性面板
  ├── types.ts              # 数据模型类型
  ├── store.ts              # Zustand store（slides, currentSlide, selectedIds）
  └── export.ts             # 导出功能
```
