import { useState } from 'react'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  {
    name: '常用',
    emojis: ['📁', '📂', '📋', '📝', '📊', '📈', '📌', '📎', '💡', '🚀', '⭐', '🔥', '🎯', '💻', '🎨', '🔧'],
  },
  {
    name: '趣味',
    emojis: ['🦄', '🐉', '🌮', '🍕', '🧙', '🦸', '🧛', '👾', '🕹️', '🎮', '🎲', '🧩', '🪄', '🔮', '👑', '💎'],
  },
  {
    name: '自然',
    emojis: ['🌱', '🌿', '🌻', '🌸', '🍀', '🌙', '☀️', '🌈', '💧', '🔥', '❄️', '🌊', '🏔️', '🌴', '🍄', '🪐'],
  },
  {
    name: '物件',
    emojis: ['🗺️', '🧭', '📡', '🔬', '🧪', '⚙️', '🛠️', '🔑', '🏷️', '📯', '🎪', '🏆', '🎁', '📦', '🧲', '🛡️'],
  },
]

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState(0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-14 h-14 flex items-center justify-center text-2xl border border-gray-300 rounded-lg hover:border-bindle-400 transition-colors"
      >
        {value || '📁'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-[360px]">
            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-2 pt-1">
              {CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setTab(i)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-t transition-colors',
                    tab === i ? 'text-bindle-600 border-b-2 border-bindle-500' : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            {/* Emoji grid */}
            <div className="grid grid-cols-8 gap-0.5 p-2 max-h-[200px] overflow-auto">
              {CATEGORIES[tab].emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onChange(emoji); setOpen(false) }}
                  className={cn(
                    'w-10 h-10 flex items-center justify-center text-lg rounded hover:bg-gray-100 transition-colors',
                    value === emoji && 'bg-bindle-100 ring-1 ring-bindle-300'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
