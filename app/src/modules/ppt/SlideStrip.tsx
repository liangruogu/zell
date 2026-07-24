import { useState, useCallback, useRef } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePptStore } from './store'
import type { Slide } from './types'

export function SlideStrip() {
  const { slides, currentSlideId, selectedSlideIds, setCurrentSlide, addSlide, deleteSlide, deleteSlides, duplicateSlide, moveSlide, renameSlide } = usePptStore()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const lastClickedRef = useRef<number | null>(null)

  const handleClick = useCallback((e: React.MouseEvent, id: string, idx: number) => {
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
    if (selectedSlideIds.length > 0) deleteSlides(selectedSlideIds)
    else if (currentSlideId) deleteSlide(currentSlideId)
  }

  return (
    <div className="h-28 border-t border-gray-200 flex items-center px-3 gap-2 shrink-0 bg-gray-100">
      <button onClick={() => addSlide()} className="w-20 h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-bindle-400 hover:text-bindle-500 shrink-0 transition-colors">
        <Plus size={20} />
      </button>
      <div className="flex gap-2 overflow-x-auto py-1">
        {slides.map((s, i) => (
          <SlideThumb
            key={s.id}
            slide={s}
            index={i}
            isActive={s.id === currentSlideId}
            isSelected={selectedSlideIds.includes(s.id)}
            isDragging={dragIdx === i}
            renamingId={renamingId}
            renameVal={renameVal}
            onChangeRenameVal={setRenameVal}
            onSubmitRename={submitRename}
            onStartRename={startRename}
            onClick={handleClick}
            onDragStart={(e) => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) moveSlide(dragIdx, i); setDragIdx(null) }}
            onDuplicate={() => duplicateSlide(s.id)}
            onDelete={() => deleteSlide(s.id)}
          />
        ))}
      </div>
      {selectedSlideIds.length > 0 && (
        <button onClick={handleDeleteSelected} className="shrink-0 p-1.5 text-red-400 hover:bg-red-50 rounded" title="Delete selected">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function SlideThumb({ slide, index, isActive, isSelected, isDragging, renamingId, renameVal, onChangeRenameVal, onSubmitRename, onStartRename, onClick, onDragStart, onDragOver, onDrop, onDuplicate, onDelete }: {
  slide: Slide; index: number; isActive: boolean; isSelected: boolean; isDragging: boolean
  renamingId: string | null; renameVal: string
  onChangeRenameVal: (v: string) => void; onSubmitRename: () => void
  onStartRename: (e: React.MouseEvent, id: string, name: string) => void
  onClick: (e: React.MouseEvent, id: string, idx: number) => void
  onDragStart: (e: React.DragEvent) => void; onDragOver: (e: React.DragEvent) => void; onDrop: (e: React.DragEvent) => void
  onDuplicate: () => void; onDelete: () => void
}) {
  const borderClass = isActive ? 'border-bindle-400 ring-2 ring-bindle-200' : isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400'

  return (
    <div
      draggable
      onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
      onClick={e => onClick(e, slide.id, index)}
      className={cn('group relative w-32 h-[72px] border rounded cursor-pointer shrink-0 transition-all select-none', borderClass, isDragging && 'opacity-50')}
    >
      {/* Mini thumbnail preview */}
      <div className="w-full h-[56px] bg-white rounded-t flex items-center justify-center overflow-hidden relative" style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
        <MiniSlide slide={slide} />
      </div>

      {/* Name bar */}
      <div className="h-[16px] flex items-center px-1 bg-gray-200/50 rounded-b">
        {renamingId === slide.id ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => onChangeRenameVal(e.target.value)}
            onBlur={onSubmitRename}
            onKeyDown={e => { if (e.key === 'Enter') onSubmitRename(); if (e.key === 'Escape') { onChangeRenameVal(slide.name); onSubmitRename() } }}
            onClick={e => e.stopPropagation()}
            className="flex-1 bg-transparent outline-none text-[9px] text-gray-900 min-w-0"
          />
        ) : (
          <span className="truncate flex-1 text-[9px] text-gray-800" onDoubleClick={e => onStartRename(e, slide.id, slide.name)}>{slide.name}</span>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex">
        <button onClick={e => { e.stopPropagation(); onDuplicate() }} className="p-0.5 bg-white border border-gray-200 rounded-bl hover:bg-bindle-50" title="Copy"><Copy size={9} /></button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-0.5 bg-white border border-gray-200 rounded-br hover:bg-red-50" title="Delete"><Trash2 size={9} className="text-red-400" /></button>
      </div>
    </div>
  )
}

function MiniSlide({ slide }: { slide: Slide }) {
  const scale = 0.04 // 56/1280 ≈ 0.044
  return (
    <div style={{ width: 1280 * scale, height: 720 * scale, background: slide.background || '#fff', position: 'relative', overflow: 'hidden' }}>
      {slide.elements.slice(0, 20).map(el => (
        <div key={el.id} style={{
          position: 'absolute', left: el.x * scale, top: el.y * scale, width: Math.max(el.w * scale, 2), height: Math.max(el.h * scale, 1),
          background: el.type === 'text' ? '#d1d5db' : el.type === 'image' ? '#93c5fd' : el.props.fill || '#e2e8f0',
          border: 'none', borderRadius: el.type === 'ellipse' ? '50%' : el.props.borderRadius ? `${(el.props.borderRadius || 0) * scale}px` : 0,
          opacity: el.opacity,
        }} />
      ))}
    </div>
  )
}
