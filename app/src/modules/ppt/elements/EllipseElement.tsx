import { useDrag, shadowStyle, type EP } from './utils'

export function EllipseEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, cursor: dragging ? 'grabbing' : 'default', outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px' }} onMouseDown={onMouseDown} />
}

export function ReadOnlyEllipseEl({ el }: EP) {
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, pointerEvents: 'none' }} />
}
