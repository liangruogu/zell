import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    const check = async () => setMaximized(await win.isMaximized())
    check()
    const unlisten = win.onResized(() => check())
    return () => { unlisten.then((fn) => fn()) }
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-8 bg-white border-b border-gray-200 select-none shrink-0"
    >
      <div className="flex items-center gap-2 px-3">
        <span className="text-xs font-semibold text-gray-600">Zell</span>
      </div>
      <div className="flex h-full">
        <button
          onClick={() => getCurrentWindow().minimize()}
          className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => getCurrentWindow().toggleMaximize()}
          className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => getCurrentWindow().close()}
          className="w-10 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-gray-500 transition-colors"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
