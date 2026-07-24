import { useCallback, useRef, useEffect, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

interface Props { element: CanvasElement }

const HS = 8

export function ElementHandles({ element }: Props) {
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const ref = useRef({ ox: 0, oy: 0, ow: 0, oh: 0 })

  const startResize = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    setActiveHandle(handle)
    const s = usePptStore.getState()
    ref.current = { ox: element.x, oy: element.y, ow: element.w, oh: element.h }
  }, [element.x, element.y, element.w, element.h])

  // Attach move/up to window for non-stuck tracking
  useEffect(() => {
    if (!activeHandle) return
    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId) return
      const ce = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(el => el.id === element.id)
      if (!ce) return
      const { ox, oy, ow, oh } = ref.current

      let nx = ce.x, ny = ce.y, nw = ce.w, nh = ce.h
      // Use the last stored values for delta calculation
      const dx = e.movementX
      const dy = e.movementY

      switch (activeHandle) {
        case 'nw': nx = ce.x + dx; ny = ce.y + dy; nw = ce.w - dx; nh = ce.h - dy; break
        case 'ne': ny = ce.y + dy; nw = ce.w + dx; nh = ce.h - dy; break
        case 'sw': nx = ce.x + dx; nw = ce.w - dx; nh = ce.h + dy; break
        case 'se': nw = ce.w + dx; nh = ce.h + dy; break
        case 'n': ny = ce.y + dy; nh = ce.h - dy; break
        case 's': nh = ce.h + dy; break
        case 'w': nx = ce.x + dx; nw = ce.w - dx; break
        case 'e': nw = ce.w + dx; break
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

  return (
    <div style={{ position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, pointerEvents: 'none', outline: '2px solid #3b82f6', outlineOffset: '1px' }}>
      {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(p => (
        <div key={p} style={{ ...hStyle(p), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
