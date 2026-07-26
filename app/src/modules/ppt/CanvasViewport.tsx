import { useCallback, useRef, useEffect, useState } from 'react'
import { usePptStore, getIsResizing } from './store'
import { CanvasElementView } from './CanvasElement'
import { ElementHandles } from './ElementHandles'
import { SLIDE_W, SLIDE_H, type CanvasElement } from './types'

export function CanvasViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { slides, currentSlideId, selectedIds, zoom, panX, panY, transitioning, guideLines, setZoom, setPan: storeSetPan, deleteElements } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)
  const [, forceUpdate] = useState(0)
  const panRef = useRef({ x: panX, y: panY })

  // Sync store pan -> ref when transitioning (for resetView)
  useEffect(() => {
    if (transitioning) {
      panRef.current = { x: panX, y: panY }
      forceUpdate(n => n + 1)
    }
  }, [transitioning, panX, panY])
  const marqueeRef = useRef<{ sx: number; sy: number; ex: number; ey: number } | null>(null)
  const [, setMarqueeTick] = useState(0)

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
      if (!e.ctrlKey) return
      e.preventDefault(); e.stopPropagation()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left - rect.width / 2 - panRef.current.x
      const my = e.clientY - rect.top - rect.height / 2 - panRef.current.y
      const oldZoom = usePptStore.getState().zoom
      const newZoom = Math.max(0.25, Math.min(3, oldZoom - e.deltaY * 0.002))
        usePptStore.getState().setZoom(newZoom)
      const scale = newZoom / oldZoom
      const nx = mx - scale * mx + panRef.current.x
      const ny = my - scale * my + panRef.current.y
      setPan(nx, ny)
      storeSetPan(nx, ny)
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
      if (e.key === '0') { e.preventDefault(); setZoom(1); setPan(0, 0); storeSetPan(0, 0) }
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
    const onUp = () => { panning = false; el.style.cursor = ''; storeSetPan(panRef.current.x, panRef.current.y) }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, []) // no deps — uses refs

  // Click on empty canvas area → deselect (but not on panels / popovers / slide)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-canvas="bg"]')) return
      if (target.closest('[data-no-deselect]')) return
      if (target.closest('[data-panel="props"]')) return
      if (target.closest('[type="color"]')) return
      if (target.closest('[role="dialog"]')) return
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      const st = usePptStore.getState()
      if (st.selectedIds.length > 0) st.setSelectedIds([])
      if (st.selectedSlideIds.length > 0) usePptStore.setState({ selectedSlideIds: [] })
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  // Marquee selection
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let dragging = false
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      const st = usePptStore.getState()
      // only start from canvas background, never from elements or handles
      if (getIsResizing()) return
      // check if the click is on the background (not on any positioned element)
      const onBg = target.closest('[data-canvas="bg"]')
      const onEl = target.closest('[data-el-id]') || target.closest('[data-handle]')
      // also check for any absolutely-positioned element between target and bg
      let insideEl = false
      let node: HTMLElement | null = target
      while (node && node !== el) {
        if (node.style.position === 'absolute' && node !== target) { insideEl = true; break }
        node = node.parentElement
      }
      if (!onBg) return
      if (onEl || insideEl) return
      if (target.closest('[data-canvas="bg"]') || target === el || el.contains(target)) {
        dragging = true
        const rect = el.getBoundingClientRect()
        marqueeRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, ex: e.clientX - rect.left, ey: e.clientY - rect.top }
        setMarqueeTick(t => t + 1)
      }
    }
    const onMove = (e: MouseEvent) => {
      if (!dragging || !marqueeRef.current) return
      const rect = el.getBoundingClientRect()
      marqueeRef.current.ex = e.clientX - rect.left
      marqueeRef.current.ey = e.clientY - rect.top
      setMarqueeTick(t => t + 1)
    }
    const onUp = (e: MouseEvent) => {
      if (!dragging || !marqueeRef.current) { dragging = false; return }
      dragging = false
      const m = marqueeRef.current
      marqueeRef.current = null
      setMarqueeTick(t => t + 1)

      // compute selection in canvas coordinates
      const st = usePptStore.getState()
      const cSlide = st.slides.find(s => s.id === st.currentSlideId)
      if (!cSlide) return

      const containerRect = el.getBoundingClientRect()
      const z = st.zoom
      const px = containerRect.width / 2 + panRef.current.x
      const py = containerRect.height / 2 + panRef.current.y

      console.log('[marquee] screen:', { sx: m.sx, sy: m.sy, ex: m.ex, ey: m.ey }, 'cont:', containerRect.width, containerRect.height, 'pan:', panRef.current.x, panRef.current.y, 'zoom:', z)

      // marquee rect in screen coords relative to slide center
      const mx1 = m.sx - px
      const my1 = m.sy - py
      const mx2 = m.ex - px
      const my2 = m.ey - py

      // convert to canvas coords
      const x1 = Math.min(mx1, mx2) / z + SLIDE_W / 2
      const y1 = Math.min(my1, my2) / z + SLIDE_H / 2
      const x2 = Math.max(mx1, mx2) / z + SLIDE_W / 2
      const y2 = Math.max(my1, my2) / z + SLIDE_H / 2

      if (Math.abs(x2 - x1) < 3 && Math.abs(y2 - y1) < 3) {
        st.setSelectedIds([])
        usePptStore.setState({ selectedSlideIds: [] })
        return
      }

      const hitIds: string[] = []
      console.log('[marquee] elements count:', cSlide.elements.length, 'marquee canvas:', { x1, y1, x2, y2 })
      for (let i = 0; i < cSlide.elements.length; i++) {
        const el = cSlide.elements[i]
        const hit = el.x < x2 && el.x + el.w > x1 && el.y < y2 && el.y + el.h > y1
        console.log('[marquee] el', i, el.type, '@', el.x, el.y, el.w, el.h, 'hit=', hit)
        if (hit) hitIds.push(el.id)
      }
      if (e.shiftKey) {
        const prev = new Set(st.selectedIds)
        hitIds.forEach(id => prev.add(id))
        st.setSelectedIds([...prev])
      } else {
        st.setSelectedIds(hitIds)
      }
    }
    el.addEventListener('mousedown', onDown, true)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

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
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault()
        if (s.selectedIds.length > 0 && s.currentSlideId) s.copyElements()
        else s.copySlide()
      }
      if (e.ctrlKey && e.key === 'x' && s.currentSlideId) {
        e.preventDefault()
        if (s.selectedIds.length > 0) { s.copyElements(); s.deleteElements(s.currentSlideId, s.selectedIds) }
      }
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault()
        s.pasteElements().then(pasted => {
          if (!pasted) (window as any).__pptPasteImage?.()
        })
      }
      if (e.ctrlKey && e.key === 'g' && !e.shiftKey && s.currentSlideId) { e.preventDefault(); s.groupElements(s.currentSlideId, s.selectedIds) }
      if (e.ctrlKey && e.shiftKey && e.key === 'G' && s.currentSlideId) { e.preventDefault(); if (s.selectedIds.length === 1) s.ungroupElement(s.currentSlideId, s.selectedIds[0]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!slide) return null

  const selEls = selectedIds.map(id => slide.elements.find(e => e.id === id)).filter(Boolean) as any[]

  const m = marqueeRef.current
  const marqueeStyle = m ? {
    position: 'absolute' as const,
    left: Math.min(m.sx, m.ex),
    top: Math.min(m.sy, m.ey),
    width: Math.abs(m.ex - m.sx),
    height: Math.abs(m.ey - m.sy),
    border: '1px solid #3b82f6',
    background: 'rgba(59,130,246,0.08)',
    zIndex: 50,
    pointerEvents: 'none' as const,
  } : undefined

  // File drop → insert image
  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      const file = e.dataTransfer?.files?.[0]
      if (!file || !file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        const img = new Image()
        img.onload = () => {
          const ow = img.naturalWidth, oh = img.naturalHeight
          const maxW = SLIDE_W * 0.6, maxH = SLIDE_H * 0.6
          let w = ow, h = oh
          if (w > maxW) { h = h * (maxW / w); w = maxW }
          if (h > maxH) { w = w * (maxH / h); h = maxH }
          const st = usePptStore.getState()
          if (st.currentSlideId) {
            const id = crypto.randomUUID()
            st.addElement(st.currentSlideId, {
              id, type: 'image',
              x: (SLIDE_W - w) / 2, y: (SLIDE_H - h) / 2,
              w: Math.round(w), h: Math.round(h), opacity: 1,
              props: { src, origW: ow, origH: oh, imgScale: w / ow },
            })
          }
        }
        img.src = src
      }
      reader.readAsDataURL(file)
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => { document.removeEventListener('dragover', onDragOver); document.removeEventListener('drop', onDrop) }
  }, [])

  return (
    <div ref={containerRef}
      className="w-full h-full overflow-hidden flex items-center justify-center outline-none relative"
      style={{ cursor: 'default' }}
      tabIndex={0}
      onContextMenu={e => e.preventDefault()}
    >
      {marqueeStyle && <div style={marqueeStyle} />}
      <div
        data-canvas="bg"
        className="relative shadow-lg flex-shrink-0"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: '#ffffff',
          transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          transition: transitioning ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: slide.background || '#ffffff',
          opacity: slide.backgroundOpacity ?? 1,
        }} />
        {slide.elements.map(el => (
          <CanvasElementView key={el.id} element={el} isSelected={selectedIds.includes(el.id)} />
        ))}
        {selEls.length === 1 && selEls.map(el => (
          <ElementHandles key={`h-${el.id}`} element={el} zoom={zoom} />
        ))}
        {selEls.length > 1 && (
          <GroupBoundingBox elements={selEls} zoom={zoom} />
        )}
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

function GroupBoundingBox({ elements, zoom }: { elements: CanvasElement[]; zoom: number }) {
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0, els: [] as CanvasElement[] })
  const HS = 8, CS = 10

  if (elements.length === 0) return null
  const x1 = Math.min(...elements.map(e => e.x))
  const y1 = Math.min(...elements.map(e => e.y))
  const x2 = Math.max(...elements.map(e => e.x + e.w))
  const y2 = Math.max(...elements.map(e => e.y + e.h))
  const w = x2 - x1
  const h = y2 - y1

  const startResize = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    setActiveHandle(handle)
    usePptStore.getState().setResizing(true)
    ref.current = { mx: e.clientX, my: e.clientY, ox: x1, oy: y1, ow: w, oh: h, els: elements.map(el => ({...el})) }
  }, [x1, y1, w, h, elements])

  useEffect(() => {
    if (!activeHandle) return
    const st = usePptStore.getState()
    if (!st.currentSlideId) return
    const z = st.zoom || 1
    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - ref.current.mx) / z
      const dy = (e.clientY - ref.current.my) / z
      const { ox, oy, ow, oh, els } = ref.current
      if (ow === 0 || oh === 0) return

      let nx = ox, ny = oy, nw = ow, nh = oh
      switch (activeHandle) {
        case 'nw': nx = ox + dx; ny = oy + dy; nw = ow - dx; nh = oh - dy; break
        case 'ne': ny = oy + dy; nw = ow + dx; nh = oh - dy; break
        case 'sw': nx = ox + dx; nw = ow - dx; nh = oh + dy; break
        case 'se': nw = ow + dx; nh = oh + dy; break
        case 'n': ny = oy + dy; nh = oh - dy; break
        case 's': nh = oh + dy; break
        case 'w': nx = ox + dx; nw = ow - dx; break
        case 'e': nw = ow + dx; break
      }
      if (nw < 1) nw = 1
      if (nh < 1) nh = 1

      // lock aspect ratio for corner handles
      if (activeHandle.length === 2 && ow > 0 && oh > 0 && !e.shiftKey) {
        const aspect = ow / oh
        nh = nw / aspect
      }

      const sx = nw / ow
      const sy = nh / oh
      const slide = st.slides.find(s => s.id === st.currentSlideId)
      if (!slide) return

      for (const el of els) {
        const orig = elements.find(oe => oe.id === el.id)
        if (!orig) continue
        const relX = (orig.x - ox) * sx
        const relY = (orig.y - oy) * sy
        const newW = orig.w * sx
        const newH = orig.h * sy
        st.updateElement(st.currentSlideId, el.id, {
          x: Math.round(nx + relX),
          y: Math.round(ny + relY),
          w: Math.round(newW),
          h: Math.round(newH),
        })
      }
    }
    const onUp = () => { setActiveHandle(null); usePptStore.getState().setResizing(false) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [activeHandle])

  const hStyle = (pos: string): React.CSSProperties => {
    const isCorner = pos.length === 2
    const isH = pos === 'w' || pos === 'e'
    const isV = pos === 'n' || pos === 's'
    const s = 1 / zoom
    const cSize = (isCorner ? CS : HS) * s
    const barLen = (isV || isH ? 18 : cSize / s) * s
    return {
      position: 'absolute',
      background: '#3b82f6', border: `${2 * s}px solid white`,
      borderRadius: isCorner ? '50%' : `${3 * s}px`,
      cursor: isV ? 'ns-resize' : isH ? 'ew-resize' : pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize',
      width: isV ? barLen : cSize, height: isH ? barLen : cSize,
      ...(pos.includes('n') ? { top: -(cSize / 2) } : pos.includes('s') ? { bottom: -(cSize / 2) } : {}),
      ...(pos.includes('w') ? { left: -(cSize / 2) } : pos.includes('e') ? { right: -(cSize / 2) } : {}),
      ...(isV ? { left: '50%', marginLeft: -(barLen / 2) } : {}),
      ...(isH ? { top: '50%', marginTop: -(barLen / 2) } : {}),
    }
  }

  const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

  return (
    <div style={{ position: 'absolute', left: x1, top: y1, width: w, height: h, pointerEvents: 'none', zIndex: 2 }}>
      <div style={{ position: 'absolute', inset: `-${2 / zoom}px`, border: `${2 / zoom}px dashed rgba(59,130,246,0.6)`, pointerEvents: 'none' }} />
      {handles.map(p => (
        <div key={p} data-handle="" style={{ ...hStyle(p), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
