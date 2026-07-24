import { useState, useCallback, useRef } from 'react'
import { X, GripVertical } from 'lucide-react'
import { usePptStore } from './store'
import type { CanvasElement } from './types'

const SCRUB = { threshold: 3, speed: 1, cursor: 'ew-resize' }

function ScrubInput({ label, value, onChange, min, max, step = 1, integer = true, labelLeft }: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; integer?: boolean; labelLeft?: boolean
}) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const ref = useRef({ v0: 0, mx: 0, scrubbing: false })

  const commit = useCallback((t: string) => {
    const n = parseFloat(t)
    if (!isNaN(n)) onChange(integer ? Math.round(n) : n)
    setEdit(false)
  }, [onChange, integer])

  const onPointerDown = (e: React.PointerEvent) => {
    if (edit) return
    ref.current = { v0: value, mx: e.clientX, scrubbing: false }
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - ref.current.mx
      if (!ref.current.scrubbing && Math.abs(dx) < SCRUB.threshold) return
      ref.current.scrubbing = true
      let v = ref.current.v0 + dx * SCRUB.speed * step
      if (min != null) v = Math.max(min, v)
      if (max != null) v = Math.min(max, v)
      onChange(integer ? Math.round(v) : Number(v.toFixed(1)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const display = integer ? Math.round(value) : Number(value.toFixed(1))
  const inputCls = 'h-[24px] px-1.5 text-xs border border-gray-200 rounded outline-none leading-none'
  const divCls = 'h-[24px] px-1.5 text-xs border border-gray-200 rounded select-none hover:border-bindle-300 flex items-center'
  const labelEl = <span className="text-[10px] text-gray-500 shrink-0">{label}</span>

  if (labelLeft) {
    return (
      <div className="flex items-center gap-1">
        {labelEl}
        {edit ? (
          <input autoFocus type="text" value={text}
            onChange={e => setText(e.target.value)}
            onBlur={() => commit(text)}
            onKeyDown={e => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') setEdit(false) }}
            className={`flex-1 min-w-0 ${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
          />
        ) : (
          <div
            onPointerDown={onPointerDown}
            onClick={() => { setText(String(display)); setEdit(true) }}
            className={`flex-1 min-w-0 ${divCls}`}
            style={{ cursor: SCRUB.cursor }}
          >{display}</div>
        )}
      </div>
    )
  }

  return (
    <div>
      {labelEl}
      {edit ? (
        <input autoFocus type="text" value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={e => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') setEdit(false) }}
          className={`w-full ${inputCls} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        />
      ) : (
        <div
          onPointerDown={onPointerDown}
          onClick={() => { setText(String(display)); setEdit(true) }}
          className={`w-full ${divCls}`}
          style={{ cursor: SCRUB.cursor }}
        >{display}</div>
      )}
    </div>
  )
}

export function PropsPanel() {
  const { slides, currentSlideId, selectedIds, updateElement, setSelectedIds } = usePptStore()
  const [activeTab, setActiveTab] = useState<'props' | 'layers'>('props')
  const slide = slides.find(s => s.id === currentSlideId)
  const el = selectedIds.length === 1 ? slide?.elements.find(e => e.id === selectedIds[0]) : null

  return (
    <div className="w-48 border-l border-gray-200 bg-white shrink-0 overflow-auto">
      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('props')} className={`flex-1 py-1.5 text-[11px] font-medium text-center ${activeTab === 'props' ? 'text-bindle-600 border-b-2 border-bindle-500' : 'text-gray-500 hover:text-gray-700'}`}>属性</button>
        <button onClick={() => setActiveTab('layers')} className={`flex-1 py-1.5 text-[11px] font-medium text-center ${activeTab === 'layers' ? 'text-bindle-600 border-b-2 border-bindle-500' : 'text-gray-500 hover:text-gray-700'}`}>图层</button>
      </div>
      <div className="p-3">
        {activeTab === 'props' ? (
          !el ? (
            <p className="text-xs text-gray-400 text-center pt-4">选择元素后可编辑属性</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-700">
                  {{ text: '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片' }[el.type]}
                </span>
                <button onClick={() => setSelectedIds([])} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
              <PanelFields el={el} updateElement={updateElement} slideId={slide!.id} />
            </>
          )
        ) : (
          <LayersTab slide={slide} />
        )}
      </div>
    </div>
  )
}

function PanelFields({ el, updateElement, slideId }: { el: CanvasElement; updateElement: any; slideId: string }) {
  const update = (changes: Partial<CanvasElement>) => updateElement(slideId, el.id, changes)
  const updateProps = (props: Partial<CanvasElement['props']>) => update({ props: { ...el.props, ...props } })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ScrubInput label="X" value={el.x} onChange={v => update({ x: v })} />
        <ScrubInput label="Y" value={el.y} onChange={v => update({ y: v })} />
        <ScrubInput label="W" value={el.w} onChange={v => update({ w: v })} min={10} />
        <ScrubInput label="H" value={el.h} onChange={v => update({ h: v })} min={10} />
      </div>
      <div>
        <label className="text-[10px] text-gray-500">透明度</label>
        <input type="range" min={0} max={1} step={0.1} value={el.opacity} onChange={e => update({ opacity: +e.target.value })} className="w-full" />
      </div>
      {el.type === 'text' && (
        <>
          <ScrubInput label="字号" value={el.props.fontSize || 16} onChange={v => updateProps({ fontSize: v })} min={1} max={999} />
          <div><label className="text-[10px] text-gray-500">颜色</label><input type="color" value={el.props.fontColor || '#333'} onChange={e => updateProps({ fontColor: e.target.value })} className="w-full h-7 border border-gray-200 rounded cursor-pointer" /></div>
        </>
      )}
      {el.type === 'arrow' && (
        <>
          <div><label className="text-[10px] text-gray-500">颜色</label><input type="color" value={el.props.stroke || '#94a3b8'} onChange={e => updateProps({ stroke: e.target.value })} className="w-full h-7 border border-gray-200 rounded cursor-pointer" /></div>
          <ScrubInput label="粗细" value={el.props.strokeWidth ?? 2} onChange={v => updateProps({ strokeWidth: v })} min={0} max={20} />
          <div>
            <label className="text-[10px] text-gray-500">起点</label>
            <div className="flex gap-1 mt-0.5">
              {[{ v: 'none', s: '—' }, { v: 'arrow', s: '▶' }, { v: 'circle', s: '●' }, { v: 'square', s: '■' }].map(opt => (
                <button key={opt.v} onClick={() => updateProps({ startShape: opt.v })} className={`flex-1 py-1 text-xs rounded border ${(el.props.startShape || 'none') === opt.v ? 'bg-bindle-50 border-bindle-300 text-bindle-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{opt.s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">终点</label>
            <div className="flex gap-1 mt-0.5">
              {[{ v: 'none', s: '—' }, { v: 'arrow', s: '▶' }, { v: 'circle', s: '●' }, { v: 'square', s: '■' }].map(opt => (
                <button key={opt.v} onClick={() => updateProps({ endShape: opt.v })} className={`flex-1 py-1 text-xs rounded border ${(el.props.endShape || 'arrow') === opt.v ? 'bg-bindle-50 border-bindle-300 text-bindle-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{opt.s}</button>
              ))}
            </div>
          </div>
        </>
      )}
      {(el.type === 'rect' || el.type === 'ellipse') && (
        <>
          <div><label className="text-[10px] text-gray-500">填充</label><input type="color" value={el.props.fill || '#e2e8f0'} onChange={e => updateProps({ fill: e.target.value })} className="w-full h-7 border border-gray-200 rounded cursor-pointer" /></div>
          <div><label className="text-[10px] text-gray-500">边框色</label><input type="color" value={el.props.stroke || '#cbd5e1'} onChange={e => updateProps({ stroke: e.target.value })} className="w-full h-7 border border-gray-200 rounded cursor-pointer" /></div>
          <ScrubInput label="边框粗细" value={el.props.strokeWidth ?? 1} onChange={v => updateProps({ strokeWidth: v })} min={0} max={20} />
          {el.type === 'rect' && (
            <>
              <ScrubInput label="圆角" value={el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadius: v })} min={0} max={200} />
              <div className="grid grid-cols-2 gap-2">
                <ScrubInput label="┌" labelLeft value={el.props.borderRadiusTL ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusTL: v })} min={0} max={200} />
                <ScrubInput label="┐" labelLeft value={el.props.borderRadiusTR ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusTR: v })} min={0} max={200} />
                <ScrubInput label="└" labelLeft value={el.props.borderRadiusBL ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusBL: v })} min={0} max={200} />
                <ScrubInput label="┘" labelLeft value={el.props.borderRadiusBR ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusBR: v })} min={0} max={200} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function LayersTab({ slide }: { slide: import('./types').Slide | undefined }) {
  const { setSelectedIds, selectedIds } = usePptStore()
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const dragState = useRef({ fromIdx: -1, startY: 0, moved: false, currentDrop: -1 })

  if (!slide || slide.elements.length === 0) {
    return <p className="text-xs text-gray-400 text-center pt-4">暂无元素</p>
  }

  const elements = [...slide.elements].reverse()

  const startRename = (el: CanvasElement) => {
    setRenamingId(el.id)
    setRenameVal(el.props.text || '')
  }
  const submitRename = () => {
    if (renamingId && renameVal.trim()) {
      const st = usePptStore.getState()
      if (st.currentSlideId) {
        const updatedSlide = {
          ...slide,
          elements: slide.elements.map(e => e.id === renamingId ? { ...e, props: { ...e.props, text: renameVal.trim() } } : e)
        }
        const allSlides = st.slides.map(s => s.id === st.currentSlideId ? updatedSlide : s)
        usePptStore.setState({ slides: allSlides })
      }
    }
    setRenamingId(null)
  }

  const getDropIdx = (clientY: number): number => {
    const list = document.querySelectorAll<HTMLElement>('[data-layer-idx]')
    for (let i = 0; i < list.length; i++) {
      const rect = list[i].getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) {
        const midY = rect.top + rect.height / 2
        return clientY < midY ? i : i + 1
      }
    }
    // above or below the list
    const first = list[0]?.getBoundingClientRect()
    const last = list[list.length - 1]?.getBoundingClientRect()
    if (first && clientY < first.top) return 0
    if (last && clientY > last.bottom) return list.length
    return -1
  }

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).tagName === 'INPUT') return
    const el = slide.elements[slide.elements.length - 1 - idx]
    setSelectedIds([el.id])
    dragState.current = { fromIdx: idx, startY: e.clientY, moved: false, currentDrop: -1 }
    setDragIdx(idx)

    const onMove = (ev: PointerEvent) => {
      const dy = Math.abs(ev.clientY - dragState.current.startY)
      if (dy < 4 && !dragState.current.moved) return
      if (!dragState.current.moved) dragState.current.moved = true
      const d = getDropIdx(ev.clientY)
      if (d >= 0 && d !== dragState.current.currentDrop) {
        dragState.current.currentDrop = d
        setDropIdx(d)
      }
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const { fromIdx, moved } = dragState.current
      dragState.current = { fromIdx: -1, startY: 0, moved: false, currentDrop: -1 }
      setDragIdx(null)
      setDropIdx(null)
      if (!moved) return
      const d = getDropIdx(ev.clientY)
      if (d >= 0 && d !== fromIdx) {
        const total = slide.elements.length
        const fromReal = total - 1 - fromIdx
        const toReal = total - 1 - d
        const adjustedTo = fromIdx < d ? toReal + 1 : toReal  // adjust for removal
        const ns = [...slide.elements]
        const [movedEl] = ns.splice(fromReal, 1)
        ns.splice(Math.max(0, adjustedTo), 0, movedEl)
        const st = usePptStore.getState()
        if (st.currentSlideId) {
          usePptStore.setState({ slides: st.slides.map(s => s.id === st.currentSlideId ? { ...slide, elements: ns } : s) })
        }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const isSelected = (el: CanvasElement) => selectedIds.includes(el.id)

  return (
    <div className="space-y-0 select-none">
      {elements.map((el, i) => (
        <div key={el.id}>
          {dropIdx === i && dragIdx !== null && dragIdx !== i && (
            <div className="h-[2px] bg-blue-500 mx-1 transition-all duration-150" />
          )}
          <div
            data-layer-idx={i}
            onPointerDown={e => onPointerDown(e, i)}
            className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs transition-colors ${isSelected(el) ? 'bg-bindle-50' : 'hover:bg-gray-50'} ${dragIdx === i ? 'opacity-40' : ''}`}
            style={{ cursor: dragIdx !== null ? 'grabbing' : 'grab' }}
          >
            <GripVertical size={10} className="text-gray-300 shrink-0" />
            <div className="w-3 h-3 rounded border border-gray-300 shrink-0" style={{ background: el.props.fill || '#e2e8f0' }} />
            {renamingId === el.id ? (
              <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                onBlur={submitRename}
                onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                className="flex-1 min-w-0 h-[22px] text-xs border border-gray-200 rounded px-1 outline-none select-text"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="truncate flex-1" onDoubleClick={el.type === 'text' ? () => startRename(el) : undefined}>
                {{ text: el.props.text?.slice(0, 16) || '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片' }[el.type]}
              </span>
            )}
          </div>
        </div>
      ))}
      {dropIdx === elements.length && dragIdx !== null && (
        <div className="h-[2px] bg-blue-500 mx-1 transition-all duration-150" />
      )}
    </div>
  )
}
