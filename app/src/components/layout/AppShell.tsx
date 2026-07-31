import { type ReactNode, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TitleBar } from './TitleBar'
import { AIPanel } from '@/components/editor/AIPanel'
import { useKeyboardShortcutDialog } from '@/components/share/KeyboardShortcutDialog'
import { useAIStore } from '@/stores/aiStore'
import { useSyncStore } from '@/stores/syncStore'
import { Button } from '@/components/ui/Button'
import { AlertTriangle } from 'lucide-react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isOpen: isAIOpen, openPanel, closePanel } = useAIStore()
  const [aiWidth, setAiWidth] = useState(320)
  const [aiDragging, setAiDragging] = useState(false)
  const readOnly = useSyncStore((s) => s.readOnly)

  const { dialog: shortcutDialog } = useKeyboardShortcutDialog()

  const isOnOverview = location.pathname.startsWith('/project/') && !location.pathname.includes('/knowledge') && !location.pathname.includes('/whiteboard')

  // Auto-connect to saved server on startup
  const serverUrl = useSyncStore((s) => s.serverUrl)
  const setConnected = useSyncStore((s) => s.setConnected)
  const setServerRunning = useSyncStore((s) => s.setServerRunning)

  useEffect(() => {
    if (!serverUrl) return
    fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) })
      .then((res) => {
        if (res.ok) {
          setConnected(true)
          setServerRunning(true)
        }
      })
      .catch(() => {})
  }, [serverUrl, setConnected, setServerRunning])

  const showAI = location.pathname.includes('/knowledge')

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
    <div className="flex flex-col h-full bg-white">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
      {isAIOpen && showAI && (
        <>
          <div
            onMouseDown={handleAIDragStart}
            className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-zell-300 transition-colors z-10"
          />
          <div style={{ width: aiWidth }} className="shrink-0">
            <AIPanel />
          </div>
        </>
      )}
      {shortcutDialog}
      </div>

      {/* Read-only overlay for joined projects when server is offline */}
      {readOnly && !isOnOverview && location.pathname.startsWith('/project/') && (
        <div className="fixed inset-0 z-[999] bg-white/90 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center space-y-4 max-w-sm">
            <AlertTriangle size={48} className="mx-auto text-amber-500" strokeWidth={1} />
            <h2 className="text-lg font-semibold text-gray-800">与服务器断开连接</h2>
            <p className="text-sm text-gray-500">你已加入的项目服务器已离线，在恢复连接前无法编辑内容。</p>
            <Button onClick={() => navigate('/')}>返回首页</Button>
          </div>
        </div>
      )}
    </div>
  )
}
