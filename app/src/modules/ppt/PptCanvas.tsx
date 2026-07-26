import { useEffect } from 'react'
import { PptToolbar } from './PptToolbar'
import { SlideStrip } from './SlideStrip'
import { CanvasViewport } from './CanvasViewport'
import { PropsPanel } from './PropsPanel'
import { PreviewButton } from './SlidePreview'
import { usePptStore } from './store'
import { SLIDE_W, SLIDE_H, type PptData } from './types'
import { Presentation, Plus, Crosshair } from 'lucide-react'

interface PptCanvasProps {
  data: PptData | null
  onDataChange: (data: PptData) => void
}

export function PptCanvas({ data, onDataChange }: PptCanvasProps) {
  const { slides, currentSlideId, init, getData, addSlide, addElement, _previewing } = usePptStore()

  useEffect(() => { if (data) init(data) }, [data])

  // Ctrl+V paste image via contenteditable
  useEffect(() => {
    const insertImage = (src: string) => {
      const img = new Image()
      img.onload = () => {
        const ow = img.naturalWidth, oh = img.naturalHeight
        const maxW = SLIDE_W * 0.6, maxH = SLIDE_H * 0.6
        let w = ow, h = oh
        if (w > maxW) { h = h * (maxW / w); w = maxW }
        if (h > maxH) { w = w * (maxH / h); h = maxH }
        const st = usePptStore.getState()
        if (st.currentSlideId && ow > 0) {
          st.addElement(st.currentSlideId, {
            id: crypto.randomUUID(), type: 'image',
            x: (SLIDE_W - w) / 2, y: (SLIDE_H - h) / 2,
            w: Math.round(w), h: Math.round(h), opacity: 1,
            props: { src, origW: ow, origH: oh, imgScale: w / ow },
          })
        }
      }
      img.src = src
    }

    const onPaste = async (e: ClipboardEvent) => {
      if ((e.target as HTMLElement)?.isContentEditable || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      // Try navigator.clipboard.read first (no focus change needed)
      try {
        const items = await navigator.clipboard.read()
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type)
              const reader = new FileReader()
              reader.onload = (ev) => { const src = ev.target?.result as string; if (src) insertImage(src) }
              reader.readAsDataURL(blob)
              e.preventDefault()
              return
            }
          }
        }
      } catch {
        // Fallback: check clipboardData for file items
        const items2 = e.clipboardData?.items
        if (!items2) return
        for (let i = 0; i < items2.length; i++) {
          if (items2[i].type.startsWith('image/')) {
            e.preventDefault()
            const blob = items2[i].getAsFile()
            if (blob) {
              const reader = new FileReader()
              reader.onload = (ev) => { const src = ev.target?.result as string; if (src) insertImage(src) }
              reader.readAsDataURL(blob)
              return
            }
          }
        }
      }
    }

    document.addEventListener('paste', onPaste)
    return () => { document.removeEventListener('paste', onPaste) }
  }, [])

  useEffect(() => {
    if (slides.length === 0) return
    const timer = setTimeout(() => onDataChange(getData()), 300)
    return () => clearTimeout(timer)
  }, [slides, currentSlideId])

  const hasSlides = slides.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 min-w-0 flex items-center justify-center bg-gray-100 relative">
          {hasSlides ? (
            <>
              <CanvasViewport />
              <div className="absolute bottom-3 right-3 z-50 flex gap-2">
                <button onClick={() => usePptStore.getState().resetView()} className="p-2 bg-white/80 backdrop-blur rounded-lg shadow hover:bg-white hover:scale-110 transition cursor-pointer" title="重置视图">
                  <Crosshair size={16} className="text-gray-600" />
                </button>
                <PreviewButton />
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500">
              <Presentation size={48} strokeWidth={1} className="mx-auto mb-3" />
              <p className="text-lg mb-2">创建你的第一张幻灯片</p>
              <button onClick={() => addSlide()} className="px-4 py-2 bg-zell-500 text-white rounded-lg text-sm hover:bg-zell-600">
                <Plus size={14} className="inline mr-1" />新建幻灯片              </button>
            </div>
          )}
        </div>
        <PropsPanel />
      </div>
      {hasSlides && !_previewing && (
        <div className="absolute bottom-[128px] left-1/2 -translate-x-1/2 z-50">
          <PptToolbar />
        </div>
      )}
      {hasSlides && !_previewing && <SlideStrip />}
    </div>
  )
}
