import { useCallback, useRef, useState, useEffect } from 'react'
import type { CanvasElement } from '../types'
import { usePptStore } from '../store'

export const SNAP = 6

export interface GuideLine { type: 'h' | 'v'; pos: number; start: number; end: number }

export interface EP { el: CanvasElement; isSelected: boolean }

// Element resize configuration — each element type defines its own behaviour
export interface ElementConfig {
  handles: string[]
  onResizeStart: (el: CanvasElement, handle: string, e: React.MouseEvent) => any
  onResizeMove: (state: any, el: CanvasElement, handle: string, dx: number, dy: number, shift: boolean) => Partial<CanvasElement>
  onResizeEnd?: (el: CanvasElement, state: any) => Partial<CanvasElement> | null
}

export function useDrag(elementId: string) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0, shift: false, alt: false, clonedId: '', groupIds: [] as string[], groupOrigins: [] as {id:string, x:number, y:number}[] })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const s = usePptStore.getState()
    if (e.shiftKey && !e.altKey) {
      s.setSelectedIds(s.selectedIds.includes(elementId) ? s.selectedIds : [...s.selectedIds, elementId])
    } else if (!e.shiftKey && !e.altKey) {
      if (s.selectedIds.length <= 1 || !s.selectedIds.includes(elementId)) {
        s.setSelectedIds([elementId])
      }
    } else if (e.altKey) {
      s.setSelectedIds([elementId])
    }
    setDragging(true)
    const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === elementId)
    ref.current = { mx: e.clientX, my: e.clientY, ox: el?.x ?? 0, oy: el?.y ?? 0, shift: e.shiftKey, alt: e.altKey, clonedId: '', groupIds: [], groupOrigins: [] }

    const gIds = s.selectedIds.length > 1 ? s.selectedIds : []
    if (gIds.length > 0 && s.selectedIds.includes(elementId) && !e.altKey) {
      const slide = s.slides.find(sl => sl.id === s.currentSlideId)
      const origins = slide ? slide.elements.filter(ee => gIds.includes(ee.id)).map(ee => ({ id: ee.id, x: ee.x, y: ee.y })) : []
      ref.current.groupIds = gIds
      ref.current.groupOrigins = origins
    }

    if (e.altKey && s.currentSlideId && el) {
      const slide = s.slides.find(sl => sl.id === s.currentSlideId)
      if (!slide) return
      if (gIds.length > 0) {
        const clones: CanvasElement[] = []
        const idMap = new Map<string, string>()
        for (const id of gIds) {
          const orig = slide.elements.find(ee => ee.id === id)
          if (orig) {
            const cid = crypto.randomUUID()
            clones.push({ ...orig, id: cid, x: orig.x + (e.shiftKey ? 0 : 20), y: orig.y + (e.shiftKey ? 0 : 20) })
            idMap.set(id, cid)
          }
        }
        clones.forEach(c => s.addElement(s.currentSlideId!, c))
        const cloneIds = clones.map(c => c.id)
        s.setSelectedIds(cloneIds)
        const origins = clones.map(c => ({ id: c.id, x: c.x, y: c.y }))
        ref.current.groupIds = cloneIds
        ref.current.groupOrigins = origins
        ref.current.ox = clones[0].x; ref.current.oy = clones[0].y
      } else {
        const clone: CanvasElement = { ...el, id: crypto.randomUUID(), x: el.x + (e.shiftKey ? 0 : 20), y: el.y + (e.shiftKey ? 0 : 20) }
        s.addElement(s.currentSlideId, clone)
        ref.current.clonedId = clone.id; ref.current.ox = clone.x; ref.current.oy = clone.y
      }
    }
  }, [elementId])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const z = s.zoom || 1
      let dx = (e.clientX - ref.current.mx) / z
      let dy = (e.clientY - ref.current.my) / z
      if (ref.current.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }

      if (ref.current.groupIds.length > 0) {
        for (const { id, x, y } of ref.current.groupOrigins) {
          const nx = Math.round(x + dx), ny = Math.round(y + dy)
          const el = document.querySelector<HTMLElement>(`[data-el-id="${id}"]`)
          if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px' }
          // Also move handles wrapper for this element
          const hEl = document.querySelector<HTMLElement>(`[data-handles-el-id="${id}"]`)
          if (hEl) { hEl.style.left = nx + 'px'; hEl.style.top = ny + 'px' }
        }
        usePptStore.getState().setGuideLines([])
        return
      }

      const tid = ref.current.clonedId || elementId
      let nx = Math.round(ref.current.ox + dx), ny = Math.round(ref.current.oy + dy)

      const slide = s.slides.find(sl => sl.id === s.currentSlideId)
      const dragEl = slide?.elements.find(ee => ee.id === tid)
      if (dragEl && slide) {
        const others = slide.elements.filter(ee => ee.id !== tid)
        const snapped = snapPos({ ...dragEl, x: nx, y: ny }, others, nx, ny)
        nx = snapped.x
        ny = snapped.y
      }

      const el = document.querySelector<HTMLElement>(`[data-el-id="${tid}"]`)
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px' }
      const hEl = document.querySelector<HTMLElement>(`[data-handles-el-id="${tid}"]`)
      if (hEl) { hEl.style.left = nx + 'px'; hEl.style.top = ny + 'px' }
    }
    const onUp = () => {
      setDragging(false)
      usePptStore.getState().setGuideLines([])
      // Commit final position to store
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      if (ref.current.groupIds.length > 0) {
        for (const { id } of ref.current.groupOrigins) {
          const el = document.querySelector<HTMLElement>(`[data-el-id="${id}"]`)
          if (el) {
            s.updateElement(s.currentSlideId, id, { x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0 })
          }
        }
      } else {
        const tid = ref.current.clonedId || elementId
        const el = document.querySelector<HTMLElement>(`[data-el-id="${tid}"]`)
        if (el) {
          s.updateElement(s.currentSlideId, tid, { x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0 })
        }
      }
    }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, elementId])

  return { onMouseDown, dragging }
}

export function snapPos(el: CanvasElement, others: CanvasElement[], x: number, y: number, movingEdge?: string) {
  const elx = x, ely = y, erx = x + el.w, eby = y + el.h, ecx = x + el.w / 2, ecy = y + el.h / 2
  let sx = x, sy = y, sex = erx, sey = eby
  const guides: GuideLine[] = []
  let bestXD = SNAP + 1, bestYD = SNAP + 1
  const snX = (dist: number, fn: () => void) => { if (dist < SNAP) { fn(); if (dist < bestXD) bestXD = dist } }
  const snY = (dist: number, fn: () => void) => { if (dist < SNAP) { fn(); if (dist < bestYD) bestYD = dist } }
  const isEdgeX = movingEdge === 'w' || movingEdge === 'e'
  const isEdgeY = movingEdge === 'n' || movingEdge === 's'
  const doCenter = !movingEdge || movingEdge.length === 2
  const movingLeft = !movingEdge || movingEdge === 'w' || movingEdge === 'nw' || movingEdge === 'sw'
  const movingRight = !movingEdge || movingEdge === 'e' || movingEdge === 'ne' || movingEdge === 'se'
  const movingTop = !movingEdge || movingEdge === 'n' || movingEdge === 'nw' || movingEdge === 'ne'
  const movingBottom = !movingEdge || movingEdge === 's' || movingEdge === 'sw' || movingEdge === 'se'

  if (doCenter) {
    snX(Math.abs(ecx - 640), () => { sx = 640 - el.w / 2; sex = 640 + el.w / 2; guides.push({ type: 'v', pos: 640, start: 0, end: 720 }) })
    snY(Math.abs(ecy - 360), () => { sy = 360 - el.h / 2; sey = 360 + el.h / 2; guides.push({ type: 'h', pos: 360, start: 0, end: 1280 }) })
  }
  for (const o of others) {
    const ocx = o.x + o.w / 2, ocy = o.y + o.h / 2
    const oxr = o.x + o.w, oyb = o.y + o.h
    if (movingLeft) snX(Math.abs(elx - o.x), () => { sx = o.x; sex = o.x + el.w; guides.push({ type: 'v', pos: o.x, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) })
    if (movingRight) snX(Math.abs(erx - oxr), () => { sx = oxr - el.w; sex = oxr; guides.push({ type: 'v', pos: oxr, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) })
    if (doCenter) snX(Math.abs(ecx - ocx), () => { sx = ocx - el.w / 2; sex = ocx + el.w / 2; guides.push({ type: 'v', pos: ocx, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) })
    if (movingTop) snY(Math.abs(ely - o.y), () => { sy = o.y; sey = o.y + el.h; guides.push({ type: 'h', pos: o.y, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) })
    if (movingBottom) snY(Math.abs(eby - oyb), () => { sy = oyb - el.h; sey = oyb; guides.push({ type: 'h', pos: oyb, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) })
    if (doCenter) snY(Math.abs(ecy - ocy), () => { sy = ocy - el.h / 2; sey = ocy + el.h / 2; guides.push({ type: 'h', pos: ocy, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) })
  }
  usePptStore.getState().setGuideLines(guides)
  return { x: Math.round(sx), y: Math.round(sy), erx: Math.round(sex), eby: Math.round(sey) }
}

export function ArrowHd(x1: number, y1: number, x2: number, y2: number, shape: string | undefined, color: string, sw: number) {
  if (!shape || shape === 'none') return null
  const size = sw * 5, dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len, cx = x2, cy = y2
  if (shape === 'arrow') { const p = size * .5; return <polygon points={`${cx + size * ux},${cy + size * uy} ${cx - uy * p},${cy + ux * p} ${cx + uy * p},${cy - ux * p}`} fill={color} /> }
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={size * .4} fill={color} />
  if (shape === 'square') return <rect x={cx - size * .4} y={cy - size * .4} width={size * .8} height={size * .8} fill='none' stroke={color} strokeWidth={sw} />
  return null
}

export function shadowStyle(p: CanvasElement['props']): string | undefined {
  if (p.shadows && p.shadows.length > 0) {
    return p.shadows.map(s => `${s.x || 0}px ${s.y || 2}px ${s.blur}px ${s.color || 'rgba(0,0,0,0.15)'}`).join(', ')
  }
  if (p.shadowBlur && p.shadowBlur > 0) {
    return `${p.shadowX || 0}px ${p.shadowY || 2}px ${p.shadowBlur}px ${p.shadowColor || 'rgba(0,0,0,0.15)'}`
  }
  return undefined
}
