import { useCallback, useRef, useState, useEffect } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

interface Props { element: CanvasElement; isSelected: boolean }

export function CanvasElementView({ element, isSelected }: Props) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const store = usePptStore.getState()
    if (!e.shiftKey) store.setSelectedIds([element.id])
    else {
      store.setSelectedIds(store.selectedIds.includes(element.id)
        ? store.selectedIds.filter(id => id !== element.id)
        : [...store.selectedIds, element.id])
    }
    setDragging(true)
    const el = store.slides.find(s => s.id === store.currentSlideId)?.elements.find(e => e.id === element.id)
    if (el) ref.current = { mx: e.clientX, my: e.clientY, ox: el.x, oy: el.y }
    else ref.current = { mx: e.clientX, my: e.clientY, ox: element.x, oy: element.y }
  }, [element.id])

  // Window-level drag handling
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const zoom = s.zoom || 1
      const dx = (e.clientX - ref.current.mx) / zoom
      const dy = (e.clientY - ref.current.my) / zoom
      s.updateElement(s.currentSlideId, element.id, {
        x: Math.round(ref.current.ox + dx),
        y: Math.round(ref.current.oy + dy),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, element.id])

  const style: React.CSSProperties = {
    position: 'absolute',
    left: element.x, top: element.y,
    width: element.w, height: element.h,
    opacity: element.opacity,
    cursor: dragging ? 'grabbing' : 'grab',
  }

  if (element.type === 'image') {
    return <img src={element.props.src || ''} alt="" style={style} onMouseDown={handleMouseDown} draggable={false} />
  }

  if (element.type === 'text') {
    return (
      <div style={{ ...style, fontSize: element.props.fontSize || 16, color: element.props.fontColor || '#333', fontWeight: element.props.fontWeight || 'normal', padding: '8px', overflow: 'hidden', whiteSpace: 'pre-wrap' }}
        onMouseDown={handleMouseDown} contentEditable={isSelected} suppressContentEditableWarning
        onBlur={e => { const s = usePptStore.getState(); if (s.currentSlideId) s.updateElement(s.currentSlideId, element.id, { props: { ...element.props, text: e.currentTarget.textContent || '' } }) }}
      >{element.props.text || '双击编辑文本'}</div>
    )
  }

  if (element.type === 'ellipse') {
    return <div style={{ ...style, borderRadius: '50%', background: element.props.fill || '#e2e8f0', border: element.props.stroke ? `${element.props.strokeWidth || 1}px solid ${element.props.stroke}` : 'none' }} onMouseDown={handleMouseDown} />
  }

  if (element.type === 'arrow') {
    const sw = element.props.strokeWidth || 2
    const color = element.props.stroke || '#94a3b8'
    return (
      <svg style={{ ...style, overflow: 'visible' }} onMouseDown={handleMouseDown}>
        <line x1={0} y1={element.h / 2} x2={element.w} y2={element.h / 2} stroke={color} strokeWidth={sw} />
        {renderArrowHead(0, element.h / 2, element.w, element.h / 2, element.props.startShape, color, sw, false)}
        {renderArrowHead(element.w, element.h / 2, 0, element.h / 2, element.props.endShape, color, sw, true)}
      </svg>
    )
  }

  if (element.type === 'line') {
    return <div style={{ ...style, background: element.props.stroke || '#94a3b8' }} onMouseDown={handleMouseDown} />
  }

  const br = element.props.borderRadius || 0
  return (
    <div style={{
      ...style, borderRadius: `${element.props.borderRadiusTL ?? br}px ${element.props.borderRadiusTR ?? br}px ${element.props.borderRadiusBR ?? br}px ${element.props.borderRadiusBL ?? br}px`,
      background: element.props.fill || '#e2e8f0',
      border: element.props.stroke ? `${element.props.strokeWidth || 1}px solid ${element.props.stroke}` : '1px solid #cbd5e1',
    }} onMouseDown={handleMouseDown} />
  )
}

function renderArrowHead(x1: number, y1: number, x2: number, y2: number, shape: string | undefined, color: string, sw: number, isEnd: boolean) {
  if (!shape || shape === 'none') return null
  const size = sw * 6
  const dx = x2 - x1; const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / len; const uy = dy / len
  const sign = isEnd ? 1 : -1
  const tipX = x1 + sign * (len - size) * ux
  const tipY = y1 + sign * (len - size) * uy
  if (shape === 'arrow') {
    const px = -uy * size * 0.5; const py = ux * size * 0.5
    return <polygon points={`${tipX},${tipY} ${tipX - sign * size * ux + px},${tipY - sign * size * uy + py} ${tipX - sign * size * ux - px},${tipY - sign * size * uy - py}`} fill={color} />
  }
  if (shape === 'circle') return <circle cx={tipX - sign * size * 0.3 * ux} cy={tipY - sign * size * 0.3 * uy} r={size * 0.35} fill={color} />
  if (shape === 'square') return <rect x={tipX - sign * size * 0.3 * ux - size * 0.3} y={tipY - sign * size * 0.3 * uy - size * 0.3} width={size * 0.6} height={size * 0.6} fill={color} />
  return null
}
