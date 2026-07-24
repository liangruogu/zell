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
  const { slides, currentSlideId, init, getData, addSlide, selectedIds } = usePptStore()

  // Init from stored data
  useEffect(() => {
    if (data) init(data)
  }, [])

  // Auto-save on change
  useEffect(() => {
    if (slides.length === 0) return
    const timer = setTimeout(() => onDataChange(getData()), 300)
    return () => clearTimeout(timer)
  }, [slides, currentSlideId])

  const hasSlides = slides.length > 0
  const hasSelection = selectedIds.length === 1

  return (
    <div className="flex flex-col h-full">
      {hasSlides && <PptToolbar />}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          {hasSlides ? (
            <CanvasViewport />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-300 h-full">
              <div className="text-center text-gray-500">
                <Presentation size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg mb-2">创建你的第一张幻灯片</p>
                <button onClick={() => addSlide()} className="px-4 py-2 bg-bindle-500 text-white rounded-lg text-sm hover:bg-bindle-600">
                  <Plus size={14} className="inline mr-1" />新建幻灯片
                </button>
              </div>
            </div>
          )}
        </div>
        {hasSelection && <PropsPanel />}
      </div>
      {hasSlides && <SlideStrip />}
    </div>
  )
}
