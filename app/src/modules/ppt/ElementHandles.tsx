import { useCallback, useRef, useEffect, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'
import { snapPos } from './CanvasElement'

interface Props { element: CanvasElement }
const HS = 8
const CS = 10 // corner size

export function ElementHandles({ element }: Props) {
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
      if (nw < 10) nw = 10
      if (nh < 10) nh = 10

      const lockAspect = element.type !== 'line' && element.type !== 'arrow' && e.shiftKey
      if (lockAspect && activeHandle.length === 2 && ow > 0 && oh > 0) {
        const aspect = ow / oh
        nw = Math.max(10, nw)
        nh = nw / aspect
      }

      // snap edges / centers during resize (only for corner handles)
      if (activeHandle.length === 2) {
        const el = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === element.id)
        if (el) {
          const others = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.filter(ee => ee.id !== element.id) || []
          const sn = snapPos({ ...el, x: nx, y: ny, w: nw, h: nh }, others, nx, ny)
          nx = sn.x; ny = sn.y
        }
      }

      s.updateElement(s.currentSlideId, element.id, { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) })
    }
    const onUp = () => { setActiveHandle(null); usePptStore.getState().setGuideLines([]) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [activeHandle, element.type])

  const hStyle = (pos: string): React.CSSProperties => {
    const isCorner = pos.length === 2
    const isH = pos === 'w' || pos === 'e'
    const isV = pos === 'n' || pos === 's'
    const cSize = isCorner ? CS : HS
    const barLen = isV ? 18 : (isH ? 18 : cSize)  // bar handle length (18px for edges)
    return {
      position: 'absolute',
      background: '#3b82f6', border: '2px solid white',
      borderRadius: isCorner ? '50%' : '3px',
      cursor: isV ? 'ns-resize' : isH ? 'ew-resize'
        : pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize',
      width: isV ? barLen : cSize,
      height: isH ? barLen : cSize,
      // perpendicular offset from edge: half the handle size in that direction
      ...(pos.includes('n') ? { top: -(cSize / 2) } : pos.includes('s') ? { bottom: -(cSize / 2) } : {}),
      ...(pos.includes('w') ? { left: -(cSize / 2) } : pos.includes('e') ? { right: -(cSize / 2) } : {}),
      // parallel centering for edge handles
      ...(isV ? { left: '50%', marginLeft: -(barLen / 2) } : {}),
      ...(isH ? { top: '50%', marginTop: -(barLen / 2) } : {}),
    }
  }

  const handles = element.type === 'arrow' || element.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

  return (
    <div style={{ position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, pointerEvents: 'none', outline: '2px solid #3b82f6', outlineOffset: '1px' }}>
      {handles.map(p => (
        <div key={p} style={{ ...hStyle(p), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
