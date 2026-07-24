import { useCallback, useRef, useState, useEffect } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

const SNAP = 6

interface GuideLine { type: 'h' | 'v'; pos: number; start: number; end: number }

function useDrag(elementId: string) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0, shift: false, alt: false, clonedId: '' })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const s = usePptStore.getState()
    if (e.shiftKey && !e.altKey) {
      s.setSelectedIds(s.selectedIds.includes(elementId) ? s.selectedIds : [...s.selectedIds, elementId])
    } else if (!e.shiftKey) {
      s.setSelectedIds([elementId])
    }
    setDragging(true)
    const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === elementId)
    ref.current = { mx: e.clientX, my: e.clientY, ox: el?.x ?? 0, oy: el?.y ?? 0, shift: e.shiftKey, alt: e.altKey, clonedId: '' }

    if (e.altKey && s.currentSlideId && el) {
      const clone: CanvasElement = { ...el, id: crypto.randomUUID(), x: el.x + (e.shiftKey ? 0 : 20), y: el.y + (e.shiftKey ? 0 : 20) }
      s.addElement(s.currentSlideId, clone)
      ref.current.clonedId = clone.id; ref.current.ox = clone.x; ref.current.oy = clone.y
    }
  }, [elementId])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const z = s.zoom || 1; const tid = ref.current.clonedId || elementId
      let dx = (e.clientX - ref.current.mx) / z; let dy = (e.clientY - ref.current.my) / z
      if (ref.current.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
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

function snapPos(el: CanvasElement, others: CanvasElement[], x: number, y: number, axis?: 'x' | 'y') {
  const elx = x, ely = y, erx = x + el.w, eby = y + el.h, ecx = x + el.w / 2, ecy = y + el.h / 2
  let sx = x, sy = y
  const guides: GuideLine[] = []
  const doX = !axis || axis === 'x'
  const doY = !axis || axis === 'y'
  if (doX) {
    if (Math.abs(ecx - 640) < SNAP) { sx = 640 - el.w / 2; guides.push({ type: 'v', pos: 640, start: 0, end: 720 }) }
    for (const o of others) {
      const ocx = o.x + o.w / 2
      if (Math.abs(ecx - ocx) < SNAP) { sx = ocx - el.w / 2; guides.push({ type: 'v', pos: ocx, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) }
      if (Math.abs(elx - o.x) < SNAP) { sx = o.x; guides.push({ type: 'v', pos: o.x, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) }
      if (Math.abs(erx - (o.x + o.w)) < SNAP) { sx = o.x + o.w - el.w; guides.push({ type: 'v', pos: o.x + o.w, start: Math.min(y, o.y), end: Math.max(y + el.h, o.y + o.h) }) }
    }
  }
  if (doY) {
    if (Math.abs(ecy - 360) < SNAP) { sy = 360 - el.h / 2; guides.push({ type: 'h', pos: 360, start: 0, end: 1280 }) }
    for (const o of others) {
      const ocy = o.y + o.h / 2
      if (Math.abs(ecy - ocy) < SNAP) { sy = ocy - el.h / 2; guides.push({ type: 'h', pos: ocy, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) }
      if (Math.abs(ely - o.y) < SNAP) { sy = o.y; guides.push({ type: 'h', pos: o.y, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) }
      if (Math.abs(eby - (o.y + o.h)) < SNAP) { sy = o.y + o.h - el.h; guides.push({ type: 'h', pos: o.y + o.h, start: Math.min(x, o.x), end: Math.max(x + el.w, o.x + o.w) }) }
    }
  }
  usePptStore.getState().setGuideLines(guides)
  return { x: Math.round(sx), y: Math.round(sy) }
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

// Element renderers
interface EP { el: CanvasElement; isSelected: boolean }

function ImageEl({ el }: EP) {
  const { onMouseDown } = useDrag(el.id)
  return <img src={el.props.src || ''} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity }} onMouseDown={onMouseDown} draggable={false} />
}

function TextEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, fontSize: el.props.fontSize || 16, color: el.props.fontColor || '#333', fontWeight: el.props.fontWeight || 'normal', padding: 8, overflow: 'hidden', whiteSpace: 'pre-wrap', cursor: dragging ? 'grabbing' : 'text' }} onMouseDown={onMouseDown} contentEditable={isSelected} suppressContentEditableWarning onBlur={e => { const s = usePptStore.getState(); if (s.currentSlideId) s.updateElement(s.currentSlideId, el.id, { props: { ...el.props, text: e.currentTarget.textContent || '' } }) }}>{el.props.text || '双击编辑文本'}</div>
}

function EllipseEl({ el }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: el.props.stroke ? `${el.props.strokeWidth || 1}px solid ${el.props.stroke}` : 'none', cursor: dragging ? 'grabbing' : 'default' }} onMouseDown={onMouseDown} />
}

function ArrowEl({ el }: EP) {
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

function RectEl({ el }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const br = el.props.borderRadius || 0
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`, background: el.props.fill || '#e2e8f0', border: el.props.stroke ? `${el.props.strokeWidth || 1}px solid ${el.props.stroke}` : '1px solid #cbd5e1', cursor: dragging ? 'grabbing' : 'default' }} onMouseDown={onMouseDown} />
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
