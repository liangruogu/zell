import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ResizablePanelState {
  effectiveWidth: number
  collapsed: boolean
  toggle: () => void
  panelProps: {
    ref: React.RefObject<HTMLDivElement | null>
    className: string
    style: React.CSSProperties
  }
  handleProps: {
    onMouseDown: (e: React.MouseEvent) => void
    className: string
  } | null
}

/**
 * Hook-based resizable sidebar panel.
 * Returns state + props to spread on the panel div and resize handle.
 *
 * Usage:
 *   const panel = useResizablePanel()
 *   <div {...panel.panelProps}>content</div>
 *   {panel.handleProps && <div {...panel.handleProps} />}
 */
export function useResizablePanel(
  defaultWidth = 224,
  minWidth = 120,
  maxWidth = 400,
  snapThreshold = 80,
  storageKey = 'bindle_panel_collapsed',
): ResizablePanelState {
  const [width, setWidth] = useState(defaultWidth)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })
  const [dragging, setDragging] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const effectiveWidth = collapsed ? 0 : width

  const persistCollapsed = (v: boolean) => { try { localStorage.setItem(storageKey, v ? '1' : '0') } catch { /* */ } }

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c; persistCollapsed(next); return next
    })
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  useEffect(() => {
    if (!dragging) return
    const onMouseMove = (e: MouseEvent) => {
      const panel = panelRef.current
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      let newWidth = e.clientX - rect.left
      // When collapsed, dragging from x=0 starts with a small width
      if (collapsed) {
        newWidth = e.clientX - rect.left
        if (newWidth < snapThreshold) return
        setCollapsed(false); persistCollapsed(false)
      }
      if (newWidth < snapThreshold) {
        setCollapsed(true); persistCollapsed(true)
        setWidth(Math.max(minWidth, newWidth))
      } else {
        setCollapsed(false); persistCollapsed(false)
        setWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)))
      }
    }
    const onMouseUp = () => setDragging(false)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, minWidth, maxWidth, snapThreshold, collapsed])

  const panelProps = {
    ref: panelRef,
    className: cn(
      'border-r border-gray-200 bg-white flex flex-col shrink-0 overflow-hidden',
      collapsed && 'border-r-0'
    ),
    style: { width: effectiveWidth },
  }

  const handleProps = collapsed
    ? null
    : {
        onMouseDown,
        className: cn(
          'w-1.5 shrink-0 cursor-col-resize transition-colors z-10',
          dragging ? 'bg-bindle-400' : 'hover:bg-bindle-300'
        ),
      }

  return { effectiveWidth, collapsed, toggle, panelProps, handleProps }
}

/**
 * Simple wrapper component using the hook.
 */
export function ResizablePanel({
  children,
  defaultWidth = 224,
  minWidth = 120,
  maxWidth = 400,
  snapThreshold = 80,
  className,
}: {
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  snapThreshold?: number
  className?: string
}) {
  const { panelProps, handleProps } = useResizablePanel(defaultWidth, minWidth, maxWidth, snapThreshold)

  return (
    <>
      <div {...panelProps} className={cn(panelProps.className, className)}>
        {children}
      </div>
      {handleProps && <div {...handleProps} />}
    </>
  )
}
