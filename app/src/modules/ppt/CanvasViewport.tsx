import { useCallback, useRef, useEffect } from 'react'
import { usePptStore } from './store'
import { CanvasElementView } from './CanvasElement'
import { ElementHandles } from './ElementHandles'
import { SLIDE_W, SLIDE_H } from './types'

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { slides, currentSlideId, selectedIds, zoom, setZoom, deleteElements } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      usePptStore.getState().setZoom(usePptStore.getState().zoom + delta)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Ctrl+/- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + 0.1) }
      if (e.key === '-') { e.preventDefault(); setZoom(zoom - 0.1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, setZoom])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas === 'bg') {
      usePptStore.getState().setSelectedIds([])
    }
  }, [])

  // Delete key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = usePptStore.getState()
        if (s.selectedIds.length > 0 && s.currentSlideId) {
          s.deleteElements(s.currentSlideId, s.selectedIds)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!slide) return null

  const selEls = selectedIds.map(id => slide.elements.find(e => e.id === id)).filter(Boolean) as any[]

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center overflow-hidden"
      onMouseDown={handleCanvasClick}
      tabIndex={0}
    >
      <div
        data-canvas="bg"
        className="relative shadow-lg flex-shrink-0"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background || '#ffffff',
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {slide.elements.map(el => (
          <CanvasElementView key={el.id} element={el} isSelected={selectedIds.includes(el.id)} />
        ))}
        {selEls.map(el => (
          <ElementHandles key={`h-${el.id}`} element={el} />
        ))}
      </div>
    </div>
  )
}
