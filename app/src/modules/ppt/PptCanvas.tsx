import { useEffect, useState, useCallback } from 'react'
import { Tldraw, createShapeId, type Editor, type TLStore, useValue } from 'tldraw'
import 'tldraw/tldraw.css'
import { PptToolbar } from './PptToolbar'
import { SlideStrip } from './SlideStrip'
import { SLIDE_SIZE, SLIDE_GAP } from './types'
import { Presentation, Plus, X } from 'lucide-react'

interface PptCanvasProps {
  store: TLStore
  whiteboardId: string
}

function SelectedPropsPanel({ editor }: { editor: Editor | null }) {
  if (!editor) return null
  const selectedIds = useValue('selected', () => {
    const ids = editor.getSelectedShapeIds()
    return ids.length === 1 ? ids[0] : null
  }, [editor])
  if (!selectedIds) return null
  const shape = editor.getShape(selectedIds)
  if (!shape) return null
  return (
    <div className="w-48 border-l border-gray-200 bg-white shrink-0 p-3 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-700">
          {shape.type === 'text' ? '文本' : shape.type === 'geo' ? '形状' : shape.type === 'image' ? '图片' : shape.type === 'frame' ? '幻灯片' : '元素'}
        </span>
        <button onClick={() => editor.selectNone()} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>
      {shape.type === 'text' || shape.type === 'geo' ? (
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-gray-500">颜色</label>
            <input type="color" value={shape.props.color || '#000000'}
              onChange={(e) => editor.updateShape({ id: selectedIds, type: shape.type as any, props: { ...shape.props, color: e.target.value } })}
              className="w-full h-8 rounded border border-gray-200 cursor-pointer" />
          </div>
          {shape.props.size && (
            <div>
              <label className="text-[10px] text-gray-500">字号</label>
              <select value={shape.props.size} onChange={(e) => editor.updateShape({ id: selectedIds, type: shape.type as any, props: { ...shape.props, size: e.target.value } })}
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded">
                {['s', 'm', 'l', 'xl'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {shape.type === 'geo' && (
            <div>
              <label className="text-[10px] text-gray-500">填充</label>
              <select value={shape.props.fill || 'none'} onChange={(e) => editor.updateShape({ id: selectedIds, type: 'geo', props: { ...shape.props, fill: e.target.value } })}
                className="w-full px-2 py-1 text-xs border border-gray-200 rounded">
                {['none', 'semi', 'solid'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400">{shape.props.w} x {shape.props.h}</p>
      )}
    </div>
  )
}

export function PptCanvas({ store, whiteboardId }: PptCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [slides, setSlides] = useState<any[]>([])
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)

  const refreshSlides = useCallback(() => {
    if (!editor) return
    const shapes = editor.getCurrentPageShapes()
      .filter((s: any) => s.type === 'frame' && s.meta?.slideType === 'slide')
      .sort((a: any, b: any) => ((a.meta?.slideIndex as number) ?? 0) - ((b.meta?.slideIndex as number) ?? 0))
    setSlides(shapes)
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const unsub = editor.store.listen(refreshSlides)
    refreshSlides()
    return () => unsub()
  }, [editor, refreshSlides])

  // Track selection changes
  useEffect(() => {
    if (!editor) return
    const handler = () => {
      setHasSelection(editor.getSelectedShapeIds().length > 0)
    }
    editor.on('change', handler)
    return () => editor.off('change', handler)
  }, [editor])

  const focusSlide = useCallback((slideId: string) => {
    if (!editor) return
    setCurrentSlideId(slideId)
    const shape = editor.getShape(slideId)
    if (!shape) return
    editor.setCameraOptions({
      isLocked: true,
      constraints: {
        initialZoom: 'fit-max',
        baseZoom: 'fit-max',
        bounds: { x: shape.x, y: shape.y, w: shape.props.w, h: shape.props.h },
        behavior: 'contain',
        origin: { x: 0.5, y: 0.5 },
        padding: { x: 0, y: 0 },
      },
    })
    // Force camera to exact position
    editor.setCamera(
      { x: shape.x + shape.props.w / 2, y: shape.y + shape.props.h / 2, z: 1 },
      { animation: { duration: 250 } }
    )
  }, [editor])

  // Keep camera locked to current slide
  useEffect(() => {
    if (!editor || !currentSlideId) return
    const snapCamera = () => {
      const shape = editor.getShape(currentSlideId)
      if (!shape) return
      const c = editor.getCamera()
      const cx = shape.x + shape.props.w / 2
      const cy = shape.y + shape.props.h / 2
      if (Math.abs(c.x - cx) > 1 || Math.abs(c.y - cy) > 1 || Math.abs(c.z - 1) > 0.01) {
        requestAnimationFrame(() => {
          editor.setCamera({ x: cx, y: cy, z: 1 }, { animation: { duration: 150 } })
        })
      }
    }
    const unsub = editor.store.listen(snapCamera as any)
    return () => unsub()
  }, [editor, currentSlideId])

  const addSlide = useCallback((afterIndex?: number) => {
    if (!editor) return
    const idx = afterIndex ?? slides.length
    const x = 100 + idx * (SLIDE_SIZE.w + SLIDE_GAP)
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'frame',
      x,
      y: 100,
      props: { name: `幻灯片 ${idx + 1}`, w: SLIDE_SIZE.w, h: SLIDE_SIZE.h },
      meta: { slideType: 'slide', slideIndex: idx },
    })
    if (afterIndex !== undefined) {
      setTimeout(() => {
        const all = editor.getCurrentPageShapes()
          .filter((s: any) => s.type === 'frame' && s.meta?.slideType === 'slide')
        for (let j = idx + 1; j <= slides.length; j++) {
          const s = all.find((a: any) => a.meta?.slideIndex === j)
          if (s) {
            editor.updateShape({
              id: s.id, type: 'frame',
              x: 100 + j * (SLIDE_SIZE.w + SLIDE_GAP),
              meta: { ...s.meta, slideIndex: j },
              props: { ...s.props, name: `幻灯片 ${j + 1}` },
            })
          }
        }
      }, 50)
    }
    focusSlide(id)
    setTimeout(refreshSlides, 100)
  }, [editor, slides, focusSlide, refreshSlides])

  const deleteSlide = useCallback((slideId: string) => {
    if (!editor || slides.length <= 1) return
    const idx = slides.findIndex(s => s.id === slideId)
    editor.deleteShape(slideId)
    const remaining = slides.filter(s => s.id !== slideId)
    editor.batch(() => {
      remaining.forEach((s: any, i: number) => {
        editor.updateShape({
          id: s.id, type: 'frame',
          x: 100 + i * (SLIDE_SIZE.w + SLIDE_GAP),
          meta: { ...s.meta, slideIndex: i },
          props: { ...s.props, name: `幻灯片 ${i + 1}` },
        })
      })
    })
    if (currentSlideId === slideId && remaining.length > 0) {
      focusSlide(remaining[0].id)
    }
    setTimeout(refreshSlides, 100)
  }, [editor, slides, currentSlideId, focusSlide, refreshSlides])

  const duplicateSlide = useCallback((slideId: string) => {
    if (!editor) return
    const idx = slides.findIndex(s => s.id === slideId)
    if (idx < 0) return
    addSlide(idx + 1)
  }, [editor, slides, addSlide])

  const moveSlide = useCallback((fromIdx: number, toIdx: number) => {
    if (!editor || fromIdx === toIdx) return
    const a = slides[fromIdx]
    const b = slides[toIdx]
    if (!a || !b) return
    editor.batch(() => {
      editor.updateShape({ id: a.id, type: 'frame', x: 100 + toIdx * (SLIDE_SIZE.w + SLIDE_GAP), meta: { ...a.meta, slideIndex: toIdx }, props: { ...a.props, name: `幻灯片 ${toIdx + 1}` } })
      editor.updateShape({ id: b.id, type: 'frame', x: 100 + fromIdx * (SLIDE_SIZE.w + SLIDE_GAP), meta: { ...b.meta, slideIndex: fromIdx }, props: { ...b.props, name: `幻灯片 ${fromIdx + 1}` } })
    })
    setTimeout(refreshSlides, 100)
  }, [editor, slides, refreshSlides])

  useEffect(() => {
    if (!editor || slides.length === 0) return
    if (!currentSlideId || !slides.find(s => s.id === currentSlideId)) {
      focusSlide(slides[0].id)
    }
  }, [editor, slides, currentSlideId, focusSlide])

  return (
    <div className="flex flex-col h-full">
      <PptToolbar editor={editor!} />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative bg-gray-300">
          <Tldraw key={whiteboardId} store={store} hideUi licenseKey="temporary" onMount={(ed) => setEditor(ed)} />
          {slides.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="text-center text-gray-500 bg-white/80 rounded-xl p-8 shadow-sm">
                <Presentation size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg mb-2">创建你的第一张幻灯片</p>
                <button onClick={() => addSlide()} className="pointer-events-auto px-4 py-2 bg-bindle-500 text-white rounded-lg text-sm hover:bg-bindle-600">
                  <Plus size={14} className="inline mr-1" />新建幻灯片
                </button>
              </div>
            </div>
          )}
        </div>

        {hasSelection && <SelectedPropsPanel editor={editor} />}
      </div>

      <SlideStrip
        editor={editor}
        slides={slides}
        currentSlideId={currentSlideId}
        onFocus={focusSlide}
        onAdd={() => addSlide()}
        onDelete={deleteSlide}
        onDuplicate={duplicateSlide}
        onMove={moveSlide}
      />
    </div>
  )
}
