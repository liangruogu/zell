import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; action: string }[]
}

const globalShortcuts: ShortcutGroup = {
  title: '全局',
  shortcuts: [
    { keys: 'Ctrl+Shift+L', action: '切换左侧面板' },
    { keys: 'Ctrl+Shift+K', action: '切换 AI 面板' },
    { keys: 'Ctrl+/', action: '打开/关闭快捷键帮助' },
  ],
}

const markdownFormatShortcuts: ShortcutGroup = {
  title: '知识库 — 行内格式',
  shortcuts: [
    { keys: 'Ctrl+B', action: '加粗' },
    { keys: 'Ctrl+I', action: '斜体' },
    { keys: 'Ctrl+Shift+S', action: '删除线' },
    { keys: 'Ctrl+Shift+H', action: '高亮' },
    { keys: 'Ctrl+Space', action: '插入行内公式' },
  ],
}

const markdownBlockShortcuts: ShortcutGroup = {
  title: '知识库 — 块格式',
  shortcuts: [
    { keys: 'Ctrl+Alt+数字', action: '标题 1~6' },
    { keys: 'Ctrl+Shift+7', action: '有序列表' },
    { keys: 'Ctrl+Shift+8', action: '无序列表' },
    { keys: 'Ctrl+Shift+X', action: '任务列表' },
    { keys: 'Ctrl+Shift+B', action: '引用块' },
    { keys: 'Ctrl+Alt+C', action: '代码块' },
    { keys: 'Ctrl+Shift+T', action: '插入表格' },
    { keys: '$$ + 空格', action: '插入块级公式' },
  ],
}

const markdownEditorShortcuts: ShortcutGroup = {
  title: '知识库 — 编辑器',
  shortcuts: [
    { keys: 'Ctrl+S', action: '保存文章' },
    { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: '撤销 / 重做' },
    { keys: 'Ctrl+F', action: '编辑器内搜索' },
    { keys: 'Ctrl+Shift+F', action: '搜索文章列表' },
    { keys: 'Escape', action: '关闭搜索（搜索框打开时）' },
    { keys: 'Tab', action: '插入缩进' },
    { keys: '#', action: '在标题开头按 # 增加标题级别' },
    { keys: 'Backspace', action: '在标题开头按退格降低标题级别' },
  ],
}

const whiteboardShortcuts: ShortcutGroup = {
  title: '设计画布',
  shortcuts: [
    { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: '撤销/重做' },
    { keys: 'Ctrl+C / Ctrl+V', action: '复制/粘贴幻灯片' },
    { keys: 'Ctrl+G / Ctrl+Shift+G', action: '成组/解组' },
    { keys: 'Ctrl+滚轮', action: '缩放画布' },
    { keys: 'Ctrl+0', action: '重置缩放' },
    { keys: 'Delete / Backspace', action: '删除选中元素或幻灯片' },
    { keys: 'Shift+拖动', action: '轴锁定移动' },
    { keys: 'Alt+拖动', action: '复制元素' },
    { keys: 'Shift+点击', action: '追加选中（幻灯片/元素）' },
    { keys: 'Ctrl+点击', action: '多选追加' },
  ],
}

function getShortcuts(pathname: string): ShortcutGroup[] {
  if (pathname.includes('/knowledge')) return [globalShortcuts, markdownFormatShortcuts, markdownBlockShortcuts, markdownEditorShortcuts]
  if (pathname.includes('/whiteboard')) return [globalShortcuts, whiteboardShortcuts]
  return [globalShortcuts]
}

export function useKeyboardShortcutDialog() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '/') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const shortcuts = getShortcuts(location.pathname)

  const dialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
    >
      <div className="fixed inset-0 bg-black/30" />
      <div className="relative z-10 w-[640px] bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">快捷键帮助</h3>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {shortcuts.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {group.title}
              </h4>
              <div className="space-y-1">
                {group.shortcuts.map((s) => (
                  <div
                    key={s.keys}
                    className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-gray-50"
                  >
                    <span className="text-gray-600">{s.action}</span>
                    <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 border border-gray-200 rounded text-gray-500 whitespace-nowrap">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
          <p className="text-xs text-gray-400 pt-4 mt-4 border-t border-gray-100">
            按 <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-gray-100 border border-gray-200 rounded text-gray-500">Ctrl+/</kbd> 打开/关闭此面板
          </p>
        </div>
      </div>
    </div>
  ) : null

  return { dialog }
}
