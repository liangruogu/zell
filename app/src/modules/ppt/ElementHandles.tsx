import { useCallback, useRef, useEffect, useState } from 'react'
import type { CanvasElement } from './types'
import { usePptStore } from './store'
import type { ElementConfig } from './elements/utils'
import { snapPos } from './elements/utils'
import { imageConfig } from './elements/ImageElement'
import { shapeConfig } from './elements/RectElement'
import { textConfig } from './elements/TextElement'

interface Props { element: CanvasElement; zoom: number }
const HS = 8
const CS = 10

function getConfig(type: string): ElementConfig {
  if (type === 'image') return imageConfig
  if (type === 'text') return textConfig
  return shapeConfig
}

export function ElementHandles({ element, zoom }: Props) {
  const [activeHandle, setActiveHandle] = useState<string | null>(null)
  const stateRef = useRef<any>(null)

  const startResize = useCallback((e: React.MouseEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    setActiveHandle(handle)
    usePptStore.getState().setResizing(true)
    const config = getConfig(element.type)
    stateRef.current = config.onResizeStart(element, handle, e)
  }, [element.x, element.y, element.w, element.h, element.props, element.type])

  useEffect(() => {
    if (!activeHandle) return
    const config = getConfig(element.type)

    const onMove = (e: MouseEvent) => {
      const s = usePptStore.getState()
      if (!s.currentSlideId || !stateRef.current) return
      const z = s.zoom || 1
      const dx = (e.clientX - stateRef.current.mx) / z
      const dy = (e.clientY - stateRef.current.my) / z

      const fresh = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.find(ee => ee.id === element.id)
      const el = fresh || element

      let updates = config.onResizeMove(stateRef.current, el, activeHandle, dx, dy, e.shiftKey)
      if (updates.props) {
        updates = { ...updates, props: { ...(el.props), ...updates.props } }
      }

      // Snap to other elements
      if (updates.x != null || updates.y != null || updates.w != null || updates.h != null) {
        const others = s.slides.find(sl => sl.id === s.currentSlideId)?.elements.filter(ee => ee.id !== element.id) || []
        const t = { ...el, x: updates.x ?? el.x, y: updates.y ?? el.y, w: updates.w ?? el.w, h: updates.h ?? el.h }
        const snapped = snapPos(t, others, t.x, t.y, activeHandle)
        switch (activeHandle) {
          case 'e': updates = { ...updates, w: snapped.erx - t.x }; break
          case 'w': updates = { ...updates, x: snapped.x }; updates = { ...updates, w: (updates.w ?? el.w) + ((updates.x as number) - el.x) }; break
          case 'n': updates = { ...updates, y: snapped.y }; updates = { ...updates, h: (updates.h ?? el.h) + ((updates.y as number) - el.y) }; break
          case 's': updates = { ...updates, h: snapped.eby - t.y }; break
          case 'ne': updates = { ...updates, y: snapped.y }; updates = { ...updates, w: snapped.erx - t.x, h: (updates.h ?? el.h) + ((updates.y as number) - el.y) }; break
          case 'nw': updates = { ...updates, x: snapped.x, y: snapped.y }; updates = { ...updates, w: (updates.w ?? el.w) + ((updates.x as number) - el.x), h: (updates.h ?? el.h) + ((updates.y as number) - el.y) }; break
          case 'sw': updates = { ...updates, x: snapped.x }; updates = { ...updates, w: (updates.w ?? el.w) + ((updates.x as number) - el.x), h: snapped.eby - t.y }; break
          case 'se': updates = { ...updates, w: snapped.erx - t.x, h: snapped.eby - t.y }; break
        }
      }

      // Direct DOM manipulation for element + handles wrapper
      const boxEl = document.querySelector<HTMLElement>(`[data-el-id="${element.id}"]`)
      const hEl = document.querySelector<HTMLElement>(`[data-handles-el-id="${element.id}"]`)
      if (boxEl) {
        if (updates.x != null) boxEl.style.left = updates.x + 'px'
        if (updates.y != null) boxEl.style.top = updates.y + 'px'
        if (updates.w != null) boxEl.style.width = updates.w + 'px'
        if (updates.h != null) boxEl.style.height = updates.h + 'px'
        // Text-specific: update font-size on DOM during corner resize
        if (updates.props?.fontSize != null) boxEl.style.fontSize = updates.props.fontSize + 'px'
      }
      if (hEl) {
        if (updates.x != null) hEl.style.left = updates.x + 'px'
        if (updates.y != null) hEl.style.top = updates.y + 'px'
        if (updates.w != null) hEl.style.width = updates.w + 'px'
        if (updates.h != null) hEl.style.height = updates.h + 'px'
      }
      // For images, also update the img element
      if (element.type === 'image' && boxEl) {
        const imgEl = boxEl.querySelector<HTMLImageElement>('img')
        if (imgEl && updates.props) {
          if (updates.props.imgScale != null || updates.props.cropL != null) {
            // Force re-render for image crop changes (complex DOM structure)
            s.updateElement(s.currentSlideId, element.id, updates)
          }
        }
      }

      // For text, measure content height after width change (text reflow)
      if (element.type === 'text' && boxEl && updates.w != null) {
        const textDiv = boxEl.querySelector<HTMLElement>('.tl-rich-text')
        if (textDiv) {
          const rect = textDiv.getBoundingClientRect()
          const naturalH = Math.ceil(rect.height) + 4
          console.log('[resize onMove] rect.height:', rect.height, 'ceil+4:', naturalH, 'updates.h was:', updates.h, 'element.h:', element.h)
          updates = { ...updates, h: naturalH }
          boxEl.style.height = naturalH + 'px'
          if (hEl) hEl.style.height = naturalH + 'px'
        }
      }

      ;(stateRef.current as any)._pending = updates
    }

    const onUp = () => {
      setActiveHandle(null)
      usePptStore.getState().setResizing(false)
      usePptStore.getState().setGuideLines([])
      const s2 = usePptStore.getState()
      if (s2.currentSlideId && stateRef.current) {
        const pending = (stateRef.current as any)._pending
        if (pending) {
          s2.updateElement(s2.currentSlideId, element.id, pending)
          const config2 = getConfig(element.type)
          if (config2.onResizeEnd) {
            const el2 = s2.slides.find(sl => sl.id === s2.currentSlideId)?.elements.find(ee => ee.id === element.id)
            if (el2) {
              const post = config2.onResizeEnd(el2, stateRef.current)
              if (post) s2.updateElement(s2.currentSlideId, element.id, post)
            }
          }
          if (element.type === 'group' && element.groupChildren && stateRef.current.sw > 0 && stateRef.current.sh > 0) {
            const sx2 = (pending.w ?? 0) / stateRef.current.sw
            const sy2 = (pending.h ?? 0) / stateRef.current.sh
            if (sx2 > 0 && sy2 > 0) {
              const scaled = element.groupChildren.map(c => ({
                ...c, x: Math.round(c.x * sx2), y: Math.round(c.y * sy2),
                w: Math.round(c.w * sx2), h: Math.round(c.h * sy2),
              }))
              s2.updateElement(s2.currentSlideId, element.id, { groupChildren: scaled } as any)
            }
          }
        }
      }
      stateRef.current = null
    }
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
    const isImgEdge = element.type === 'image' && (isH || isV)
    return {
      position: 'absolute',
      background: isImgEdge ? '#10b981' : '#3b82f6',
      border: `${2 * s}px solid white`,
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

  const config = getConfig(element.type)
  const handles = element.type === 'arrow' || element.type === 'line' ? ['w', 'e'] : config.handles

  return (
    <div style={{ position: 'absolute', left: element.x, top: element.y, width: element.w, height: element.h, pointerEvents: 'none', zIndex: 1 }} data-handles-el-id={element.id}>
      <div style={{ position: 'absolute', inset: `${-(2 / zoom)}px`, border: `${2 / zoom}px solid #3b82f6`, pointerEvents: 'none' }} />
      {handles.map(p => (
        <div key={p} data-handle="" style={{ ...hStyle(p, zoom), pointerEvents: 'auto' }} onMouseDown={e => startResize(e, p)} />
      ))}
    </div>
  )
}
