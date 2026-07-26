import { useDrag, shadowStyle, type EP, type ElementConfig } from './utils'

export function RectEl({ el, isSelected }: EP) {
  const { onMouseDown, dragging } = useDrag(el.id)
  const br = el.props.borderRadius || 0
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`, background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, cursor: dragging ? 'grabbing' : 'default', outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined, outlineOffset: '1px' }} onMouseDown={onMouseDown} />
}

export function ReadOnlyRectEl({ el }: EP) {
  const br = el.props.borderRadius || 0
  const ss = shadowStyle(el.props)
  const sw = el.props.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props.stroke
  return <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`, background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss, pointerEvents: 'none' }} />
}

// ─── Shape element config: standard resize (rect, ellipse, text, arrow) ───

export const shapeConfig: ElementConfig = {
  handles: ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'],

  onResizeStart(el, _handle, e) {
    return { mx: e.clientX, my: e.clientY, sx: el.x, sy: el.y, sw: el.w, sh: el.h }
  },

  onResizeMove(state, _el, handle, dx, dy, shift) {
    const { sx, sy, sw, sh } = state
    const isCorner = handle.length === 2

    let nx = sx, ny = sy, nw = sw, nh = sh

    if (isCorner) {
      switch (handle) {
        case 'nw': nx = sx + dx; ny = sy + dy; nw = sw - dx; nh = sh - dy; break
        case 'ne': ny = sy + dy; nw = sw + dx; nh = sh - dy; break
        case 'sw': nx = sx + dx; nw = sw - dx; nh = sh + dy; break
        case 'se': nw = sw + dx; nh = sh + dy; break
      }
      if (nw < 1) nw = 1; if (nh < 1) nh = 1
      if (handle.includes('w')) nx = Math.min(nx, sx + sw - 1)
      if (handle.includes('n')) ny = Math.min(ny, sy + sh - 1)
      if (shift) { const a = sw / (sh || 1); nw = Math.max(10, nw); nh = nw / a }
    } else {
      switch (handle) {
        case 'n': ny = sy + dy; nh = sh - dy; break
        case 's': nh = sh + dy; break
        case 'w': nx = sx + dx; nw = sw - dx; break
        case 'e': nw = sw + dx; break
      }
      if (nw < 1) nw = 1; if (nh < 1) nh = 1
    }

    return { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) }
  },
}
