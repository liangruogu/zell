import { useCallback, useRef, useState, useEffect } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

// Shared drag hook
function useDrag(elementId: string) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const s = usePptStore.getState()
    s.setSelectedIds(e.shiftKey ? (s.selectedIds.includes(elementId) ? s.selectedIds.filter(id => id !== elementId) : [...s.selectedIds, elementId]) : [elementId])
    setDragging(true)
    const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === elementId)
    if (el) ref.current = { mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y }
  }, [elementId])

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const z = s.zoom || 1
      s.updateElement(s.currentSlideId, elementId, {
        x: Math.round(ref.current.ox + (e.clientX - ref.current.mx) / z),
        y: Math.round(ref.current.oy + (e.clientY - ref.current.my) / z),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, elementId])

  return { onMouseDown, dragging }
}

// Arrow SVG
function renderArrowHead(x1: number, y1: number, x2: number, y2: number, shape: string | undefined, color: string, sw: number, isEnd: boolean) {
  if (!shape || shape === 'none') return null
  const size = sw * 5
  const dx = x2 - x1; const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len; const uy = dy / len
  // Arrow tip goes beyond the endpoint
  const tipX = isEnd ? x2 + size * ux : x1 - size * ux
  const tipY = isEnd ? y2 + size * uy : y1 - size * uy
  const baseX = isEnd ? x2 : x1
  const baseY = isEnd ? y2 : y1

  if (shape === 'arrow') {
    const px = -uy * size * 0.5; const py = ux * size * 0.5
    return <polygon points={`${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`} fill={color} />
  }
  if (shape === 'circle') {
    return <circle cx={baseX} cy={baseY} r={size * 0.4} fill={color} />
  }
  if (shape === 'square') {
    const px = -uy * size * 0.4; const py = ux * size * 0.4
    return <rect x={baseX + px - size * 0.4} y={baseY + py - size * 0.4} width={size * 0.8} height={size * 0.8} fill='none' stroke={color} strokeWidth={sw} />
  }
  return null
}

// ---- Element renderers ----

interface EProps { el: CanvasElement; isSelected: boolean }

function ImageEl({ el }: EProps) {
  const { onMouseDown } = useDrag(el.id)
  return <img src={el.props.src || ''} alt="" style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity }} onMouseDown={onMouseDown} draggable={false} />
}

function TextEl({ el, isSelected }: EProps) {
  const { onMouseDown } = useDrag(el.id)
  return (
    <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, fontSize: el.props.fontSize || 16, color: el.props.fontColor || '#333', fontWeight: el.props.fontWeight || 'normal', padding: '8px', overflow: 'hidden', whiteSpace: 'pre-wrap', cursor: 'grab' }}
      onMouseDown={onMouseDown} contentEditable={isSelected} suppressContentEditableWarning
      onBlur={e => { const s = usePptStore.getState(); if (s.currentSlideId) s.updateElement(s.currentSlideId, el.id, { props: { ...el.props, text: e.currentTarget.textContent || '' } }) }}>
      {el.props.text || '双击编辑文本'}
    </div>
  )
}

function EllipseEl({ el }: EProps) {
  const { onMouseDown } = useDrag(el.id)
  return <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: el.props.stroke ? `${el.props.strokeWidth || 1}px solid ${el.props.stroke}` : 'none', cursor: 'grab' }} onMouseDown={onMouseDown} />
}

function ArrowEl({ el }: EProps) {
  const { onMouseDown } = useDrag(el.id)
  const sw = el.props.strokeWidth || 2; const color = el.props.stroke || '#94a3b8'
  return (
    <svg style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, overflow: 'visible', cursor: 'grab' }} onMouseDown={onMouseDown}>
      <line x1={0} y1={el.h / 2} x2={el.w} y2={el.h / 2} stroke={color} strokeWidth={sw} />
      {renderArrowHead(0, el.h / 2, el.w, el.h / 2, el.props.startShape, color, sw, false)}
      {renderArrowHead(el.w, el.h / 2, 0, el.h / 2, el.props.endShape, color, sw, true)}
    </svg>
  )
}

function RectEl({ el }: EProps) {
  const { onMouseDown } = useDrag(el.id)
  const br = el.props.borderRadius || 0
  return (
    <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity,
      borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`,
      background: el.props.fill || '#e2e8f0', border: el.props.stroke ? `${el.props.strokeWidth || 1}px solid ${el.props.stroke}` : '1px solid #cbd5e1', cursor: 'grab' }}
      onMouseDown={onMouseDown} />
  )
}

// ---- Main renderer ----

interface Props { element: CanvasElement; isSelected: boolean }

export function CanvasElementView({ element, isSelected }: Props) {
  const p: EProps = { el: element, isSelected }
  switch (element.type) {
    case 'image': return <ImageEl {...p} />
    case 'text': return <TextEl {...p} />
    case 'ellipse': return <EllipseEl {...p} />
    case 'arrow': return <ArrowEl {...p} />
    default: return <RectEl {...p} />
  }
}
