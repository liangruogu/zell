import { useCallback, useRef, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

interface Props {
  element: CanvasElement
  isSelected: boolean
}

export function CanvasElementView({ element, isSelected }: Props) {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const store = usePptStore.getState()
    if (!e.shiftKey) store.setSelectedIds([element.id])
    else {
      const ids = store.selectedIds.includes(element.id)
        ? store.selectedIds.filter(id => id !== element.id)
        : [...store.selectedIds, element.id]
      store.setSelectedIds(ids)
    }
    setDragging(true)
    dragRef.current = { mx: e.clientX, my: e.clientY, ox: element.x, oy: element.y }
  }, [element.id, element.x, element.y])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragRef.current.mx
    const dy = e.clientY - dragRef.current.my
    const store = usePptStore.getState()
    if (store.currentSlideId) {
      store.updateElement(store.currentSlideId, element.id, {
        x: Math.round(dragRef.current.ox + dx),
        y: Math.round(dragRef.current.oy + dy),
      })
    }
  }, [dragging, element.id])

  const handleMouseUp = useCallback(() => setDragging(false), [])

  const style: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    opacity: element.opacity,
    cursor: dragging ? 'grabbing' : 'grab',
  }

  if (element.type === 'image') {
    return (
      <img
        src={element.props.src || ''}
        alt=""
        style={style}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        draggable={false}
      />
    )
  }

  if (element.type === 'text') {
    return (
      <div
        style={{
          ...style,
          fontSize: element.props.fontSize || 16,
          color: element.props.fontColor || '#333',
          fontWeight: element.props.fontWeight || 'normal',
          padding: '8px',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        contentEditable={isSelected}
        suppressContentEditableWarning
        onBlur={(e) => {
          const store = usePptStore.getState()
          if (store.currentSlideId) {
            store.updateElement(store.currentSlideId, element.id, {
              props: { ...element.props, text: e.currentTarget.textContent || '' },
            })
          }
        }}
      >
        {element.props.text || '双击编辑文本'}
      </div>
    )
  }

  if (element.type === 'ellipse') {
    return (
      <div
        style={{
          ...style,
          borderRadius: '50%',
          background: element.props.fill || '#e2e8f0',
          border: element.props.stroke ? `${element.props.strokeWidth || 1}px solid ${element.props.stroke}` : 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
    )
  }

  // Arrow with SVG
  if (element.type === 'arrow') {
    const sw = element.props.strokeWidth || 2
    const color = element.props.stroke || '#94a3b8'
    const endShape = element.props.endShape || 'arrow'
    const startShape = element.props.startShape || 'none'
    return (
      <svg
        style={{ ...style, overflow: 'visible' }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      >
        <line x1={0} y1={element.h / 2} x2={element.w} y2={element.h / 2}
          stroke={color} strokeWidth={sw} />
        {renderArrowHead(0, element.h / 2, element.w, element.h / 2, startShape, color, sw, false)}
        {renderArrowHead(element.w, element.h / 2, 0, element.h / 2, endShape, color, sw, true)}
      </svg>
    )
  }

  // Line
  if (element.type === 'line') {
    return (
      <div style={{
        ...style,
        background: element.props.stroke || '#94a3b8',
        borderRadius: 0,
      }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      />
    )
  }

  // Rect with individual border radii
  const br = element.props.borderRadius || 0
  const brTL = element.props.borderRadiusTL ?? br
  const brTR = element.props.borderRadiusTR ?? br
  const brBL = element.props.borderRadiusBL ?? br
  const brBR = element.props.borderRadiusBR ?? br

  return (
    <div
      style={{
        ...style,
        borderRadius: `${brTL}px ${brTR}px ${brBR}px ${brBL}px`,
        background: element.props.fill || '#e2e8f0',
        border: element.props.stroke ? `${element.props.strokeWidth || 1}px solid ${element.props.stroke}` : '1px solid #cbd5e1',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
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
  if (shape === 'circle') {
    return <circle cx={tipX - sign * size * 0.3 * ux} cy={tipY - sign * size * 0.3 * uy} r={size * 0.35} fill={color} />
  }
  if (shape === 'square') {
    const px = -uy * size * 0.3; const py = ux * size * 0.3
    return <rect x={tipX - sign * size * 0.3 * ux - size * 0.3} y={tipY - sign * size * 0.3 * uy - size * 0.3} width={size * 0.6} height={size * 0.6} fill={color} />
  }
  return null
}
