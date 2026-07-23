import { useState, useEffect, useRef, useCallback } from 'react'
import { type Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { AlignLeft, AlignCenter, Maximize } from 'lucide-react'

interface FloatingImageMenuProps {
  editor: Editor
}

const SIZE_PRESETS = [
  { label: '小', width: 200 },
  { label: '中', width: 400 },
  { label: '大', width: 600 },
  { label: '充满', width: 'full' as const },
]

const FLOAT_OPTIONS: { label: string; value: string; icon: React.ReactNode }[] = [
  { label: '居中', value: 'center', icon: <AlignCenter size={14} /> },
  { label: '靠左', value: 'left', icon: <AlignLeft size={14} /> },
]

export function FloatingImageMenu({ editor }: FloatingImageMenuProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [imgWidth, setImgWidth] = useState(400)
  const [imgFloat, setImgFloat] = useState('center')
  const [imgSrc, setImgSrc] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const updateImageWidth = useCallback((width: number | string | null) => {
    const { state, view } = editor
    const { from } = state.selection
    const node = state.doc.nodeAt(from)
    if (node?.type.name === 'image' || node?.type.name === 'inlineImage') {
      if (width === 'full') {
        editor.chain().setNodeSelection(from).updateAttributes('image', { width: '100%' }).run()
        // Apply max-width removal and full width CSS via style
        const img = view.dom.querySelector(`img[src="${node.attrs.src}"]`) as HTMLElement | null
        if (img) {
          img.style.width = '100%'
          img.style.maxWidth = '100%'
        }
      } else {
        const numeric = width === null ? null : Number(width)
        editor.chain().setNodeSelection(from).updateAttributes('image', { width: numeric }).run()
        const img = view.dom.querySelector(`img[src="${node.attrs.src}"]`) as HTMLElement | null
        if (img) img.style.width = numeric ? `${numeric}px` : ''
      }
    }
  }, [editor])

  const updateImageFloat = useCallback((float: string) => {
    const { state, view } = editor
    const { from } = state.selection
    const node = state.doc.nodeAt(from)
    if (node?.type.name === 'image' || node?.type.name === 'inlineImage') {
      setImgFloat(float)
      const img = view.dom.querySelector(`img[src="${node.attrs.src}"]`) as HTMLElement | null
      if (img) {
        if (float === 'center') {
          img.style.display = 'block'
          img.style.marginLeft = 'auto'
          img.style.marginRight = 'auto'
          img.style.float = ''
        } else if (float === 'left') {
          img.style.display = 'inline-block'
          img.style.marginLeft = '0'
          img.style.marginRight = '1em'
          img.style.float = 'left'
        }
      }
    }
  }, [editor])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'IMG' && target.closest('.ProseMirror')) {
        e.preventDefault()
        e.stopPropagation()

        const img = target as HTMLImageElement
        const view = editor.view
        const pos = view.posAtDOM(img, 0)
        editor.chain().setNodeSelection(pos).run()

        const currentWidth = img.style.width
          ? parseInt(img.style.width)
          : img.getAttribute('width')
            ? parseInt(img.getAttribute('width')!)
            : img.naturalWidth || img.clientWidth

        // Detect current float
        const style = img.style
        if (style.display === 'block' || (style.marginLeft === 'auto' && style.marginRight === 'auto')) {
          setImgFloat('center')
        } else if (style.float === 'left') {
          setImgFloat('left')
        } else {
          setImgFloat('center')
        }

        setImgWidth(Math.min(currentWidth || 400, 800))
        setImgSrc(img.src)
        setPos({ x: e.clientX, y: e.clientY })
        setVisible(true)
      }
    }

    const closeHandler = () => setVisible(false)

    editor.view.dom.addEventListener('contextmenu', handler)
    document.addEventListener('click', closeHandler)
    return () => {
      editor.view.dom.removeEventListener('contextmenu', handler)
      document.addEventListener('click', closeHandler)
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
    } catch {
      navigator.clipboard.writeText(imgSrc)
    }
  }, [imgSrc])

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(imgSrc)
  }, [imgSrc])

  if (!visible) return null

  const menuWidth = 260
  const menuHeight = 280
  const x = Math.min(pos.x, window.innerWidth - menuWidth - 10)
  const y = Math.min(pos.y, window.innerHeight - menuHeight - 10)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-[260px]"
      style={{ left: x, top: y }}
    >
      <h4 className="text-xs font-semibold text-gray-700 mb-3">调整图片</h4>

      {/* Size slider */}
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
          className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-bindle-500"
        />
      </div>

      {/* Size presets */}
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
                ? 'bg-bindle-50 border-bindle-300 text-bindle-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Float options */}
      <div className="mb-3">
        <span className="text-xs text-gray-500 mb-1.5 block">位置</span>
        <div className="flex gap-1.5">
          {FLOAT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => updateImageFloat(o.value)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded border transition-colors',
                imgFloat === o.value
                  ? 'bg-bindle-50 border-bindle-300 text-bindle-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              )}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy options */}
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
