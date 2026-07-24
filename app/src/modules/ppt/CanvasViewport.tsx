import { useCallback, useRef } from 'react'
import { usePptStore } from './store'
import { CanvasElementView } from './CanvasElement'
import { cn } from '@/lib/utils'
import { SLIDE_W, SLIDE_H } from './types'

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { slides, currentSlideId, selectedIds, deleteElements } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas === 'bg') {
      usePptStore.getState().setSelectedIds([])
    }
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const store = usePptStore.getState()
      if (store.selectedIds.length > 0 && store.currentSlideId) {
        store.deleteElements(store.currentSlideId, store.selectedIds)
      }
    }
  }, [])

  if (!slide) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-300 text-gray-500">
        请选择一张幻灯片
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-gray-300 flex items-center justify-center overflow-hidden"
      onMouseDown={handleCanvasClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        data-canvas="bg"
        className="relative shadow-lg flex-shrink-0"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background || '#ffffff',
        }}
      >
        {slide.elements.map(el => (
          <CanvasElementView key={el.id} element={el} isSelected={selectedIds.includes(el.id)} />
        ))}
      </div>
    </div>
  )
}
