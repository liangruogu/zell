import React from 'react'
import { useDrag, type EP, type ElementConfig } from './utils'
import type { CanvasElement } from '../types'

export function ImageEl({ el, isSelected }: EP) {
  const { onMouseDown } = useDrag(el.id)
  const p = el.props
  const ow = p.origW || el.w
  const oh = p.origH || el.h
  const scale = p.imgScale ?? 1
  const imgW = ow * scale
  const imgH = oh * scale
  const cL = p.cropL ?? 0; const cR = p.cropR ?? 0
  const cT = p.cropT ?? 0; const cB = p.cropB ?? 0
  return (
    <div data-el-id={el.id}
      style={{
        position: 'absolute',
        left: el.x, top: el.y,
        width: Math.max(1, el.w), height: Math.max(1, el.h),
        overflow: 'hidden', opacity: el.opacity,
        outline: isSelected ? '2px solid rgba(59,130,246,0.5)' : undefined,
        outlineOffset: '1px',
      }}
      onMouseDown={onMouseDown}
    >
      <img src={p.src || ''}
        style={{ position: 'absolute', left: -cL, top: -cT, width: imgW, height: imgH, display: 'block' }}
        draggable={false}
      />
    </div>
  )
}

export function ReadOnlyImageEl({ el }: EP) {
  const p = el.props
  const ow = p.origW || el.w
  const oh = p.origH || el.h
  const scale = p.imgScale ?? 1
  const imgW = ow * scale; const imgH = oh * scale
  const cL = p.cropL ?? 0; const cR = p.cropR ?? 0
  const cT = p.cropT ?? 0; const cB = p.cropB ?? 0
  return (
    <div data-el-id={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: Math.max(1, el.w), height: Math.max(1, el.h), overflow: 'hidden', opacity: el.opacity, pointerEvents: 'none' }}>
      <img src={p.src || ''} style={{ position: 'absolute', left: -cL, top: -cT, width: imgW, height: imgH, display: 'block' }} draggable={false} />
    </div>
  )
}

// ─── Image element config: crop (edge) + scale (corner) ───

export const imageConfig: ElementConfig = {
  handles: ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'],

  onResizeStart(el, _handle, e) {
    const p = el.props
    const ow = p.origW || el.w
    const oh = p.origH || el.h
    const sScale = p.imgScale ?? 1
    return {
      mx: e.clientX, my: e.clientY,
      sx: el.x, sy: el.y,
      sw: el.w, sh: el.h,
      sCL: p.cropL ?? 0, sCR: p.cropR ?? 0,
      sCT: p.cropT ?? 0, sCB: p.cropB ?? 0,
      sScale,
      origW: ow, origH: oh,
      sImgW: ow * sScale, sImgH: oh * sScale,
    }
  },

  onResizeMove(state, el, handle, dx, dy, shift) {
    const { sx, sy, sw, sh, sCL, sCR, sCT, sCB, sScale, origW, origH, sImgW, sImgH } = state
    const currentImgAR = sImgW / (sImgH || 1)
    const isCorner = handle.length === 2

    let boxL = sx, boxT = sy, boxW = sw, boxH = sh
    let imgL = -sCL, imgT = -sCT
    let imgW = sImgW, imgH = sImgH

    if (isCorner) {
      const boxRatio = sw / (sh || 1)
      if (handle.includes('e')) boxW = Math.max(40, sw + dx)
      if (handle.includes('w')) boxW = Math.max(40, sw - dx)
      if (!shift) {
        boxH = Math.max(40, boxW / boxRatio)
        if (boxH === 40) boxW = 40 * boxRatio
      } else {
        if (handle.includes('s')) boxH = Math.max(40, sh + dy)
        if (handle.includes('n')) boxH = Math.max(40, sh - dy)
      }
      if (handle.includes('w')) boxL = sx + (sw - boxW)
      if (handle.includes('n')) boxT = sy + (sh - boxH)
      const scaleX = boxW / sw, scaleY = boxH / sh
      imgW = sImgW * scaleX; imgH = sImgH * scaleY
      imgL = (-sCL) * scaleX; imgT = (-sCT) * scaleY
    } else {
      if (handle === 'e') boxW = Math.max(40, sw + dx)
      if (handle === 's') boxH = Math.max(40, sh + dy)
      if (handle === 'w') { boxW = Math.max(40, sw - dx); boxL = sx + (sw - boxW) }
      if (handle === 'n') { boxH = Math.max(40, sh - dy); boxT = sy + (sh - boxH) }
      const moveX = boxL - sx, moveY = boxT - sy
      imgL = (-sCL) - moveX; imgT = (-sCT) - moveY
      if (handle === 'e' && (imgL + imgW < boxW)) { imgW = boxW - imgL; imgH = imgW / currentImgAR; imgT = imgT - (imgH - sImgH) / 2 }
      if (handle === 'w' && (imgL > 0)) { imgW = imgW + imgL; imgH = imgW / currentImgAR; imgT = imgT - (imgH - sImgH) / 2; imgL = 0 }
      if (handle === 's' && (imgT + imgH < boxH)) { imgH = boxH - imgT; imgW = imgH * currentImgAR; imgL = imgL - (imgW - sImgW) / 2 }
      if (handle === 'n' && (imgT > 0)) { imgH = imgH + imgT; imgW = imgH * currentImgAR; imgL = imgL - (imgW - sImgW) / 2; imgT = 0 }
    }

    const ncL = Math.max(0, Math.round(-imgL))
    const ncT = Math.max(0, Math.round(-imgT))
    const ncR = Math.max(0, Math.round(imgW - boxW + imgL))
    const ncB = Math.max(0, Math.round(imgH - boxH + imgT))
    return {
      x: Math.round(boxL), y: Math.round(boxT),
      w: Math.round(boxW), h: Math.round(boxH),
      props: { ...el.props, imgScale: imgW / origW, cropL: ncL, cropR: ncR, cropT: ncT, cropB: ncB },
    }
  },
}
