import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Strikethrough, Code,
  List, ListOrdered, Quote, Undo2, Redo2,
  Heading1, Heading2, Heading3, Code2, Minus,
  CheckSquare, Highlighter, Link2, Image,
  Eye, Columns2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCallback } from 'react'

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, isActive, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded transition-colors cursor-pointer',
        isActive
          ? 'bg-bindle-100 text-bindle-700 ring-1 ring-bindle-300'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      )}
    >
      {children}
    </button>
  )
}

interface EditorToolbarProps {
  editor: Editor | null
  editorMode: 'wysiwyg' | 'split'
  onToggleMode: () => void
}

export function EditorToolbar({ editor, editorMode, onToggleMode }: EditorToolbarProps) {
  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt('输入图片 URL')
    if (url) { editor.chain().focus().setImage({ src: url }).run() }
  }, [editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('输入链接 URL', previousUrl)
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  const isWysiwyg = editorMode === 'wysiwyg'

  if (!editor) return null

  const groups = [
    [
      { action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), title: '加粗 (Ctrl+B)', icon: <Bold size={16} /> },
      { action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), title: '斜体 (Ctrl+I)', icon: <Italic size={16} /> },
      { action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), title: '删除线', icon: <Strikethrough size={16} /> },
      { action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code'), title: '行内代码', icon: <Code size={16} /> },
      { action: () => editor.chain().focus().toggleHighlight().run(), active: editor.isActive('highlight'), title: '高亮', icon: <Highlighter size={16} /> },
    ],
    [
      { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), title: '标题1', icon: <Heading1 size={16} /> },
      { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), title: '标题2', icon: <Heading2 size={16} /> },
      { action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }), title: '标题3', icon: <Heading3 size={16} /> },
    ],
    [
      { action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), title: '无序列表', icon: <List size={16} /> },
      { action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), title: '有序列表', icon: <ListOrdered size={16} /> },
      { action: () => editor.chain().focus().toggleTaskList().run(), active: editor.isActive('taskList'), title: '任务列表', icon: <CheckSquare size={16} /> },
      { action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), title: '引用', icon: <Quote size={16} /> },
      { action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock'), title: '代码块', icon: <Code2 size={16} /> },
    ],
    [
      { action: () => editor.chain().focus().setHorizontalRule().run(), active: false, title: '分隔线', icon: <Minus size={16} /> },
      { action: addImage, active: false, title: '插入图片', icon: <Image size={16} /> },
      { action: setLink, active: editor.isActive('link'), title: '插入链接', icon: <Link2 size={16} /> },
    ],
    [
      { action: () => editor.chain().focus().undo().run(), active: false, title: '撤销', icon: <Undo2 size={16} /> },
      { action: () => editor.chain().focus().redo().run(), active: false, title: '重做', icon: <Redo2 size={16} /> },
    ],
  ]

  return (
    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 bg-gray-50 flex-wrap gap-1 shrink-0">
      <div className="flex items-center gap-1 flex-wrap">
        {groups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-gray-300 mx-1" />}
            {group.map((btn, bi) => (
              <ToolbarButton key={bi} onClick={btn.action} isActive={btn.active} title={btn.title}>
                {btn.icon}
              </ToolbarButton>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          onClick={onToggleMode}
          isActive={false}
          title={isWysiwyg ? '切换到分屏模式' : '切换到所见即所得模式'}
        >
          {isWysiwyg ? <Columns2 size={16} /> : <Eye size={16} />}
        </ToolbarButton>
      </div>
    </div>
  )
}
