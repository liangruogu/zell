import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { AIPanel } from '@/components/editor/AIPanel'
import { useAIStore } from '@/stores/aiStore'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const { isOpen: isAIOpen, openPanel, closePanel } = useAIStore()
  const [aiWidth, setAiWidth] = useState(320)
  const [aiDragging, setAiDragging] = useState(false)

  const showAI = location.pathname.includes('/knowledge')

  // Close AI panel when leaving knowledge base
  useEffect(() => {
    if (!showAI && isAIOpen) closePanel()
  }, [showAI, isAIOpen, closePanel])

  const handleAIDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setAiDragging(true)
  }, [])

  useEffect(() => {
    if (!aiDragging) return
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth - e.clientX
      setAiWidth(Math.min(560, Math.max(240, w)))
    }
    const onUp = () => setAiDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [aiDragging])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault()
        isAIOpen ? closePanel() : openPanel('knowledge')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isAIOpen, openPanel, closePanel])

  return (
    <div className="flex h-full bg-white">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
      {isAIOpen && showAI && (
        <>
          <div
            onMouseDown={handleAIDragStart}
            className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-bindle-300 transition-colors z-10"
          />
          <div style={{ width: aiWidth }} className="shrink-0">
            <AIPanel />
          </div>
        </>
      )}
    </div>
  )
}
