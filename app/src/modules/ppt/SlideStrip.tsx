import { useState, useCallback, useRef } from 'react'
import { Plus, Trash2, Copy, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePptStore } from './store'

export function SlideStrip() {
  const { slides, currentSlideId, selectedSlideIds, setCurrentSlide, addSlide, deleteSlide, deleteSlides, duplicateSlide, moveSlide, renameSlide } = usePptStore()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const lastClickedRef = useRef<number | null>(null)
  const dragStartedRef = useRef(false)

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragStartedRef.current = true
    setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'
  }, [])
  const handleDragEnd = useCallback(() => {
    setDragIdx(null); setTimeout(() => { dragStartedRef.current = false }, 50)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault() }, [])
  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== toIdx) moveSlide(dragIdx, toIdx)
    setDragIdx(null)
  }, [dragIdx, moveSlide])

  const handleSlideClick = useCallback((e: React.MouseEvent, id: string, idx: number) => {
    if (dragStartedRef.current) { dragStartedRef.current = false; return }
    if (e.ctrlKey || e.metaKey) {
      usePptStore.setState(s => ({ selectedSlideIds: s.selectedSlideIds.includes(id) ? s.selectedSlideIds.filter(sid => sid !== id) : [...s.selectedSlideIds, id] }))
      lastClickedRef.current = idx
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      const from = Math.min(lastClickedRef.current, idx)
      const to = Math.max(lastClickedRef.current, idx)
      const range = usePptStore.getState().slides.slice(from, to + 1).map(s => s.id)
      usePptStore.setState({ selectedSlideIds: range })
    } else {
      setCurrentSlide(id)
      usePptStore.setState({ selectedSlideIds: [] })
      lastClickedRef.current = idx
    }
  }, [setCurrentSlide])

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    setRenamingId(id); setRenameVal(name)
  }
  const submitRename = () => {
    if (renamingId && renameVal.trim()) renameSlide(renamingId, renameVal.trim())
    setRenamingId(null)
  }

  const handleDeleteSelected = () => {
    if (selectedSlideIds.length > 0) {
      deleteSlides(selectedSlideIds)
      usePptStore.setState({ selectedSlideIds: [] })
    } else if (currentSlideId) {
      deleteSlide(currentSlideId)
    }
  }

  return (
    <div className="h-28 border-t border-gray-200 flex items-center px-3 gap-2 shrink-0 bg-gray-100">
      <button onClick={() => addSlide()} className="w-20 h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-bindle-400 hover:text-bindle-500 shrink-0 transition-colors">
        <Plus size={20} />
      </button>
      <div className="flex gap-2 overflow-x-auto py-1">
        {slides.map((s, i) => (
          <div key={s.id} draggable
            onDragStart={e => handleDragStart(e, i)} onDragOver={handleDragOver} onDrop={e => handleDrop(e, i)} onDragEnd={handleDragEnd}
            onClick={e => handleSlideClick(e, s.id, i)}
            className={cn('group relative w-28 h-[72px] border rounded cursor-pointer shrink-0 transition-all',
              s.id === currentSlideId ? 'border-bindle-400 ring-2 ring-bindle-200' : selectedSlideIds.includes(s.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400',
              dragIdx === i && 'opacity-50')}
          >
            <div className="w-full h-full bg-white rounded flex items-center justify-center text-[10px] text-gray-400">{i + 1}</div>
            <div className="absolute bottom-0 left-0 right-0 rounded-b flex items-center bg-black/20 text-white text-[9px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {renamingId === s.id ? (
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onBlur={submitRename} onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 bg-transparent outline-none text-[9px] text-gray-800 min-w-0" />
              ) : (
                <span className="truncate flex-1" onDoubleClick={e => startRename(e, s.id, s.name)} title="双击重命名">{s.name}</span>
              )}
              <GripHorizontal size={9} className="cursor-grab shrink-0 ml-0.5" />
            </div>
            <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100">
              <button onClick={e => { e.stopPropagation(); duplicateSlide(s.id) }} className="p-0.5 bg-white border border-gray-200 rounded-bl hover:bg-bindle-50"><Copy size={9} /></button>
              <button onClick={e => { e.stopPropagation(); deleteSlide(s.id) }} className="p-0.5 bg-white border border-gray-200 rounded-br hover:bg-red-50"><Trash2 size={9} className="text-red-400" /></button>
            </div>
          </div>
        ))}
      </div>
      {selectedSlideIds.length > 0 && (
        <button onClick={handleDeleteSelected} className="shrink-0 p-1.5 text-red-400 hover:bg-red-50 rounded" title="删除选中">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}
