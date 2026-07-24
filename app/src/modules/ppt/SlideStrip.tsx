import { useState, useCallback, useRef, useEffect } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const [showGhost, setShowGhost] = useState(false)
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    if (showGhost && ghostRef.current) {
      ghostRef.current.style.left = `${lastPointerRef.current.x - dragState.current.offsetX}px`
      ghostRef.current.style.top = `${lastPointerRef.current.y - dragState.current.offsetY}px`
    }
  }, [showGhost])

  // manual pointer-based drag reorder (HTML5 DnD unreliable in Tauri WebView2)
  const dragState = useRef<{
    active: boolean
    fromIdx: number
    startX: number
    startY: number
    moved: boolean
    currentDropIdx: number
    offsetX: number
    offsetY: number
  }>({ active: false, fromIdx: -1, startX: 0, startY: 0, moved: false, currentDropIdx: -1, offsetX: 0, offsetY: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const getSlideIdx = (target: HTMLElement): number => {
      const slideEl = target.closest('[data-slide-idx]') as HTMLElement | null
      return slideEl ? parseInt(slideEl.dataset.slideIdx || '', 10) : -1
    }

    const findDropIdx = (clientX: number, clientY: number, fromIdx: number): number => {
      const st = usePptStore.getState()
      const total = st.slides.length
      if (total === 0) return -1

      for (let i = 0; i < total; i++) {
        const slideEl = document.querySelector(`[data-slide-idx="${i}"]`)
        if (!slideEl) continue
        const rect = slideEl.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          const midX = rect.left + rect.width / 2
          return clientX < midX ? i : i + 1
        }
      }
      const stripRect = el.getBoundingClientRect()
      if (clientY >= stripRect.top && clientY <= stripRect.bottom && clientX >= stripRect.left && clientX <= stripRect.right) {
        for (let i = 0; i < total; i++) {
          const slideEl = document.querySelector(`[data-slide-idx="${i}"]`)
          if (slideEl) {
            const rect = slideEl.getBoundingClientRect()
            if (clientX < rect.left) return i
          }
        }
        return total
      }
      return -1
    }

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      const idx = getSlideIdx(target)
      if (idx < 0) return
      if (target.closest('button') || target.closest('input')) return
      const slideEl = document.querySelector(`[data-slide-idx="${idx}"]`)
      const rect = slideEl?.getBoundingClientRect()
      dragState.current = {
        active: true,
        fromIdx: idx,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        currentDropIdx: -1,
        offsetX: rect ? e.clientX - rect.left : 0,
        offsetY: rect ? e.clientY - rect.top : 0,
      }
      setDragIdx(idx)
    }

    const onPointerMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      if (!dragState.current.active) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      const dist = Math.abs(dx) + Math.abs(dy)
      if (dist < 5 && !dragState.current.moved) return

      if (!dragState.current.moved) {
        dragState.current.moved = true
        setShowGhost(true)
      }

      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX - dragState.current.offsetX}px`
        ghostRef.current.style.top = `${e.clientY - dragState.current.offsetY}px`
      }

      const dropIdx = findDropIdx(e.clientX, e.clientY, dragState.current.fromIdx)
      if (dropIdx >= 0 && dropIdx !== dragState.current.currentDropIdx) {
        dragState.current.currentDropIdx = dropIdx
        setDragOverIdx(dropIdx)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!dragState.current.active) return
      const { fromIdx, moved } = dragState.current

      if (moved) {
        const dropIdx = findDropIdx(e.clientX, e.clientY, fromIdx)
        if (dropIdx >= 0 && dropIdx !== fromIdx) {
          const realTo = fromIdx < dropIdx ? dropIdx - 1 : dropIdx
          moveSlide(fromIdx, realTo)
        }
      }
      dragState.current = { active: false, fromIdx: -1, startX: 0, startY: 0, moved: false, currentDropIdx: -1, offsetX: 0, offsetY: 0 }
      setDragIdx(null)
      setDragOverIdx(null)
      setShowGhost(false)
    }

    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [moveSlide])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const st = usePptStore.getState()
        if (st.selectedSlideIds.length > 0) {
          st.deleteSlides(st.selectedSlideIds)
        } else if (st.currentSlideId) {
          st.deleteSlide(st.currentSlideId)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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
      {showGhost && dragIdx !== null && slides[dragIdx] && (
        <div ref={ghostRef} style={{
          position: 'fixed',
          width: 128,
          height: 72,
          zIndex: 9999,
          pointerEvents: 'none',
          opacity: 0.85,
          transform: 'rotate(-3deg) scale(1.05)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          borderRadius: 4,
        }}>
          <div className="w-full h-full bg-white rounded overflow-hidden relative">
            <MiniSlide slide={slides[dragIdx]} />
            <span className="absolute bottom-0.5 left-1 text-[10px] text-gray-900 font-medium select-none">
              {/^幻灯片\s*\d+$/.test(slides[dragIdx].name) ? dragIdx! + 1 : slides[dragIdx].name}
            </span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex gap-2 overflow-x-auto py-1 items-center">
        {slides.map((sl, i) => (
          <div key={sl.id} data-slide-idx={i} className="flex shrink-0 items-center">
            <div
              className="h-[72px] bg-blue-500 rounded shrink-0 transition-[width,margin] duration-200 ease-out overflow-hidden"
              style={{
                width: (dragOverIdx === i && dragIdx !== null && dragIdx !== i) ? 4 : 0,
                marginRight: (dragOverIdx === i && dragIdx !== null && dragIdx !== i) ? 4 : 0,
              }}
            />
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
              onDuplicate={() => duplicateSlide(sl.id)}
              onDelete={() => deleteSlide(sl.id)}
            />
          </div>
        ))}
        <div
          className="h-[72px] bg-blue-500 rounded shrink-0 transition-[width,margin] duration-200 ease-out overflow-hidden"
          style={{
            width: (dragOverIdx === slides.length && dragIdx !== null) ? 4 : 0,
            marginRight: (dragOverIdx === slides.length && dragIdx !== null) ? 4 : 0,
          }}
        />
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

function SlideThumb({ slide, index, isActive, isSelected, isDragging, renamingId, renameVal, onChangeRenameVal, onSubmitRename, onStartRename, onClick, onDuplicate, onDelete }: {
  slide: Slide; index: number; isActive: boolean; isSelected: boolean; isDragging: boolean
  renamingId: string | null; renameVal: string
  onChangeRenameVal: (v: string) => void; onSubmitRename: () => void
  onStartRename: (e: React.MouseEvent, id: string, name: string) => void
  onClick: (e: React.MouseEvent, id: string, idx: number) => void
  onDuplicate: () => void; onDelete: () => void
}) {
  const isDefaultName = /^幻灯片\s*\d+$/.test(slide.name)
  return (
    <div
      onClick={e => onClick(e, slide.id, index)}
      onDoubleClick={e => onStartRename(e, slide.id, slide.name)}
      className={cn('group relative w-32 h-[72px] border rounded cursor-pointer shrink-0 transition-all select-none',
        isActive ? 'border-bindle-400 ring-2 ring-bindle-200' : isSelected ? 'border-blue-300' : 'border-gray-300 hover:border-gray-400',
        isDragging && 'opacity-30')}
    >
      <div className="w-full h-full bg-white rounded overflow-hidden">
        <MiniSlide slide={slide} />
      </div>
      {renamingId === slide.id ? (
        <input autoFocus value={renameVal} onChange={e => onChangeRenameVal(e.target.value)}
          onBlur={onSubmitRename} onKeyDown={e => { if (e.key === 'Enter') onSubmitRename(); if (e.key === 'Escape') { onChangeRenameVal(slide.name); onSubmitRename() } }}
          onClick={e => e.stopPropagation()}
          className="absolute bottom-0.5 left-1 right-1 bg-white/90 text-gray-900 text-[9px] outline-none rounded px-0.5 border border-gray-200" />
      ) : (
        <span className="absolute bottom-0.5 left-1 text-[10px] text-gray-900 font-medium select-none">
          {isDefaultName ? index + 1 : slide.name}
        </span>
      )}
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
