import { useCallback, useRef, useEffect, useState } from 'react'
import { usePptStore } from './store'
import { CanvasElementView } from './CanvasElement'
import { ElementHandles } from './ElementHandles'
import { SLIDE_W, SLIDE_H } from './types'

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { slides, currentSlideId, selectedIds, zoom, guideLines, setZoom, deleteElements } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)
  const [, forceUpdate] = useState(0)
  const panRef = useRef({ x: 0, y: 0 })

  const setPan = useCallback((x: number, y: number) => {
    panRef.current = { x, y }
    forceUpdate(n => n + 1)
  }, [])

  // Ctrl key cursor feedback
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && containerRef.current) {
        containerRef.current.style.cursor = 'zoom-in'
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' && containerRef.current) {
        containerRef.current.style.cursor = ''
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  // Ctrl+wheel zoom at mouse position
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); e.stopPropagation()
        const rect = el.getBoundingClientRect()
        const mx = e.clientX - rect.left - rect.width / 2 - panRef.current.x
        const my = e.clientY - rect.top - rect.height / 2 - panRef.current.y
        const oldZoom = usePptStore.getState().zoom
        const newZoom = Math.max(0.25, Math.min(3, oldZoom + (e.deltaY > 0 ? -0.1 : 0.1)))
        usePptStore.getState().setZoom(newZoom)
      const scale = newZoom / oldZoom
      setPan(mx - scale * mx + panRef.current.x, my - scale * my + panRef.current.y)
      }
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
      if (e.key === '0') { e.preventDefault(); setZoom(1); setPan(0, 0) }
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
      e.preventDefault(); e.stopPropagation()
      panning = true; sx = e.clientX; sy = e.clientY
      spx = panRef.current.x; spy = panRef.current.y
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!panning) return
      setPan(spx + e.clientX - sx, spy + e.clientY - sy)
    }
    const onUp = () => { panning = false; el.style.cursor = '' }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, []) // no deps — uses refs

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas === 'bg') {
      usePptStore.getState().setSelectedIds([])
      usePptStore.setState({ selectedSlideIds: [] })
    }
  }, [])

  // Delete + Undo/Redo keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept when editing text/inputs
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      const s = usePptStore.getState()
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedSlideIds.length > 0) { e.preventDefault(); s.deleteSlides(s.selectedSlideIds) }
        else if (s.selectedIds.length > 0 && s.currentSlideId) { e.preventDefault(); s.deleteElements(s.currentSlideId, s.selectedIds) }
      }
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); s.undo() }
      if (e.ctrlKey && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); s.redo() }
      if (e.ctrlKey && e.key === 'c') { e.preventDefault(); s.copySlide() }
      if (e.ctrlKey && e.key === 'v') { e.preventDefault(); s.pasteSlide() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!slide) return null

  const selEls = selectedIds.map(id => slide.elements.find(e => e.id === id)).filter(Boolean) as any[]

  return (
    <div ref={containerRef}
      className="w-full h-full overflow-hidden flex items-center justify-center outline-none"
      style={{ cursor: 'default' }}
      onMouseDown={handleCanvasClick} tabIndex={0}
      onContextMenu={e => e.preventDefault()}
    >
      <div
        data-canvas="bg"
        className="relative shadow-lg flex-shrink-0"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background || '#ffffff',
          transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        {slide.elements.map(el => (
          <CanvasElementView key={el.id} element={el} isSelected={selectedIds.includes(el.id)} />
        ))}
        {selEls.map(el => (
          <ElementHandles key={`h-${el.id}`} element={el} />
        ))}
        {/* Guide lines */}
        {guideLines.length > 0 && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 99 }}>
            {guideLines.map((g, i) => (
              <line
                key={i}
                x1={g.type === 'v' ? g.pos : g.start} y1={g.type === 'h' ? g.pos : g.start}
                x2={g.type === 'v' ? g.pos : g.end} y2={g.type === 'h' ? g.pos : g.end}
                stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
