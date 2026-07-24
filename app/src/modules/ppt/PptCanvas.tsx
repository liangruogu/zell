import { useEffect, useState, useCallback } from 'react'
import { Tldraw, createShapeId, type Editor, type TLStore } from 'tldraw'
import 'tldraw/tldraw.css'
import { PptToolbar } from './PptToolbar'
import { SlideStrip } from './SlideStrip'
import { getSlideMeta, SLIDE_SIZE, SLIDE_GAP } from './types'
import { Presentation, Plus } from 'lucide-react'

interface PptCanvasProps {
  store: TLStore
  whiteboardId: string
}

export function PptCanvas({ store, whiteboardId }: PptCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [slides, setSlides] = useState<any[]>([])
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null)

  const refreshSlides = useCallback(() => {
    if (!editor) return
    const shapes = editor.getCurrentPageShapes()
      .filter((s: any) => s.type === 'frame' && s.meta?.slideType === 'slide')
      .sort((a: any, b: any) => ((a.meta?.slideIndex as number) ?? 0) - ((b.meta?.slideIndex as number) ?? 0))
    setSlides(shapes)
  }, [editor])

  // Listen for store changes
  useEffect(() => {
    if (!editor) return
    const unsub = editor.store.listen(refreshSlides)
    refreshSlides()
    return () => unsub()
  }, [editor, refreshSlides])

  const focusSlide = useCallback((slideId: string) => {
    if (!editor) return
    setCurrentSlideId(slideId)
    const shape = editor.getShape(slideId)
    if (!shape) return
    editor.setCameraOptions({
      constraints: {
        initialZoom: 'fit-max',
        baseZoom: 'fit-max',
        bounds: { x: shape.x - 60, y: shape.y - 60, w: shape.props.w + 120, h: shape.props.h + 120 },
        behavior: 'contain',
        origin: { x: 0.5, y: 0.5 },
        padding: { x: 20, y: 20 },
      },
    })
    editor.zoomToBounds(
      { x: shape.x - 60, y: shape.y - 60, w: shape.props.w + 120, h: shape.props.h + 120 },
      { animation: { duration: 250 } }
    )
  }, [editor])

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
    // Shift subsequent slides
    if (afterIndex !== undefined) {
      setTimeout(() => {
        const all = editor.getCurrentPageShapes()
          .filter((s: any) => s.type === 'frame' && s.meta?.slideType === 'slide')
        for (let j = idx + 1; j <= slides.length; j++) {
          const s = all.find((a: any) => a.meta?.slideIndex === j)
          if (s) {
            editor.updateShape({
              id: s.id,
              type: 'frame',
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

  // Auto-select first slide
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
        {/* Canvas */}
        <div className="flex-1 relative bg-gray-300">
          <Tldraw key={whiteboardId} store={store} hideUi onMount={(ed) => setEditor(ed)} />
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

        {/* Properties panel */}
        <div className="w-48 border-l border-gray-200 bg-white shrink-0 p-3">
          <p className="text-xs text-gray-400 text-center pt-4">
            {currentSlideId ? '选中元素后可编辑属性' : '点击幻灯片开始编辑'}
          </p>
        </div>
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
