import { useState, useEffect } from 'react'
import { getCurrentWindow, type Window } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

let cachedWindow: Window | null = null
function getWindow(): Window {
  if (!cachedWindow) cachedWindow = getCurrentWindow()
  return cachedWindow
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const win = getWindow()

  useEffect(() => {
    const check = async () => setMaximized(await win.isMaximized())
    check()
    const unlisten = win.onResized(() => check())
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 bg-white border-b border-gray-200 shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 select-none"
      >
        <span className="text-xs font-semibold text-gray-600">Zell</span>
      </div>
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={async () => { await win.minimize() }}
          className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={async () => { await win.toggleMaximize() }}
          className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={async () => { await win.close() }}
          className="w-10 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-500 transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
