# PPT Rich Text — tldraw-Style Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TiptapEditor` with a tldraw-style `RichTextEditor` that passes font styles into ProseMirror, supports Escape/Ctrl+Enter/Tab keyboard shortcuts, hides display HTML while editing, and unifies PropsPanel format button state via zustand store.

**Architecture:** Create `RichTextEditor.tsx` in `elements/` that manages a per-edit-session `Editor` instance (create on mount, destroy on unmount). Expose `useRichText()` hook backed by `pptStore.activeEditor`. Modify `TextElement` to pass all font props and hide display HTML on edit. Update `PropsPanel` to use `useRichText()` instead of `getActiveEditor()`. Clean up CSS.

**Tech Stack:** React 19, TypeScript, TipTap 3.x, Zustand, Tailwind CSS 4

## Global Constraints

- Use existing TipTap extensions from `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-text-align`, `@tiptap/extension-text-style`, `@tiptap/extension-font-family`, `@tiptap/extension-color`
- `@tiptap/extension-highlight` is in `package.json` but not currently used — add it
- All files stay in `app/src/modules/ppt/` or `app/src/` (CSS only)
- Store changes go in `app/src/modules/ppt/store.ts`
- No new dependencies
- TypeScript strict: every new function/component must have explicit types
- CSS: override existing `.tl-rich-text` / `.ProseMirror` rules in `index.css`, not in new CSS files
- Verify with `npx tsc -b` (via `npm run build`'s tsc step)

---

### Task 1: Add `activeEditor` to pptStore

**Files:**
- Modify: `app/src/modules/ppt/store.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `activeEditor: Editor | null` field + `setActiveEditor: (e: Editor | null) => void` on store; `Editor` imported from `@tiptap/core`

- [ ] **Step 1: Add import and state fields**

At top of `store.ts` after existing imports, add:

```ts
import { Editor } from '@tiptap/core'
```

In `PptState` interface (around line 10-53), add after `selectedSlideIds: string[]`:

```ts
  activeEditor: Editor | null
```

After `setGuideLines: (lines: GuideLine[]) => void`:

```ts
  setActiveEditor: (e: Editor | null) => void
```

- [ ] **Step 2: Add initial value and implementation**

In `create<PptState>` initial object (around line 100-115), add after `selectedSlideIds: []`:

```ts
  activeEditor: null,
```

After the `setGuideLines` implementation (around line 243), add:

```ts
  setActiveEditor: (e) => set({ activeEditor: e }),
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc -b --noEmit` from `app/` directory
Expected: No new errors related to store.ts

- [ ] **Step 4: Commit**

```bash
git add app/src/modules/ppt/store.ts
git commit -m "feat(ppt): add activeEditor to pptStore for RichTextEditor integration"
```

---

### Task 2: Create `RichTextEditor.tsx`

**Files:**
- Create: `app/src/modules/ppt/elements/RichTextEditor.tsx`
- Modify: none yet

**Interfaces:**
- Consumes: `activeEditor` + `setActiveEditor` from task 1 (pptStore)
- Produces: `RichTextEditor` component, `useRichText()` hook, `renderRichTextHTML()` function (moved from old TiptapEditor)
- Import: `Editor` from `@tiptap/core`, extensions from their packages

- [ ] **Step 1: Write the file**

Create `app/src/modules/ppt/elements/RichTextEditor.tsx`:

```tsx
import { useLayoutEffect, useRef } from 'react'
import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextAlign } from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import { Highlight } from '@tiptap/extension-highlight'
import { generateHTML } from '@tiptap/html'
import { usePptStore } from '../store'

const extensions = [
  StarterKit.configure({
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    heading: { levels: [1, 2, 3] },
    trailingNode: { notAfter: ['paragraph', 'bulletList', 'orderedList', 'listItem'] },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  FontFamily.configure({ types: ['textStyle'] }),
  Color,
  Highlight,
]

interface RichTextEditorProps {
  content: any
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
  onCancel: () => void
  onComplete: (json: any) => void
}

export function RichTextEditor({
  content,
  fontSize, fontColor, fontFamily,
  fontWeight, fontStyle, textDecoration,
  lineHeight, textAlign, letterSpacing,
  onBlur, onCancel, onComplete,
}: RichTextEditorProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const initialContentRef = useRef(content)

  useLayoutEffect(() => {
    if (!mountRef.current) return

    const styleStr = [
      `font-size:${fontSize}px`,
      `color:${fontColor}`,
      `font-family:${fontFamily === 'inherit' ? 'inherit' : fontFamily}`,
      `font-weight:${fontWeight || 'normal'}`,
      `font-style:${fontStyle || 'normal'}`,
      `text-decoration:${textDecoration || 'none'}`,
      `line-height:${lineHeight}`,
      `text-align:${textAlign || 'left'}`,
      `letter-spacing:${letterSpacing || 0}px`,
      `outline:none`,
      `padding:0`,
      `margin:0`,
      `overflow-wrap:break-word`,
      `word-break:break-word`,
      `white-space:pre-wrap`,
    ].join(';')

    const ed = new Editor({
      element: mountRef.current,
      extensions,
      content: initialContentRef.current,
      autofocus: true,
      editable: true,
      editorProps: {
        attributes: {
          style: styleStr,
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
            return true
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            onComplete(editorRef.current?.getJSON() || initialContentRef.current)
            return true
          }
          if (event.key === 'Tab') {
            event.preventDefault()
            const ed = editorRef.current
            if (!ed) return true
            const { $from } = ed.state.selection
            const inList = $from.node(-1)?.type.name === 'listItem'
            if (event.shiftKey) {
              if (inList) {
                ed.chain().focus().liftListItem('listItem').run()
              }
            } else {
              if (inList) {
                ed.chain().focus().sinkListItem('listItem').run()
              } else {
                ed.chain().focus().insertContent('\t').run()
              }
            }
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor }) => {
        initialContentRef.current = editor.getJSON()
      },
      onBlur: ({ editor }) => {
        onBlur(editor.getJSON())
      },
    })

    editorRef.current = ed
    usePptStore.getState().setActiveEditor(ed)

    const timeout = setTimeout(() => {
      ed.commands.focus('end')
    }, 50)

    return () => {
      clearTimeout(timeout)
      usePptStore.getState().setActiveEditor(null)
      editorRef.current = null
      ed.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      className="tl-rich-text"
      style={{ position: 'absolute', inset: 0, zIndex: 1 }}
    />
  )
}

// ─── useRichText hook (for PropsPanel) ───

export function useRichText() {
  const editor = usePptStore((s) => s.activeEditor)
  return {
    editor,
    isBold: editor?.isActive('bold') ?? false,
    isItalic: editor?.isActive('italic') ?? false,
    isUnderline: editor?.isActive('underline') ?? false,
    isStrike: editor?.isActive('strike') ?? false,
    isBulletList: editor?.isActive('bulletList') ?? false,
    isOrderedList: editor?.isActive('orderedList') ?? false,
    textAlign: (['left', 'center', 'right'] as const).find((a) =>
      editor?.isActive({ textAlign: a })
    ),
    fontFamily: (editor?.getAttributes('textStyle').fontFamily as string) ?? null,
    fontSize: (editor?.getAttributes('textStyle').fontSize as string) ?? null,
    color: (editor?.getAttributes('textStyle').color as string) ?? null,
    toggleBold: () => editor?.chain().focus().toggleBold().run(),
    toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
    toggleUnderline: () => editor?.chain().focus().toggleUnderline().run(),
    toggleStrike: () => editor?.chain().focus().toggleStrike().run(),
    toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
    toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
    setTextAlign: (a: string) =>
      editor?.chain().focus().setTextAlign(a as any).run(),
    setFontFamily: (f: string) =>
      editor?.chain().focus().setFontFamily(f === 'inherit' ? '' : f).run(),
    setFontSize: (s: string) =>
      editor?.chain().focus().setFontSize(s).run(),
    setColor: (c: string) =>
      editor?.chain().focus().setColor(c).run(),
  }
}

// ─── Read-only HTML rendering ───

const htmlCache = new WeakMap<any, string>()

export function renderRichTextHTML(content: any): string {
  if (!content || typeof content !== 'object') return ''
  const cached = htmlCache.get(content)
  if (cached) return cached
  try {
    const html = generateHTML(content, extensions)
    const fixed = html.replaceAll('<p></p>', '<p><br /></p>')
    htmlCache.set(content, fixed)
    return fixed
  } catch {
    return ''
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc -b --noEmit` from `app/`
Expected: No errors, or only pre-existing errors

- [ ] **Step 3: Commit**

```bash
git add app/src/modules/ppt/elements/RichTextEditor.tsx
git commit -m "feat(ppt): create RichTextEditor with tldraw-style interactions"
```

---

### Task 3: Modify `TextElement.tsx`

**Files:**
- Modify: `app/src/modules/ppt/elements/TextElement.tsx`

**Interfaces:**
- Consumes: `RichTextEditor`, `renderRichTextHTML` from task 2; `usePptStore` (already imported)
- Produces: Updated `TextEl` and `ReadOnlyTextEl` components

- [ ] **Step 1: Update imports**

Change the import on line 4 from:

```tsx
import { TiptapEditor, renderRichTextHTML } from './TiptapEditor'
```

to:

```tsx
import { RichTextEditor, renderRichTextHTML } from './RichTextEditor'
```

- [ ] **Step 2: Modify `TextEl` to hide HTML when editing and pass all font props**

Replace lines 65-73 (the return JSX) with:

```tsx
  return (
    <div data-el-id={el.id} style={boxStyle} onClick={handleClick} onMouseDown={editing ? (e) => e.stopPropagation() : onMouseDown}>
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
    </div>
  )
```

- [ ] **Step 3: Verify TypeScript**

Run: `npx tsc -b --noEmit` from `app/`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add app/src/modules/ppt/elements/TextElement.tsx
git commit -m "feat(ppt): wire TextElement to RichTextEditor, hide HTML on edit"
```

---

### Task 4: Modify `PropsPanel.tsx`

**Files:**
- Modify: `app/src/modules/ppt/PropsPanel.tsx`

**Interfaces:**
- Consumes: `useRichText` from task 2
- Produces: Updated format button state binding via `useRichText()` instead of `getActiveEditor()`

- [ ] **Step 1: Replace import**

Change line 6 from:

```tsx
import { getActiveEditor } from './elements/TiptapEditor'
```

to:

```tsx
import { useRichText } from './elements/RichTextEditor'
```

- [ ] **Step 2: Replace `TextAlignBtn` (lines 842-853)**

Replace the entire function with:

```tsx
function TextAlignBtn({ el, updateProps, align, icon }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void; align: string; icon: React.ReactNode }) {
  const { editor, textAlign, setTextAlign } = useRichText()
  const currentAlign = el.props.textAlign || 'left'
  const active = editor ? textAlign === align : currentAlign === align
  return (
    <button onClick={() => {
      if (editor) setTextAlign(align)
      else updateProps({ textAlign: align as any })
    }} className={`flex-1 py-1 rounded border flex items-center justify-center ${active ? 'bg-blue-100 text-blue-700 border-blue-300' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
    >{icon}</button>
  )
}
```

- [ ] **Step 3: Replace `TextStyleToggles` (lines 855-886)**

Replace the entire function with:

```tsx
function TextStyleToggles({ el, updateProps }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void }) {
  const p = el.props
  const { editor, isBold, isItalic, isUnderline, isStrike, toggleBold, toggleItalic, toggleUnderline, toggleStrike } = useRichText()
  const btnClass = 'flex-1 py-1.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center'
  const activeClass = 'bg-blue-100 text-blue-700 border-blue-300'

  const boldActive = editor ? isBold : p.fontWeight === 'bold'
  const italicActive = editor ? isItalic : p.fontStyle === 'italic'
  const underlineActive = editor ? isUnderline : p.textDecoration === 'underline'
  const strikeActive = editor ? isStrike : p.textDecoration === 'line-through'

  return (
    <div className="flex gap-0.5">
      <button onClick={() => {
        if (editor) toggleBold()
        else updateProps({ fontWeight: p.fontWeight === 'bold' ? 'normal' : 'bold' })
      }} className={`${btnClass} ${boldActive ? activeClass : ''}`}><Bold size={13} /></button>
      <button onClick={() => {
        if (editor) toggleItalic()
        else updateProps({ fontStyle: p.fontStyle === 'italic' ? 'normal' : 'italic' })
      }} className={`${btnClass} ${italicActive ? activeClass : ''}`}><Italic size={13} /></button>
      <button onClick={() => {
        if (editor) toggleUnderline()
        else updateProps({ textDecoration: p.textDecoration === 'underline' ? 'none' : 'underline' })
      }} className={`${btnClass} ${underlineActive ? activeClass : ''}`}><Underline size={13} /></button>
      <button onClick={() => {
        if (editor) toggleStrike()
        else updateProps({ textDecoration: p.textDecoration === 'line-through' ? 'none' : 'line-through' })
      }} className={`${btnClass} ${strikeActive ? activeClass : ''}`}><Strikethrough size={13} /></button>
    </div>
  )
}
```

- [ ] **Step 4: Replace `TextListToggles` (lines 888-916)**

Replace the entire function with:

```tsx
function TextListToggles({ el, updateProps, update }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void; update: (c: Partial<CanvasElement>) => void }) {
  const p = el.props
  const { editor, isBulletList, isOrderedList, toggleBulletList, toggleOrderedList } = useRichText()
  const content = el.props.content || {}
  const isOL = editor ? isOrderedList : hasListInJSON(content, 'ol')
  const isUL = editor ? isBulletList : hasListInJSON(content, 'ul')
  const btnClass = 'flex-1 py-1.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center'
  const activeClass = 'bg-blue-100 text-blue-700 border-blue-300'
  return (
    <div className="flex gap-0.5">
      <button onClick={() => {
        if (editor) { toggleOrderedList() }
        else {
          const newContent = isOL ? removeListFromJSON(content) : toggleListInJSON(content, 'ol')
          update({ props: { ...el.props, content: newContent } })
        }
      }} className={`${btnClass} ${isOL ? activeClass : ''}`}><ListOrdered size={13} /></button>
      <button onClick={() => {
        if (editor) { toggleBulletList() }
        else {
          const newContent = isUL ? removeListFromJSON(content) : toggleListInJSON(content, 'ul')
          update({ props: { ...el.props, content: newContent } })
        }
      }} className={`${btnClass} ${isUL ? activeClass : ''}`}><List size={13} /></button>
      <button onClick={() => { updateProps({ writingMode: p.writingMode === 'vertical-rl' ? 'horizontal-tb' : 'vertical-rl' }) }}
        className={`${btnClass} ${p.writingMode === 'vertical-rl' ? activeClass : ''}`}><ArrowUpDown size={13} /></button>
    </div>
  )
}
```

- [ ] **Step 5: Call `useRichText()` at top of `PanelFields`, replace all `getActiveEditor()` usages**

At the top of `PanelFields` (line 352), after `const updateProps = ...` line, add:

```tsx
  const rt = useRichText()
```

Then replace all inline `getActiveEditor()` calls:

**FontSelect** (lines 382-387):
```tsx
          <FontSelect value={el.props.fontFamily || 'inherit'} onChange={v => {
            const val = v === 'inherit' ? undefined : v
            if (rt.editor) { rt.setFontFamily(val || '') }
            updateProps({ fontFamily: val })
          }} />
```

**ScrubInput fontSize** (lines 389-394):
```tsx
            <ScrubInput label="" value={el.props.fontSize || 16} onChange={v => {
              if (rt.editor) rt.setFontSize(v + 'px')
              updateProps({ fontSize: v })
            }} min={1} max={999} />
```

**ColorChip fontColor** (lines 400-404):
```tsx
          <ColorChip label="颜色" color={el.props.fontColor || '#333'} onChange={v => {
            if (rt.editor) rt.setColor(v)
            updateProps({ fontColor: v })
          }} opacity={el.opacity} onOpacityChange={v => update({ opacity: v })} />
```

- [ ] **Step 6: Verify TypeScript**

Run: `npx tsc -b --noEmit` from `app/`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add app/src/modules/ppt/PropsPanel.tsx
git commit -m "feat(ppt): replace getActiveEditor with useRichText in PropsPanel"
```

---

### Task 5: Update `index.css`

**Files:**
- Modify: `app/src/index.css`

**Interfaces:**
- Consumes: nothing external
- Produces: clean `.tl-rich-text` CSS rules matching tldraw's visual output

- [ ] **Step 1: Replace existing `.tl-rich-text` rules (lines 471-476)**

Replace lines 471-476:

```css
/* Rich text (Tiptap generated HTML) */
.tl-rich-text p { margin: 0; }
.tl-rich-text ul, .tl-rich-text ol { margin: 0; padding-left: 1.5em; }
.tl-rich-text ul { list-style-type: disc; }
.tl-rich-text ol { list-style-type: decimal; }
.tl-rich-text li { margin: 0; }
```

with:

```css
/* Rich text (tldraw-style, used by PPT RichTextEditor) */
.tl-rich-text .ProseMirror {
  word-wrap: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}
.tl-rich-text p {
  margin: 0;
  min-height: 1em;
}
.tl-rich-text ul,
.tl-rich-text ol {
  margin: 0;
  padding-left: 1.625ch;
  list-style: revert;
}
.tl-rich-text li {
  margin: 0;
}
.tl-rich-text a {
  text-decoration: underline;
}
.tl-rich-text code {
  font-size: 0.9em;
}
.tl-rich-text h1,
.tl-rich-text h2,
.tl-rich-text h3 {
  line-height: 1.35;
  margin: 0;
}
.tl-rich-text mark {
  background-color: #fddd00;
  color: currentColor;
  border-radius: 2px;
}
```

- [ ] **Step 2: Verify existing `.ProseMirror` rules don't conflict**

The `.ProseMirror` rules at lines 98-104 (`padding: 0 !important`, `p { margin: 0 !important }` etc.) still apply globally. This is acceptable — the PPT editor's ProseMirror will inherit them, which is the correct behavior (zero padding/margin in the compact canvas text box). The knowledge base editor continues to work as before.

- [ ] **Step 3: Commit**

```bash
git add app/src/index.css
git commit -m "style: complete .tl-rich-text CSS rules matching tldraw"
```

---

### Task 6: Delete old `TiptapEditor.tsx` and verify

**Files:**
- Delete: `app/src/modules/ppt/elements/TiptapEditor.tsx`

**Interfaces:**
- Consumes: Tasks 1-5 complete (all references migrated)
- Produces: clean removal

- [ ] **Step 1: Check no remaining references**

Run: `rg "TiptapEditor" app/src/`
Expected: No results (or only in deleted file itself)

Run: `rg "getActiveEditor\|setActiveEditor\|activeEditor" app/src/ --include='*.tsx' --include='*.ts'`

Expected: Only in `RichTextEditor.tsx` (new code) and `store.ts` (new field). If any reference remains in `MarkdownEditor.tsx` or elsewhere, note: `MarkdownEditor.tsx` still exports its own `setActiveEditor`/`getActiveEditor` (line 11-13 of that file), which is a separate concern for the knowledge base editor — do NOT touch it.

- [ ] **Step 2: Delete the file**

```bash
Remove-Item -LiteralPath "app\src\modules\ppt\elements\TiptapEditor.tsx"
```

- [ ] **Step 3: Final TypeScript check**

Run: `npx tsc -b --noEmit` from `app/`
Expected: No new errors introduced by the deletion

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ppt): remove old TiptapEditor, finalize RichTextEditor migration"
```
