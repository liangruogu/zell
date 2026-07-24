import { useCallback, useRef, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'

interface Props {
  element: CanvasElement
}

const HANDLE_SIZE = 8

export function ElementHandles({ element }: Props) {
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const dragRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0, ow: 0, oh: 0 })

  const startResize = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    setActiveHandle(handle)
    dragRef.current = { mx: e.clientX, my: e.clientY, ox: element.x, oy: element.y, ow: element.w, oh: element.h }
  }, [element.x, element.y, element.w, element.h])

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!activeHandle) return
    const dx = e.clientX - dragRef.current.mx
    const dy = e.clientY - dragRef.current.my
    const { ox, oy, ow, oh } = dragRef.current
    const s = usePptStore.getState()
    if (!s.currentSlideId) return

    const lockAspect = element.type !== 'line' && element.type !== 'arrow'
    const aspect = lockAspect && ow > 0 && oh > 0 ? ow / oh : 0

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

    // Clamp minimum size
    if (nw < 10) { nw = 10; if (activeHandle.includes('w')) nx = ox + ow - 10 }
    if (nh < 10) { nh = 10; if (activeHandle.includes('n')) ny = oy + oh - 10 }

    // Lock aspect ratio for non-corner handles? No — corner only.
    if (lockAspect && aspect > 0 && activeHandle.length === 2) {
      nw = Math.max(10, nw)
      nh = nw / aspect
      if (activeHandle.includes('n')) ny = oy + oh - nh
    }

    s.updateElement(s.currentSlideId, element.id, { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) })
  }, [activeHandle, element.type])

  const endResize = useCallback(() => setActiveHandle(null), [])

  const handleStyle = (pos: string): React.CSSProperties => {
    const s: React.CSSProperties = {
      position: 'absolute', width: HANDLE_SIZE, height: HANDLE_SIZE,
      background: '#3b82f6', border: '2px solid white', borderRadius: '50%',
      cursor: pos.includes('n') ? (pos.includes('w') ? 'nwse-resize' : pos.includes('e') ? 'nesw-resize' : 'ns-resize')
        : pos.includes('s') ? (pos.includes('w') ? 'nesw-resize' : pos.includes('e') ? 'nwse-resize' : 'ns-resize')
        : 'ew-resize',
    }
    if (pos.includes('n')) s.top = -HANDLE_SIZE / 2
    if (pos.includes('s')) s.bottom = -HANDLE_SIZE / 2
    if (pos.includes('w')) s.left = -HANDLE_SIZE / 2
    if (pos.includes('e')) s.right = -HANDLE_SIZE / 2
    if (pos === 'n' || pos === 's') s.left = '50%'; s.marginLeft = -HANDLE_SIZE / 2
    if (pos === 'w' || pos === 'e') s.top = '50%'; s.marginTop = -HANDLE_SIZE / 2
    return s
  }

  return (
    <div
      style={{ position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, pointerEvents: 'none', outline: '2px solid #3b82f6', outlineOffset: '1px' }}
      onMouseMove={onMove} onMouseUp={endResize} onMouseLeave={endResize}
    >
      {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map(p => (
        <div key={p} style={{ ...handleStyle(p), pointerEvents: 'auto' }}
          onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
