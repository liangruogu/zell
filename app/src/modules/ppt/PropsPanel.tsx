import { useState, useCallback, useRef } from 'react'
import { X, GripVertical } from 'lucide-react'
import { usePptStore } from './store'
import type { CanvasElement } from './types'

const SCRUB = { threshold: 3, speed: 1, cursor: 'ew-resize' }

function ScrubInput({ label, value, onChange, min, max, step = 1, integer = true }: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; integer?: boolean
}) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const ref = useRef({ v0: 0, mx: 0, scrubbing: false })
  const inputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div>
      <label className="text-[10px] text-gray-500">{label}</label>
      {edit ? (
        <input ref={inputRef} autoFocus type="text" value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={e => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') setEdit(false) }}
          className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={{ cursor: 'text' }}
        />
      ) : (
        <div
          onPointerDown={onPointerDown}
          onClick={() => { setText(String(display)); setEdit(true) }}
          className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded cursor-ew-resize select-none hover:border-bindle-300"
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
                <ScrubInput label="↖" value={el.props.borderRadiusTL ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusTL: v })} min={0} max={200} />
                <ScrubInput label="↗" value={el.props.borderRadiusTR ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusTR: v })} min={0} max={200} />
                <ScrubInput label="↙" value={el.props.borderRadiusBL ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusBL: v })} min={0} max={200} />
                <ScrubInput label="↘" value={el.props.borderRadiusBR ?? el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadiusBR: v })} min={0} max={200} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function LayersTab({ slide }: { slide: import('./types').Slide | undefined }) {
  const { updateElement } = usePptStore()
  const [dragLayerIdx, setDragLayerIdx] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  if (!slide || slide.elements.length === 0) {
    return <p className="text-xs text-gray-400 text-center pt-4">暂无元素</p>
  }

  const elements = [...slide.elements].reverse()

  const onPointerDown = (e: React.PointerEvent, idx: number) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = idx
    setDragLayerIdx(idx)
    const onMove = (ev: PointerEvent) => {
      const list = document.querySelectorAll<HTMLElement>('[data-layer-idx]')
      let targetIdx = -1
      list.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          targetIdx = i
        }
      })
      if (targetIdx >= 0) setDragLayerIdx(targetIdx)
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragRef.current === null) return
      const fromIdx = dragRef.current
      dragRef.current = null
      const list = document.querySelectorAll<HTMLElement>('[data-layer-idx]')
      let toIdx = fromIdx
      list.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (ev.clientY >= rect.top && ev.clientY <= rect.bottom) toIdx = i
      })
      setDragLayerIdx(null)
      if (toIdx !== fromIdx) {
        // reorder elements: reverse indices since list is reversed
        const total = slide.elements.length
        const fromReal = total - 1 - fromIdx
        const toReal = total - 1 - toIdx
        const elId = slide.elements[fromReal].id
        const ns = [...slide.elements]
        ns.splice(fromReal, 1)
        ns.splice(toReal, 0, slide.elements[fromReal])
        const st = usePptStore.getState()
        if (st.currentSlideId) {
          const updatedSlide = { ...slide, elements: ns }
          const allSlides = st.slides.map(s => s.id === st.currentSlideId ? updatedSlide : s)
          usePptStore.setState({ slides: allSlides })
        }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="space-y-0.5">
      {elements.map((el, i) => (
        <div
          key={el.id}
          data-layer-idx={i}
          onPointerDown={e => onPointerDown(e, i)}
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs cursor-pointer transition-colors ${dragLayerIdx === i ? 'bg-bindle-50 ring-1 ring-bindle-300' : 'hover:bg-gray-50'} ${i === dragLayerIdx && dragLayerIdx !== null ? 'opacity-50' : ''}`}
          style={{ cursor: 'grab' }}
        >
          <GripVertical size={10} className="text-gray-300 shrink-0" />
          <div className="w-3 h-3 rounded border border-gray-300 shrink-0" style={{ background: el.props.fill || '#e2e8f0' }} />
          <span className="truncate flex-1">
            {{ text: el.props.text?.slice(0, 12) || '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片' }[el.type]}
          </span>
        </div>
      ))}
    </div>
  )
}
