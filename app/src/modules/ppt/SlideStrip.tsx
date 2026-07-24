import { useState, useCallback } from 'react'
import { Plus, Trash2, Copy, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePptStore } from './store'

export function SlideStrip() {
  const { slides, currentSlideId, setCurrentSlide, addSlide, deleteSlide, duplicateSlide, moveSlide, renameSlide } = usePptStore()
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== toIdx) moveSlide(dragIdx, toIdx)
    setDragIdx(null)
  }, [dragIdx, moveSlide])

  return (
    <div className="h-28 border-t border-gray-200 bg-gray-100 flex items-center px-3 gap-2 shrink-0">
      <div className="flex gap-2 overflow-x-auto py-1">
        {slides.map((s, i) => (
          <div key={s.id} draggable
            onDragStart={e => handleDragStart(e, i)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, i)}
            onClick={() => setCurrentSlide(s.id)}
            onDoubleClick={() => { const n = prompt('幻灯片名称', s.name); if (n) renameSlide(s.id, n) }}
            className={cn('group relative w-28 h-[72px] border rounded cursor-pointer shrink-0 transition-all',
              s.id === currentSlideId ? 'border-bindle-400 ring-2 ring-bindle-200' : 'border-gray-300 hover:border-gray-400',
              dragIdx === i && 'opacity-50')}
          >
            <div className="w-full h-full bg-white rounded flex items-center justify-center text-[10px] text-gray-400">{i + 1}</div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/30 text-white text-[9px] px-1 py-0.5 rounded-b flex items-center justify-between opacity-0 group-hover:opacity-100">
              <span className="truncate flex-1">{s.name}</span>
              <GripHorizontal size={9} className="cursor-grab shrink-0 ml-0.5" />
            </div>
            <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100">
              <button onClick={e => { e.stopPropagation(); duplicateSlide(s.id) }} className="p-0.5 bg-white border border-gray-200 rounded-bl hover:bg-bindle-50"><Copy size={9} /></button>
              <button onClick={e => { e.stopPropagation(); deleteSlide(s.id) }} className="p-0.5 bg-white border border-gray-200 rounded-br hover:bg-red-50"><Trash2 size={9} className="text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => addSlide()} className="w-20 h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-bindle-400 hover:text-bindle-500 shrink-0 transition-colors">
        <Plus size={20} />
      </button>
    </div>
  )
}
