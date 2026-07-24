import { useCallback, useRef, useState, useEffect } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

const SNAP = 6

interface GuideLine { type: 'h' | 'v'; pos: number; start: number; end: number }

function useDrag(elementId: string) {
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

    // group drag: if multi-selected, save all selected elements' origins
    const gIds = s.selectedIds.length > 1 ? s.selectedIds : []
    if (gIds.length > 0 && s.selectedIds.includes(elementId) && !e.altKey) {
      const slide = s.slides.find(sl => sl.id === s.currentSlideId)
      const origins = slide ? slide.elements.filter(ee => gIds.includes(ee.id)).map(ee => ({ id: ee.id, x: ee.x, y: ee.y })) : []
      ref.current.groupIds = gIds
      ref.current.groupOrigins = origins
    }

    // alt cloning: for group, clone all; for single, clone one
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
        // select all clones
        const cloneIds = clones.map(c => c.id)
        s.setSelectedIds(cloneIds)
        // update ref for group drag
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

      // group drag
      if (ref.current.groupIds.length > 0) {
        for (const { id, x, y } of ref.current.groupOrigins) {
          const nx = Math.round(x + dx), ny = Math.round(y + dy)
          s.updateElement(s.currentSlideId, id, { x: nx, y: ny })
        }
        usePptStore.getState().setGuideLines([]) // no snap for group
        return
      }

      // single drag
      const tid = ref.current.clonedId || elementId
      let nx = Math.round(ref.current.ox + dx); let ny = Math.round(ref.current.oy + dy)
      const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === tid)
      if (el) {
        const others = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.filter(ee => ee.id !== tid) || []
        const sn = snapPos(el, others, nx, ny); nx = sn.x; ny = sn.y
      }
      s.updateElement(s.currentSlideId, tid, { x: nx, y: ny })
    }
    const onUp = () => { setDragging(false); usePptStore.getState().setGuideLines([]) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, elementId])

  return { onMouseDown, dragging }
}

export { snapPos, SNAP }

function snapPos(el: CanvasElement, others: CanvasElement[], x: number, y: number, movingEdge?: string) {
  const elx = x, ely = y, erx = x + el.w, eby = y + el.h, ecx = x + el.w / 2, ecy = y + el.h / 2
  let sx = x, sy = y, sex = erx, sey = eby
  const guides: GuideLine[] = []
  let bestXD = SNAP + 1, bestYD = SNAP + 1
  // show all guides within SNAP, but snap to the closest one
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

// Arrow heads
function ArrowHd(x1: number, y1: number, x2: number, y2: number, shape: string | undefined, color: string, sw: number) {
  if (!shape || shape === 'none') return null
  const size = sw * 5, dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len, uy = dy / len, cx = x2, cy = y2
  if (shape === 'arrow') { const p = size * .5; return <polygon points={`${cx + size * ux},${cy + size * uy} ${cx - uy * p},${cy + ux * p} ${cx + uy * p},${cy - ux * p}`} fill={color} /> }
  if (shape === 'circle') return <circle cx={cx} cy={cy} r={size * .4} fill={color} />
  if (shape === 'square') return <rect x={cx - size * .4} y={cy - size * .4} width={size * .8} height={size * .8} fill='none' stroke={color} strokeWidth={sw} />
  return null
}

function shadowStyle(p: CanvasElement['props']): string | undefined {
  if (p.shadows && p.shadows.length > 0) {
    return p.shadows.map(s => `${s.x || 0}px ${s.y || 2}px ${s.blur}px ${s.color || 'rgba(0,0,0,0.15)'}`).join(', ')
  }
  // legacy single shadow
  if (p.shadowBlur && p.shadowBlur > 0) {
    return `${p.shadowX || 0}px ${p.shadowY || 2}px ${p.shadowBlur}px ${p.shadowColor || 'rgba(0,0,0,0.15)'}`
  }
  return undefined
}

// Element renderers
interface EP { el: CanvasElement; isSelected: boolean }

function ImageEl({ el, isSelected }: EP) {
  const { onMouseDown } = useDrag(el.id)
  return <img src={el.props.src || ''} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px', zIndex: isSelected ? 1 : 0 }} onMouseDown={onMouseDown} draggable={false} />
}

function TextEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const ss = shadowStyle(el.props)
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, fontSize: el.props.fontSize || 16, color: el.props.fontColor || '#333', fontWeight: el.props.fontWeight || 'normal', padding: 8, overflow: 'hidden', whiteSpace: 'pre-wrap', cursor: dragging ? 'grabbing' : 'text', boxShadow: ss, outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px', zIndex: isSelected ? 1 : 0 }} onMouseDown={onMouseDown} contentEditable={isSelected} suppressContentEditableWarning onBlur={e => { const s = usePptStore.getState(); if (s.currentSlideId) s.updateElement(s.currentSlideId, el.id, { props: { ...el.props, text: e.currentTarget.textContent || '' } }) }}>{el.props.text || '双击编辑文本'}</div>
}

function EllipseEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, cursor: dragging ? 'grabbing' : 'default', outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px', zIndex: isSelected ? 1 : 0 }} onMouseDown={onMouseDown} />
}

function ArrowEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const sw = el.props.strokeWidth || 2, c = el.props.stroke || '#94a3b8', hs = sw * 5
  const x1 = el.props.startShape && el.props.startShape !== 'none' ? hs : 0
  const x2 = el.props.endShape && el.props.endShape !== 'none' ? el.w - hs : el.w
  return (
    <svg style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, overflow: 'visible', cursor: dragging ? 'grabbing' : 'default', opacity: el.opacity }} onMouseDown={onMouseDown}>
      <line x1={x1} y1={el.h / 2} x2={x2} y2={el.h / 2} stroke={c} strokeWidth={sw} />
      {ArrowHd(0, el.h / 2, el.w, el.h / 2, el.props.startShape, c, sw)}
      {ArrowHd(el.w, el.h / 2, 0, el.h / 2, el.props.endShape, c, sw)}
    </svg>
  )
}

function RectEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const br = el.props.borderRadius || 0
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`, background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, cursor: dragging ? 'grabbing' : 'default', outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px', zIndex: isSelected ? 1 : 0 }} onMouseDown={onMouseDown} />
}

export function CanvasElementView({ element, isSelected }: { element: CanvasElement; isSelected: boolean }) {
  const p: EP = { el: element, isSelected }
  switch (element.type) {
    case 'image': return <ImageEl {...p} />
    case 'text': return <TextEl {...p} />
    case 'ellipse': return <EllipseEl {...p} />
    case 'arrow': return <ArrowEl {...p} />
    default: return <RectEl {...p} />
  }
}
