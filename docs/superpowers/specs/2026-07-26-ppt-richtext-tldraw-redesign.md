# PPT 富文本编辑器按 tldraw 模式重写

**日期**: 2026-07-26  
**状态**: 待实现  
**分支**: TBD

---

## 1. 背景

当前 PPT 文本元素编辑使用 `TiptapEditor.tsx`，存在以下问题：

1. **样式不传递** — 元素 fontSize/fontFamily/color 未通过 `editorProps.attributes` 注入 ProseMirror 的 contenteditable，编辑器显示与最终渲染不一致
2. **缺少键盘交互** — 无 Escape 取消、Ctrl+Enter 完成、Tab 缩进等 tldraw 标准行为
3. **编辑/显示分层错误** — 编辑时显示层 HTML 仍可见，应隐藏
4. **全局变量 `activeEditor`** — 模块级可变引用不符合 React 惯例，严格模式下可能竞态
5. **CSS 不完整** — `.tl-rich-text` 下缺少列表、链接、标题等样式
6. **`useLayoutEffect` 空依赖** — 编辑器只创建一次，内容同步依赖字符串对比，脆弱

## 2. 设计目标

完全参照 tldraw `RichTextArea` 模式重写 PPT 文本编辑器，并统一 `PropsPanel` 工具栏联动。

## 3. 架构

```
RichTextEditor.tsx (新建，elements/ 目录下)
├── RichTextProvider (React Context)
├── RichTextEditor 组件 (Editor 实例生命周期)
├── useRichText() hook (导出格式状态 + 操作命令)
│
TextElement.tsx (修改)
├── 编辑时 HTML display: none
├── 将 fontSize/fontColor/fontFamily 等传入 RichTextEditor
│
PropsPanel.tsx (修改)
├── TextStyleToggles / TextAlignBtn / TextListToggles / FontSelect / ColorChip
├── 替换 getActiveEditor() 为 useRichText()
│
index.css (修改)
├── 补全 .tl-rich-text 样式 (p, ul, ol, li, a, code, h1-h6, mark)
├── 删除现有冲突/重复规则
```

**文件变更**：
- 新建: `app/src/modules/ppt/elements/RichTextEditor.tsx`
- 删除: `app/src/modules/ppt/elements/TiptapEditor.tsx`
- 修改: `app/src/modules/ppt/elements/TextElement.tsx`
- 修改: `app/src/modules/ppt/PropsPanel.tsx`
- 修改: `app/src/index.css`

## 4. RichTextEditor 核心

### 4.1 Editor 配置

每次进入编辑模式创建新 `Editor` 实例，退出时 `destroy()`：

```ts
new Editor({
  element: mountRef.current,
  extensions: [
    StarterKit.configure({
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      trailingNode: { notAfter: ['paragraph', 'bulletList', 'orderedList', 'listItem'] },
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    FontFamily.configure({ types: ['textStyle'] }),
    Color,
    Highlight,
  ],
  content: initialContent,
  autofocus: true,
  editable: true,
  editorProps: {
    attributes: {
      style: `/* 注入 fontSize, color, fontFamily, fontWeight, fontStyle,
                textDecoration, lineHeight, textAlign, letterSpacing */`,
    },
    handleKeyDown: customKeyHandler,
  },
  onUpdate: ({ editor }) => onContentChange?.(editor.getJSON()),
  onBlur: ({ editor }) => onBlur?.(editor.getJSON()),
})
```

### 4.2 键盘交互

| 键 | 行为 |
|---|---|
| Escape | 取消编辑，恢复原始内容，退出编辑模式 |
| Enter | tiptap 默认（空列表项自动退出列表） |
| Ctrl/Meta+Enter | 完成编辑并保存，退出编辑模式 |
| Tab | 非列表行：插入 `\t`；列表内：sinkListItem (正常缩进) |
| Shift+Tab | 非列表行：删除前一个 `\t`；列表内：liftListItem (减少缩进) |
| Ctrl+B/I/U/S | StarterKit 默认处理（加粗/斜体/下划线/删除线） |
| Ctrl+Shift+7/8 | 有序/无序列表切换 |

### 4.3 Store 集成 & Hook

编辑器引用存入 zustand store（`pptStore`）以跨组件访问：

```ts
// store.ts 新增字段
activeEditor: Editor | null
setActiveEditor: (e: Editor | null) => void
```

`RichTextEditor` 挂载时调用 `setActiveEditor(editor)`，卸载时 `setActiveEditor(null)`。

`PropsPanel` 通过 `usePptStore(s => s.activeEditor)` 获取编辑器，无需 context。

**`useRichText()` hook**（`RichTextEditor.tsx` 导出）：

```ts
export function useRichText() {
  const editor = usePptStore(s => s.activeEditor)
  return {
    editor,
    isBold: editor?.isActive('bold') ?? false,
    isItalic: editor?.isActive('italic') ?? false,
    isUnderline: editor?.isActive('underline') ?? false,
    isStrike: editor?.isActive('strike') ?? false,
    isBulletList: editor?.isActive('bulletList') ?? false,
    isOrderedList: editor?.isActive('orderedList') ?? false,
    textAlign: (['left','center','right'] as const).find(a => editor?.isActive({ textAlign: a })),
    fontFamily: editor?.getAttributes('textStyle').fontFamily ?? null,
    fontSize: editor?.getAttributes('textStyle').fontSize ?? null,
    color: editor?.getAttributes('textStyle').color ?? null,
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
    toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    setTextAlign: (a: string) => editor?.chain().focus().setTextAlign(a as any).run(),
    setFontFamily: (f: string) => editor?.chain().focus().setFontFamily(f === 'inherit' ? '' : f).run(),
    setFontSize: (s: string) => editor?.chain().focus().setFontSize(s).run(),
    setColor: (c: string) => editor?.chain().focus().setColor(c).run(),
  }
}
```

无活跃编辑器时（`editor === null`），`PropsPanel` fallback 到元素 props 值（保持当前行为）。

### 4.4 Props

```ts
interface RichTextEditorProps {
  content: any                  // ProseMirror JSON
  fontSize: number
  fontColor: string
  fontFamily: string
  fontWeight?: string
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  lineHeight: number
  textAlign: 'left' | 'center' | 'right'
  letterSpacing: number
  onBlur: (json: any) => void
  onCancel?: () => void        // Escape 取消时调用
  onComplete?: (json: any) => void  // Ctrl+Enter 完成时调用
}
```

## 5. TextElement 修改

```tsx
// 编辑时隐藏 HTML，只显示编辑器
<TextHTML html={html} style={{ display: editing ? 'none' : undefined }} />
{editing && (
  <RichTextEditor
    content={content}
    fontSize={fontSize}
    fontColor={p.fontColor || '#333'}
    fontFamily={p.fontFamily || 'inherit'}
    fontWeight={p.fontWeight || 'normal'}
    fontStyle={p.fontStyle || 'normal'}
    textDecoration={p.textDecoration || 'none'}
    lineHeight={p.lineHeight || 1.5}
    textAlign={p.textAlign || 'left'}
    letterSpacing={p.letterSpacing || 0}
    onBlur={saveContent}
    onCancel={() => setEditing(false)}
    onComplete={(json) => {
      saveContent(json)
      setEditing(false)
    }}
  />
)}
```

取消编辑时 `onCancel` 不清除内容（仅退出编辑模式，原内容保留）。

## 6. PropsPanel 修改

将 `getActiveEditor()` 全部替换为 `useRichText()`（见 4.3）。

具体改动的组件：
| 组件 | 旧代码 | 新代码 |
|---|---|---|
| `TextStyleToggles` | `editor.isActive('bold')` 等 | `useRichText().isBold` 等 |
| `TextAlignBtn` | `editor.isActive({ textAlign })` | `useRichText().textAlign` |
| `TextListToggles` | `editor.isActive('bulletList')` | `useRichText().isBulletList` |
| `FontSelect` | `editor.getAttributes('textStyle')` | `useRichText().fontFamily` |
| 字号 `ScrubInput` | `editor.getAttributes('textStyle')` | `useRichText().fontSize` |
| `ColorChip` | `editor.chain().focus().setColor()` | `useRichText().setColor()` |

所有操作命令也对应替换为 `useRichText()` 的方法。无活跃编辑器时（`editor === null`），fallback 到元素 props（保持现有行为）。

## 7. CSS 修改 (`index.css`)

### 7.1 新增 `.tl-rich-text` 完整样式

```css
.tl-rich-text .ProseMirror {
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
.tl-rich-text p { margin: 0; min-height: 1em; }
.tl-rich-text ul, .tl-rich-text ol { margin: 0; padding-left: 1.625ch; list-style: revert; }
.tl-rich-text li { margin: 0; }
.tl-rich-text a { text-decoration: underline; }
.tl-rich-text code { font-size: 0.9em; }
.tl-rich-text h1, .tl-rich-text h2, .tl-rich-text h3 { line-height: 1.35; margin: 0; }
.tl-rich-text mark { background-color: #fddd00; color: currentColor; border-radius: 2px; }
```

### 7.2 删除冲突规则

当前 `index.css:98-104` 和 `:472-476` 有旧的 `.ProseMirror` 和 `.tl-rich-text` 规则，需整合为以上规则集。

`index.css:98` 的 `.ProseMirror { padding: 0 !important; }` 保留，这对知识库编辑器仍然需要。但 PPT 编辑器的 ProseMirror 不需要 `!important` 的全局规则覆盖，改为由 `editorProps.attributes` 注入。

### 7.3 保持不动的规则
- `index.css:99-104` 的 `.ProseMirror p/ul/ol/li/h*` 给知识库编辑器用的，不动
- `index.css:472-476` 的 `.tl-rich-text` 规则放入上述新规则集中

## 8. 边界情况

1. **编辑中切换幻灯片** — `RichTextEditor` 卸载 → `destroy()` → `store.activeEditor = null` → 安全
2. **编辑中删除元素** — `TextElement` 卸载 → `destroy()` → 安全
3. **空内容 blur** — 保留现有逻辑：空内容时删除元素
4. **Escape 取消** — 不清除内容，仅退出编辑模式
5. **撤销/重做** — store 的 `pushHistory` 机制不变，文本编辑的 snapshot 批处理继续工作
6. **严格模式** — 每次挂载创建新 Editor，清理时 destroy，无竞态

## 9. 测试

运行 `npm run typecheck` 确保 TypeScript 编译通过。无单元测试覆盖 PPT 编辑器，手动验证以下场景：
1. 双击进入编辑 → 字体/颜色/大小与显示一致
2. Escape 退出 → 内容不变
3. Ctrl+Enter 退出 → 保存
4. Tab 插入缩进、列表中正常缩进
5. Ctrl+B/I/U 格式快捷键生效
6. PropsPanel 按钮实时反映编辑状态
7. 点击画布外部 blur 保存
