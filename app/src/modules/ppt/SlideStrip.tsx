import { useState, useCallback, useRef } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePptStore } from './store'
import type { Slide } from './types'

export function SlideStrip() {
  const s = usePptStore()
  const { slides, currentSlideId, selectedSlideIds, setCurrentSlide, addSlide, deleteSlide, deleteSlides, duplicateSlide, moveSlide, renameSlide } = s
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const lastClickedRef = useRef<number | null>(null)

  const handleClick = useCallback((e: React.MouseEvent, id: string, idx: number) => {
    if (e.ctrlKey || e.metaKey) {
      const sel = usePptStore.getState().selectedSlideIds
      usePptStore.setState({ selectedSlideIds: sel.includes(id) ? sel.filter(sid => sid !== id) : [...sel, id] })
      lastClickedRef.current = idx
    } else if (e.shiftKey && lastClickedRef.current !== null) {
      const from = Math.min(lastClickedRef.current, idx)
      const to = Math.max(lastClickedRef.current, idx)
      const range = usePptStore.getState().slides.slice(from, to + 1).map(sl => sl.id)
      usePptStore.setState({ selectedSlideIds: range })
    } else {
      setCurrentSlide(id)
      usePptStore.setState({ selectedSlideIds: [] })
      lastClickedRef.current = idx
    }
  }, [setCurrentSlide])

  const startRename = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation(); setRenamingId(id); setRenameVal(name)
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
      <div className="flex gap-2 overflow-x-auto py-1 items-center">
        {slides.map((sl, i) => (
          <div key={sl.id}>
            {dragOverIdx === i && dragIdx !== null && dragIdx !== i && (
              <div className="w-1 h-[72px] bg-blue-500 rounded shrink-0" />
            )}
            <SlideThumb
              slide={sl}
              index={i}
              isActive={sl.id === currentSlideId}
              isSelected={selectedSlideIds.includes(sl.id)}
              isDragging={dragIdx === i}
              renamingId={renamingId}
              renameVal={renameVal}
              onChangeRenameVal={setRenameVal}
              onSubmitRename={submitRename}
              onStartRename={startRename}
              onClick={handleClick}
              onDragStart={() => { console.log('dragStart', i); setDragIdx(i) }}
              onDragOver={(e) => { e.preventDefault(); console.log('dragOver', i); setDragOverIdx(i) }}
              onDragLeave={() => { console.log('dragLeave', i); setDragOverIdx(null) }}
              onDragEnd={() => { console.log('dragEnd'); setDragIdx(null); setDragOverIdx(null) }}
              onDrop={() => {
                console.log('drop at', i, 'from idx', dragIdx)
                if (dragIdx !== null && dragIdx !== i) { console.log('moving', dragIdx, '->', i); moveSlide(dragIdx, i) }
                setDragIdx(null); setDragOverIdx(null)
              }}
              onDuplicate={() => duplicateSlide(sl.id)}
              onDelete={() => deleteSlide(sl.id)}
            />
          </div>
        ))}
        {dragOverIdx === slides.length && dragIdx !== null && (
          <div className="w-1 h-[72px] bg-blue-500 rounded shrink-0" />
        )}
      </div>
      <button onClick={() => addSlide()} className="w-20 h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-bindle-400 hover:text-bindle-500 shrink-0 transition-colors">
        <Plus size={20} />
      </button>
      {selectedSlideIds.length > 0 && (
        <button onClick={handleDeleteSelected} className="shrink-0 p-1.5 text-red-400 hover:bg-red-50 rounded" title="Delete selected">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function SlideThumb({ slide, index, isActive, isSelected, isDragging, renamingId, renameVal, onChangeRenameVal, onSubmitRename, onStartRename, onClick, onDragStart, onDragOver, onDragLeave, onDragEnd, onDrop, onDuplicate, onDelete }: {
  slide: Slide; index: number; isActive: boolean; isSelected: boolean; isDragging: boolean
  renamingId: string | null; renameVal: string
  onChangeRenameVal: (v: string) => void; onSubmitRename: () => void
  onStartRename: (e: React.MouseEvent, id: string, name: string) => void
  onClick: (e: React.MouseEvent, id: string, idx: number) => void
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDragEnd: () => void; onDrop: () => void
  onDuplicate: () => void; onDelete: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDragEnd={onDragEnd} onDrop={onDrop}
      onClick={e => onClick(e, slide.id, index)}
      className={cn('group relative w-32 h-[72px] border rounded cursor-pointer shrink-0 transition-all select-none',
        isActive ? 'border-bindle-400 ring-2 ring-bindle-200' : isSelected ? 'border-blue-300' : 'border-gray-300 hover:border-gray-400',
        isDragging && 'opacity-30')}
    >
      <div className="w-full h-[54px] bg-white rounded-t overflow-hidden">
        <MiniSlide slide={slide} />
      </div>
      <div className="h-[17px] flex items-center px-1 bg-gray-200/50 rounded-b">
        {renamingId === slide.id ? (
          <input autoFocus value={renameVal} onChange={e => onChangeRenameVal(e.target.value)}
            onBlur={onSubmitRename} onKeyDown={e => { if (e.key === 'Enter') onSubmitRename(); if (e.key === 'Escape') { onChangeRenameVal(slide.name); onSubmitRename() } }}
            onClick={e => e.stopPropagation()} className="flex-1 bg-transparent outline-none text-[9px] text-gray-900 min-w-0" />
        ) : (
          <span className="truncate flex-1 text-[9px] text-gray-800" onDoubleClick={e => onStartRename(e, slide.id, slide.name)}>{slide.name}</span>
        )}
      </div>
      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 flex">
        <button onClick={e => { e.stopPropagation(); onDuplicate() }} className="p-0.5 bg-white border border-gray-200 rounded-bl hover:bg-bindle-50"><Copy size={9} /></button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-0.5 bg-white border border-gray-200 rounded-br hover:bg-red-50"><Trash2 size={9} className="text-red-400" /></button>
      </div>
    </div>
  )
}

function MiniSlide({ slide }: { slide: Slide }) {
  const s = 0.042 // 54/1280
  return (
    <div style={{ width: 1280 * s, height: 720 * s, background: slide.background || '#fff', position: 'relative', overflow: 'hidden' }}>
      {slide.elements.slice(0, 15).map(el => (
        <div key={el.id} style={{ position: 'absolute', left: el.x * s, top: el.y * s, width: Math.max(el.w * s, 2), height: Math.max(el.h * s, 1), background: el.type === 'text' ? '#d1d5db' : el.type === 'image' ? '#93c5fd' : el.props.fill || '#e2e8f0', borderRadius: el.type === 'ellipse' ? '50%' : 0, opacity: el.opacity }} />
      ))}
    </div>
  )
}
