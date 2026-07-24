import { useEffect } from 'react'
import { PptToolbar } from './PptToolbar'
import { SlideStrip } from './SlideStrip'
import { CanvasViewport } from './CanvasViewport'
import { PropsPanel } from './PropsPanel'
import { usePptStore } from './store'
import type { PptData } from './types'
import { Presentation, Plus } from 'lucide-react'

interface PptCanvasProps {
  data: PptData | null
  onDataChange: (data: PptData) => void
}

export function PptCanvas({ data, onDataChange }: PptCanvasProps) {
  const { slides, currentSlideId, init, getData, addSlide } = usePptStore()

  useEffect(() => { if (data) init(data) }, [])

  useEffect(() => {
    if (slides.length === 0) return
    const timer = setTimeout(() => onDataChange(getData()), 300)
    return () => clearTimeout(timer)
  }, [slides, currentSlideId])

  const hasSlides = slides.length > 0

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex items-center justify-center bg-gray-200">
          {hasSlides ? (
            <CanvasViewport />
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
      {hasSlides && <PptToolbar />}
      {hasSlides && <SlideStrip />}
    </div>
  )
}
