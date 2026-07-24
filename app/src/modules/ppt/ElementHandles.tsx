import { useCallback, useRef, useEffect, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'
import { snapPos } from './CanvasElement'

interface Props { element: CanvasElement; zoom: number }
const HS = 8
const CS = 10 // corner size

export function ElementHandles({ element, zoom }: Props) {
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const ref = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0 })

  const startResize = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    setActiveHandle(handle)
    const s = usePptStore.getState()
    ref.current = { mx: e.clientX, my: e.clientY, ox: element.x, oy: element.y, ow: element.w, oh: element.h }
  }, [element.x, element.y, element.w, element.h])

  useEffect(() => {
    if (!activeHandle) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const zoom = s.zoom || 1
      const dx = (e.clientX - ref.current.mx) / zoom
      const dy = (e.clientY - ref.current.my) / zoom
      const { ox, oy, ow, oh } = ref.current

      let nx = ox, ny = oy, nw = ow, nh = oh
      switch (activeHandle) {
        case 'nw': nx = ox + dx; ny = oy + dy; nw = ow - dx; nh = oh - dy; break
        case 'ne': ny = oy + dy; nw = ow + dx; nh = oh - dy; break
        case 'sw': nx = ox + dx; nw = ow - dx; nh = oh + dy; break
        case 'se': nw = ow + dx; nh = oh + dy; break
        case 'n': ny = oy + dy; nh = oh - dy; break
        case 's': nh = oh + dy; break
        case 'w': nx = ox + dx; nw = ow - dx; break
        case 'e': nw = ow + dx; break
      }
      if (nw < 1) nw = 1
      if (nh < 1) nh = 1
      // prevent left/top edges from crossing right/bottom
      if (activeHandle.includes('w')) nx = Math.min(nx, ox + ow - 1)
      if (activeHandle.includes('n')) ny = Math.min(ny, oy + oh - 1)
      // prevent right/bottom edges from crossing left/top
      if (activeHandle.includes('e')) nw = Math.max(1, nw)
      if (activeHandle.includes('s')) nh = Math.max(1, nh)

      const lockAspect = element.type !== 'line' && element.type !== 'arrow' && e.shiftKey
      if (lockAspect && activeHandle.length === 2 && ow > 0 && oh > 0) {
        const aspect = ow / oh
        nw = Math.max(10, nw)
        nh = nw / aspect
      }

      // snap — adjust position or size depending on which handle is active
      const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === element.id)
      if (el) {
        const others = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.filter(ee => ee.id !== element.id) || []
        const snapped = snapPos({ ...el, x: nx, y: ny, w: nw, h: nh }, others, nx, ny, activeHandle)
        switch (activeHandle) {
          case 'n': ny = snapped.y; nh = ref.current.oy + ref.current.oh - ny; break
          case 's': nh = snapped.eby - ny; break
          case 'w': nx = snapped.x; nw = ref.current.ox + ref.current.ow - nx; break
          case 'e': nw = snapped.erx - nx; break
          // corners: keep opposite corner fixed
          case 'nw': nx = snapped.x; ny = snapped.y; nw = ref.current.ox + ref.current.ow - nx; nh = ref.current.oy + ref.current.oh - ny; break
          case 'ne': ny = snapped.y; nw = snapped.erx - nx; nh = ref.current.oy + ref.current.oh - ny; break
          case 'sw': nx = snapped.x; nw = ref.current.ox + ref.current.ow - nx; nh = snapped.eby - ny; break
          case 'se': nw = snapped.erx - nx; nh = snapped.eby - ny; break
        }
      }

      s.updateElement(s.currentSlideId, element.id, { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) })
      // if element is a group, also scale its children
      if (element.type === 'group' && element.groupChildren) {
        const ow = ref.current.ow, oh = ref.current.oh
        if (ow > 0 && oh > 0) {
          const sx = nw / ow, sy = nh / oh
          const el2 = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === element.id)
          if (el2) {
            const scaled = element.groupChildren.map(c => ({
              ...c,
              x: Math.round(c.x * sx),
              y: Math.round(c.y * sy),
              w: Math.round(c.w * sx),
              h: Math.round(c.h * sy),
            }))
            s.updateElement(s.currentSlideId, element.id, { groupChildren: scaled } as any)
          }
        }
      }
    }
    const onUp = () => { setActiveHandle(null); usePptStore.getState().setGuideLines([]) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [activeHandle, element.type])

  const hStyle = (pos: string, z: number = 1): React.CSSProperties => {
    const isCorner = pos.length === 2
    const isH = pos === 'w' || pos === 'e'
    const isV = pos === 'n' || pos === 's'
    const s = 1 / z
    const cSize = (isCorner ? CS : HS) * s
    const barLen = (isV || isH ? 18 : cSize / s) * s
    return {
      position: 'absolute',
      background: '#3b82f6', border: `${2 * s}px solid white`,
      borderRadius: isCorner ? '50%' : `${3 * s}px`,
      cursor: isV ? 'ns-resize' : isH ? 'ew-resize'
        : pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize',
      width: isV ? barLen : cSize,
      height: isH ? barLen : cSize,
      ...(pos.includes('n') ? { top: -(cSize / 2) } : pos.includes('s') ? { bottom: -(cSize / 2) } : {}),
      ...(pos.includes('w') ? { left: -(cSize / 2) } : pos.includes('e') ? { right: -(cSize / 2) } : {}),
      ...(isV ? { left: '50%', marginLeft: -(barLen / 2) } : {}),
      ...(isH ? { top: '50%', marginTop: -(barLen / 2) } : {}),
    }
  }

  const handles = element.type === 'arrow' || element.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

  return (
    <div style={{
      position: 'absolute',
      left: element.x, top: element.y,
      width: element.w, height: element.h,
      pointerEvents: 'none',
      zIndex: 1,
    }}>
      <div style={{
        position: 'absolute',
        inset: `${-(2 / zoom)}px`,
        border: `${2 / zoom}px solid #3b82f6`,
        pointerEvents: 'none',
      }} />
      {handles.map(p => (
        <div key={p} style={{ ...hStyle(p, zoom), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
