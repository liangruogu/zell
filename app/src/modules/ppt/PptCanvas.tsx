import { useEffect } from 'react'
import { PptToolbar } from './PptToolbar'
import { SlideStrip } from './SlideStrip'
import { CanvasViewport } from './CanvasViewport'
import { PropsPanel } from './PropsPanel'
import { PreviewButton } from './SlidePreview'
import { usePptStore } from './store'
import type { PptData } from './types'
import { Presentation, Plus, Crosshair } from 'lucide-react'

interface PptCanvasProps {
  data: PptData | null
  onDataChange: (data: PptData) => void
}

export function PptCanvas({ data, onDataChange }: PptCanvasProps) {
  const { slides, currentSlideId, init, getData, addSlide, zoom, setZoom } = usePptStore()

  useEffect(() => { if (data) init(data) }, [data])

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
              <button onClick={() => addSlide()} className="px-4 py-2 bg-bindle-500 text-white rounded-lg text-sm hover:bg-bindle-600">
                <Plus size={14} className="inline mr-1" />新建幻灯片
              </button>
            </div>
          )}
        </div>
        <PropsPanel />
      </div>
      {hasSlides && (
        <div className="absolute bottom-[128px] left-1/2 -translate-x-1/2 z-50">
          <PptToolbar />
        </div>
      )}
      {hasSlides && <SlideStrip />}
    </div>
  )
}
