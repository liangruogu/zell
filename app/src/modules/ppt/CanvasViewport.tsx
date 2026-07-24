import { useCallback, useRef, useEffect, useState } from 'react'
import { usePptStore } from './store'
import { CanvasElementView } from './CanvasElement'
import { ElementHandles } from './ElementHandles'
import { SLIDE_W, SLIDE_H } from './types'

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { slides, currentSlideId, selectedIds, zoom, setZoom, deleteElements } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)

  // Ctrl+wheel zoom at mouse position
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left - rect.width / 2 - panX
        const my = e.clientY - rect.top - rect.height / 2 - panY
        const oldZoom = usePptStore.getState().zoom
        const newZoom = Math.max(0.25, Math.min(3, oldZoom + (e.deltaY > 0 ? -0.1 : 0.1)))
        usePptStore.getState().setZoom(newZoom)
        const scale = newZoom / oldZoom
        setPanX(prev => mx - scale * mx + prev)
        setPanY(prev => my - scale * my + prev)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [panX, panY])

  // Ctrl+/- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom(zoom + 0.1) }
      if (e.key === '-') { e.preventDefault(); setZoom(zoom - 0.1) }
      if (e.key === '0') { e.preventDefault(); setZoom(1); setPanX(0); setPanY(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, setZoom])

  // Middle-button pan
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let panning = false, sx = 0, sy = 0, spx = 0, spy = 0
    const onDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      panning = true; sx = e.clientX; sy = e.clientY; spx = panX; spy = panY
    }
    const onMove = (e: MouseEvent) => {
      if (!panning) return
      setPanX(spx + e.clientX - sx)
      setPanY(spy + e.clientY - sy)
    }
    const onUp = () => { panning = false }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [panX, panY])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas === 'bg') {
      usePptStore.getState().setSelectedIds([])
    }
  }, [])

  // Delete + Undo/Redo keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = usePptStore.getState()
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedIds.length > 0 && s.currentSlideId) s.deleteElements(s.currentSlideId, s.selectedIds)
      }
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); s.undo() }
      if (e.ctrlKey && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); s.redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!slide) return null

  const selEls = selectedIds.map(id => slide.elements.find(e => e.id === id)).filter(Boolean) as any[]

  return (
    <div ref={containerRef}
      className="flex-1 overflow-auto flex items-center justify-center"
      style={{ cursor: 'default' }}
      onMouseDown={handleCanvasClick} tabIndex={0}
    >
      <div
        data-canvas="bg"
        className="relative shadow-lg flex-shrink-0"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background || '#ffffff',
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
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
