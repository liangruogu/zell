import { useDrag, ArrowHd, type EP } from './utils'

export function ArrowEl({ el, isSelected }: EP) {
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

export function ReadOnlyArrowEl({ el }: EP) {
  const sw = el.props.strokeWidth || 2, c = el.props.stroke || '#94a3b8', hs = sw * 5
  const x1 = el.props.startShape && el.props.startShape !== 'none' ? hs : 0
  const x2 = el.props.endShape && el.props.endShape !== 'none' ? el.w - hs : el.w
  return <svg data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, overflow: 'visible', opacity: el.opacity, pointerEvents: 'none' }}><line x1={x1} y1={el.h / 2} x2={x2} y2={el.h / 2} stroke={c} strokeWidth={sw} />{ArrowHd(0, el.h / 2, el.w, el.h / 2, el.props.startShape, c, sw)}{ArrowHd(el.w, el.h / 2, 0, el.h / 2, el.props.endShape, c, sw)}</svg>
}
