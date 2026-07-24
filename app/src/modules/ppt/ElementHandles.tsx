import { useCallback, useRef, useEffect, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

interface Props { element: CanvasElement }
const HS = 8

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

      const lockAspect = element.type !== 'line' && element.type !== 'arrow'
      if (lockAspect && activeHandle.length === 2 && ow > 0 && oh > 0) {
        const aspect = ow / oh
        nw = Math.max(10, nw)
        nh = nw / aspect
      }

      s.updateElement(s.currentSlideId, element.id, { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) })
    }
    const onUp = () => setActiveHandle(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [activeHandle, element.type])

  const hStyle = (pos: string): React.CSSProperties => ({
    position: 'absolute', width: HS, height: HS,
    background: '#3b82f6', border: '2px solid white', borderRadius: '50%',
    cursor: pos === 'n' || pos === 's' ? 'ns-resize' : pos === 'w' || pos === 'e' ? 'ew-resize'
      : pos === 'nw' || pos === 'se' ? 'nwse-resize' : 'nesw-resize',
    ...(pos.includes('n') ? { top: -HS / 2 } : {}),
    ...(pos.includes('s') ? { bottom: -HS / 2 } : {}),
    ...(pos.includes('w') ? { left: -HS / 2 } : {}),
    ...(pos.includes('e') ? { right: -HS / 2 } : {}),
    ...(pos === 'n' || pos === 's' ? { left: '50%', marginLeft: -HS / 2 } : {}),
    ...(pos === 'w' || pos === 'e' ? { top: '50%', marginTop: -HS / 2 } : {}),
  })

  const handles = element.type === 'arrow' || element.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

  return (
    <div style={{ position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, pointerEvents: 'none', outline: '2px solid #3b82f6', outlineOffset: '1px' }}>
      {handles.map(p => (
        <div key={p} style={{ ...hStyle(p), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
