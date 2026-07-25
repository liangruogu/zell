import { useState, useEffect, useRef, useCallback } from 'react'
import { type Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { ImageGroupNode } from './ImageGroupNode'

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
  const [menuMode, setMenuMode] = useState<'single' | 'multi' | 'group'>('single')
  const menuRef = useRef<HTMLDivElement>(null)
  const savedWidthRef = useRef<string>('')
  const selectedImagesRef = useRef<Set<number>>(new Set())

  // Save width attribute when menu closes
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
      // Clear selection highlights
      clearHighlights()
    }
  }, [visible, editor])

  const clearHighlights = useCallback(() => {
    document.querySelectorAll('.zell-img-selected').forEach((el) => el.classList.remove('zell-img-selected'))
    document.querySelectorAll('.zell-img-multi-selected').forEach((el) => el.classList.remove('zell-img-multi-selected'))
    selectedImagesRef.current.clear()
  }, [])

  const highlightImages = useCallback((positions: number[]) => {
    clearHighlights()
    const set = new Set<number>()
    positions.forEach((p) => {
      set.add(p)
      const img = editor.view.nodeDOM(p) as HTMLElement | null
      img?.classList.add('zell-img-multi-selected')
    })
    selectedImagesRef.current = set
  }, [editor, clearHighlights])

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
    const clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'IMG' && target.nodeName !== 'IMG') return
      if (!target.closest('.ProseMirror')) return

      // Only handle Shift+click on left click (multi-select)
      if (!e.shiftKey) return

      e.preventDefault()
      e.stopPropagation()

      const view = editor.view
      const posNum = view.posAtDOM(target, 0)

      // Check if inside an imageGroup —skip
      const $pos = view.state.doc.resolve(posNum)
      if ($pos.parent.type.name === 'imageGroup') return

      if (selectedImagesRef.current.has(posNum)) {
        selectedImagesRef.current.delete(posNum)
        const el = view.nodeDOM(posNum) as HTMLElement | null
        el?.classList.remove('zell-img-multi-selected')
      } else {
        selectedImagesRef.current.add(posNum)
        const el = view.nodeDOM(posNum) as HTMLElement | null
        el?.classList.add('zell-img-multi-selected')
      }
      if (selectedImagesRef.current.size >= 2) {
        setSavedPos(posNum)
        setImgSrc('')
        setMenuMode('multi')
        setPos({ x: e.clientX, y: e.clientY })
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    const contextMenuHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName !== 'IMG' && target.nodeName !== 'IMG') return
      if (!target.closest('.ProseMirror')) return

      const view = editor.view
      let posNum = view.posAtDOM(target, 0)

      // Check if inside an imageGroup -> show ungroup option
      const $pos = view.state.doc.resolve(posNum)
      const parentNode = $pos.parent
      if (parentNode.type.name === 'imageGroup') {
        e.preventDefault()
        e.stopPropagation()
        clearHighlights()
        setMenuMode('group')
        setSavedPos($pos.start($pos.depth))
        setImgSrc('')
        setPos({ x: e.clientX, y: e.clientY })
        setVisible(true)
        return
      }

      // Right-click on image: show single image resize menu
      e.preventDefault()
      e.stopPropagation()
      clearHighlights()

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
      setMenuMode('single')
      setPos({ x: e.clientX, y: e.clientY })
      setVisible(true)
    }

    const closeHandler = () => {
      setVisible(false)
      clearHighlights()
    }

    editor.view.dom.addEventListener('click', clickHandler)
    editor.view.dom.addEventListener('contextmenu', contextMenuHandler)
    document.addEventListener('click', closeHandler)
    return () => {
      editor.view.dom.removeEventListener('click', clickHandler)
      editor.view.dom.removeEventListener('contextmenu', contextMenuHandler)
      document.removeEventListener('click', closeHandler)
    }
  }, [editor, clearHighlights])

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

  const handleGroupImages = useCallback(() => {
    const positions = Array.from(selectedImagesRef.current)
    if (positions.length < 2) return
    positions.sort((a, b) => a - b)
    ;(editor.commands as any).groupImages?.(positions)
    clearHighlights()
    setVisible(false)
  }, [editor, clearHighlights])

  const handleUngroup = useCallback(() => {
    ;(editor.commands as any).ungroupImages?.()
    setVisible(false)
  }, [editor])

  if (!visible) return null

  const isMulti = menuMode === 'multi'
  const isGroup = menuMode === 'group'

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 w-[260px]"
      style={{ left: Math.min(pos.x, window.innerWidth - 270), top: Math.min(pos.y, window.innerHeight - 300) }}
    >
      {isMulti ? (
        <>
          <h4 className="text-xs font-semibold text-gray-700 mb-3">
            已选择 {selectedImagesRef.current.size} 张图片          </h4>
          <button
            type="button"
            onClick={handleGroupImages}
            className="w-full px-3 py-2 text-sm font-medium text-white bg-zell-600 hover:bg-zell-700 rounded-md transition-colors"
          >
            并排显示
          </button>
        </>
      ) : isGroup ? (
        <>
          <h4 className="text-xs font-semibold text-gray-700 mb-3">图片组</h4>
          <button
            type="button"
            onClick={handleUngroup}
            className="w-full px-3 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-md transition-colors"
          >
            解除并排
          </button>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
