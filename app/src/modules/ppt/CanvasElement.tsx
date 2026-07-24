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
    outline: isSelected ? '2px solid #3b82f6' : 'none',
    outlineOffset: '1px',
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

  // rect, line, arrow
  return (
    <div
      style={{
        ...style,
        borderRadius: element.props.borderRadius || 0,
        background: element.type === 'line' || element.type === 'arrow' ? 'transparent' : (element.props.fill || '#e2e8f0'),
        border: element.props.stroke ? `${element.props.strokeWidth || 1}px solid ${element.props.stroke}` : (element.type === 'line' || element.type === 'arrow' ? 'none' : '1px solid #cbd5e1'),
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}
