import { useState, useEffect, useRef, useCallback } from 'react'
import { type Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface FloatingImageMenuProps {
  editor: Editor
}

const SIZE_PRESETS = [
  { label: '小', width: 200 },
  { label: '中', width: 400 },
  { label: '大', width: 600 },
  { label: '充满', width: 'full' as const },
]

export function FloatingImageMenu({ editor }: FloatingImageMenuProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [imgWidth, setImgWidth] = useState(400)
  const [imgSrc, setImgSrc] = useState('')
  const [savedPos, setSavedPos] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const savedWidthRef = useRef<string>('')

  useEffect(() => {
    if (!visible && savedWidthRef.current) {
      const { state, view } = editor
      if (savedPos < state.doc.content.size) {
        const node = state.doc.nodeAt(savedPos)
        if (node?.type.name === 'image') {
          const tr = state.tr.setNodeMarkup(savedPos, undefined, {
            ...node.attrs,
            width: savedWidthRef.current === 'full' ? '100%' : savedWidthRef.current || null,
          })
          view.dispatch(tr)
        }
      }
      savedWidthRef.current = ''
    }
  }, [visible, editor])

  const updateImageWidth = useCallback((width: number | string | null) => {
    const { state, view } = editor
    const { from } = state.selection
    const node = state.doc.nodeAt(from)
    if (node?.type.name !== 'image') return

    const img = view.nodeDOM(from) as HTMLElement | null
    if (!img) return

    if (width === 'full') {
      img.style.width = '100%'
      img.style.maxWidth = '100%'
      savedWidthRef.current = 'full'
    } else if (width === null) {
      img.style.width = ''
      img.style.maxWidth = ''
      savedWidthRef.current = ''
    } else {
      img.style.width = `${width}px`
      img.style.maxWidth = ''
      savedWidthRef.current = String(width)
    }
  }, [editor])

  useEffect(() => {
    const contextMenuHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'IMG' && target.nodeName !== 'IMG') return
      if (!target.closest('.ProseMirror')) return

      const view = editor.view
      const posNum = view.posAtDOM(target, 0)

      e.preventDefault()
      e.stopPropagation()

      const img = target as HTMLImageElement
      editor.chain().setNodeSelection(posNum).run()

      const currentWidth = img.style.width
        ? parseInt(img.style.width)
        : img.getAttribute('width')
          ? parseInt(img.getAttribute('width')!)
          : img.naturalWidth || img.clientWidth

      setImgWidth(Math.min(currentWidth || 400, 800))
      setImgSrc(img.src)
      setSavedPos(posNum)
      setPos({ x: e.clientX, y: e.clientY })
      setVisible(true)
    }

    const closeHandler = () => {
      setVisible(false)
    }

    let dom: HTMLElement
    try { dom = editor.view.dom } catch (e) { logger.error('FloatingImageMenu: failed to access editor dom', e); return }
    dom.addEventListener('contextmenu', contextMenuHandler)
    document.addEventListener('click', closeHandler)
    return () => {
      dom.removeEventListener('contextmenu', contextMenuHandler)
      document.removeEventListener('click', closeHandler)
    }
  }, [editor])

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const w = parseInt(e.target.value)
    setImgWidth(w)
    updateImageWidth(w)
  }, [updateImageWidth])

  const handlePreset = useCallback((width: number | 'full' | null) => {
    if (width === 'full') {
      setImgWidth(100)
      updateImageWidth('full')
    } else if (width !== null) {
      setImgWidth(width)
      updateImageWidth(width)
    } else {
      updateImageWidth(null)
      setImgWidth(400)
    }
  }, [updateImageWidth])

  const handleCopyImage = useCallback(async () => {
    try {
      const resp = await fetch(imgSrc)
      const blob = await resp.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ])
    } catch (e) {
      logger.error('FloatingImageMenu: failed to copy image via clipboard', e)
      navigator.clipboard.writeText(imgSrc)
    }
  }, [imgSrc])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(imgSrc)
  }, [imgSrc])

  if (!visible) return null

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-[260px]"
      style={{ left: Math.min(pos.x, window.innerWidth - 270), top: Math.min(pos.y, window.innerHeight - 300) }}
    >
      <h4 className="text-xs font-semibold text-gray-700 mb-3">调整图片</h4>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>宽度</span>
          <span className="font-mono text-gray-700">{imgWidth}px</span>
        </div>
        <input
          type="range"
          min={50}
          max={800}
          step={10}
          value={imgWidth}
          onChange={handleSliderChange}
          className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-zell-500"
        />
      </div>

      <div className="flex gap-1.5 mb-3">
        {SIZE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p.width)}
            className={cn(
              'flex-1 py-1 text-xs rounded border transition-colors',
              (p.width === 'full' && imgWidth === 100) ||
                (p.width !== null && p.width !== 'full' && imgWidth === p.width)
                ? 'bg-zell-50 border-zell-300 text-zell-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-2 space-y-1">
        <button
          type="button"
          onClick={handleCopyImage}
          className="w-full text-left px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
        >
          复制图片
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="w-full text-left px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded transition-colors"
        >
          复制图片链接
        </button>
      </div>
    </div>
  )
}
