import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { X, GripVertical, Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ArrowUpDown } from 'lucide-react'
import { usePptStore } from './store'
import type { CanvasElement } from './types'
import { useRichText } from './elements/RichTextEditor'
import { renderRichTextHTML } from './elements/RichTextEditor'
import { toggleListInJSON, hasListInJSON, removeListFromJSON } from './elements/TextElement'
import { logger } from '@/lib/logger'

const SCRUB = { threshold: 3, speed: 1 }

// recent color palette — persisted to localStorage
const STORAGE_KEY = 'zell_recent_colors'
function loadRecentColors(): string[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch (e) { logger.error('Failed to load recent colors', e); return [] }
}
function saveRecentColors() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recentColors))
}
const recentColors: string[] = loadRecentColors()
function addRecentColor(c: string) {
  const idx = recentColors.indexOf(c)
  if (idx >= 0) recentColors.splice(idx, 1)
  recentColors.unshift(c)
  if (recentColors.length > 16) recentColors.pop()
  saveRecentColors()
}
// sync recent colors with currently-used colors in the project
function syncRecentColors(slides: { elements: { props: { fill?: string; stroke?: string; fontColor?: string; shadowColor?: string; shadows?: { color: string }[] } }[] }[]) {
  const used = new Set<string>()
  for (const sl of slides) {
    for (const el of sl.elements) {
      const p = el.props
      if (p.fill) used.add(p.fill)
      if (p.stroke) used.add(p.stroke)
      if (p.fontColor) used.add(p.fontColor)
      if (p.shadowColor) used.add(p.shadowColor)
      if (p.shadows) p.shadows.forEach(s => used.add(s.color))
    }
  }
  // merge: keep existing recent colors that are still used, add new ones
  const merged = recentColors.filter(c => used.has(c))
  for (const c of used) { if (!merged.includes(c)) merged.push(c) }
  recentColors.length = 0
  recentColors.push(...merged.slice(0, 16))
  saveRecentColors()
}

/* ── CSS-only grip indicator (two vertical lines) ── */
function Grip({ size = 12 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center shrink-0" style={{ width: size + 4, height: '100%', touchAction: 'none', cursor: 'ew-resize' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        <div className="bg-gray-300 rounded-full" style={{ width: 2, height: size - 2 }} />
        <div className="bg-gray-300 rounded-full" style={{ width: 2, height: size - 2 }} />
      </div>
    </div>
  )
}

function ScrubInput({ label, value, onChange, min, max, step = 1, integer = true, labelLeft }: {
  label: string; value: number; onChange: (v: number) => void
  min?: number; max?: number; step?: number; integer?: boolean; labelLeft?: boolean
}) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const ref = useRef({ v0: 0, mx: 0, scrubbing: false })

  const [scrubbing, setScrubbing] = useState(false)

  const commit = useCallback((t: string) => {
    const n = parseFloat(t)
    if (!isNaN(n)) onChange(integer ? Math.round(n) : n)
    setEdit(false)
  }, [onChange, integer])

  // lock cursor during scrub
  useEffect(() => {
    if (scrubbing) {
      document.body.style.cursor = 'ew-resize'
      return () => { document.body.style.cursor = '' }
    }
  }, [scrubbing])

  const onGripDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    if (edit) return
    ref.current = { v0: value, mx: e.clientX, scrubbing: false }
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - ref.current.mx
      if (!ref.current.scrubbing && Math.abs(dx) < SCRUB.threshold) return
      ref.current.scrubbing = true
      setScrubbing(true)
      let v = ref.current.v0 + dx * SCRUB.speed * step
      if (min != null) v = Math.max(min, v)
      if (max != null) v = Math.min(max, v)
      onChange(integer ? Math.round(v) : Number(v.toFixed(1)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setScrubbing(false)
      if (!ref.current.scrubbing) { setText(String(integer ? Math.round(value) : Number(value.toFixed(1)))); setEdit(true) }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const display = integer ? Math.round(value) : Number(value.toFixed(1))
  const labelEl = <span className="text-[12px] text-gray-500 shrink-0">{label}</span>

  const field = (
    <div className="group h-[26px] bg-gray-100 rounded flex items-center overflow-hidden">
      <div onPointerDown={onGripDown} className="h-full shrink-0">
        <Grip size={12} />
      </div>
      {edit ? (
        <input autoFocus type="text" value={text}
          onChange={e => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={e => { if (e.key === 'Enter') commit(text); if (e.key === 'Escape') setEdit(false) }}
          className="flex-1 min-w-0 h-full text-[13px] bg-transparent outline-none text-center select-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <span onClick={() => { setText(String(display)); setEdit(true) }}
          className="flex-1 text-[13px] text-gray-700 cursor-default text-center select-none">{display}</span>
      )}
    </div>
  )

  if (labelLeft) {
    return (
      <div className="flex items-center gap-1">
        {labelEl}
        <div className="flex-1 min-w-0">{field}</div>
      </div>
    )
  }

  return (
    <div>
      {labelEl}
      {field}
    </div>
  )
}

function expandHex(raw: string): string | null {
  const h = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase()
  if (h.length === 0) return null
  if (h.length === 1) return h.repeat(6)
  if (h.length === 2) return h.repeat(3)
  if (h.length === 3) return h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length === 4 || h.length === 5) return expandHex(h.slice(0, 3))
  return h
}

function ColorChip({ label, color, onChange, opacity, onOpacityChange }: {
  label: string; color: string; onChange: (c: string) => void
  opacity?: number; onOpacityChange?: (o: number) => void
}) {
  const [hexEdit, setHexEdit] = useState(false)
  const [hexText, setHexText] = useState('')
  const [opEdit, setOpEdit] = useState(false)
  const [opText, setOpText] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 0 })
  const swatchRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const opRef = useRef({ v0: 0, mx: 0 })
  const opDisplay = Math.round((opacity ?? 1) * 100)

  useEffect(() => {
    if (!showPicker) return
    const updatePos = () => {
      if (swatchRef.current) {
        const rect = swatchRef.current.getBoundingClientRect()
        setPickerPos({ x: rect.right - 160, y: rect.bottom + 4 })
      }
    }
    updatePos()
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showPicker])

  const handleColorChange = (c: string) => {
    addRecentColor(c)
    onChange(c)
  }

  const onOpGrip = (e: React.PointerEvent) => {
    e.stopPropagation()
    opRef.current = { v0: opDisplay, mx: e.clientX }
    const onMove = (ev: PointerEvent) => {
      const v = Math.max(0, Math.min(100, Math.round(opRef.current.v0 + (ev.clientX - opRef.current.mx))))
      onOpacityChange?.(v / 100)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const commitHex = () => {
    const expanded = expandHex(hexText)
    if (expanded && expanded.length === 6) handleColorChange('#' + expanded)
    setHexEdit(false)
  }
  const commitOp = () => {
    const n = parseInt(opText)
    if (!isNaN(n)) onOpacityChange?.(Math.max(0, Math.min(100, n)) / 100)
    setOpEdit(false)
  }

  return (
    <div>
      {label && <label className="text-[12px] text-gray-500">{label}</label>}
      <div className="flex items-center gap-1 mt-0.5 bg-gray-100 rounded h-[24px] px-1">
        <div className="relative shrink-0">
          <button ref={swatchRef} onClick={() => setShowPicker(!showPicker)} className="block">
            <div className="rounded-sm border border-gray-300" style={{ width: 16, height: 16, background: color }} />
          </button>
          {showPicker && createPortal(
            <div ref={pickerRef} data-no-deselect className="fixed p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[99999] space-y-1.5" style={{ width: 160, top: pickerPos.y, left: pickerPos.x }}>
              <span className="text-[10px] text-gray-400">取色器</span>
              <div className="flex items-center gap-1">
                <input type="color" value={color} onChange={e => handleColorChange(e.target.value)} className="w-6 h-6 cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                <span className="text-[12px] text-gray-600 font-mono">{color}</span>
              </div>
              {recentColors.length > 0 && (
                <>
                  <span className="text-[10px] text-gray-400">最近使用</span>
                  <div className="flex gap-0.5 flex-wrap">
                    {recentColors.slice(0, 16).map(c => (
                      <button key={c} onClick={() => handleColorChange(c)}
                        className="w-5 h-5 rounded-sm border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                        style={{ background: c }} title={c}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>,
            document.body
          )}
        </div>
        {hexEdit ? (
          <input autoFocus type="text" value={hexText}
            onChange={e => setHexText(e.target.value)}
            onBlur={commitHex}
            onKeyDown={e => { if (e.key === 'Enter') commitHex(); if (e.key === 'Escape') setHexEdit(false) }}
            className="flex-1 h-full min-w-0 text-[12px] font-mono bg-transparent outline-none select-text"
          />
        ) : (
          <span onClick={() => { setHexText(color.replace('#', '')); setHexEdit(true) }}
            className="flex-1 text-[12px] text-gray-600 font-mono cursor-default truncate">{color}</span>
        )}
        {onOpacityChange && opacity != null && (
          <div className="flex items-center gap-0.5 shrink-0">
            <div onPointerDown={onOpGrip} className="h-full shrink-0">
              <Grip size={10} />
            </div>
            {opEdit ? (
              <input autoFocus type="text" value={opText}
                onChange={e => setOpText(e.target.value)}
                onBlur={commitOp}
                onKeyDown={e => { if (e.key === 'Enter') commitOp(); if (e.key === 'Escape') setOpEdit(false) }}
                className="w-8 h-full text-[12px] text-center bg-transparent outline-none select-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            ) : (
              <span onClick={() => { setOpText(String(opDisplay)); setOpEdit(true) }} className="text-[12px] text-gray-600 cursor-default min-w-[24px] text-right">{opDisplay}%</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function PropsPanel() {
  const { slides, currentSlideId, selectedIds, updateElement, setSelectedIds } = usePptStore()
  const [activeTab, setActiveTab] = useState<'props' | 'layers'>('props')
  const [renameElId, setRenameElId] = useState<string | null>(null)
  const [renameElVal, setRenameElVal] = useState('')
  const slide = slides.find(s => s.id === currentSlideId)
  const el = selectedIds.length === 1 ? slide?.elements.find(e => e.id === selectedIds[0]) : null

  useEffect(() => { syncRecentColors(slides) }, [slides])

  const typeLabels: Record<string, string> = { text: '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片', group: '组' }
  const elDisplayName = el ? (el.name || typeLabels[el.type] || el.type) : ''

  const submitElRename = () => {
    if (renameElId && renameElVal.trim() && slide) {
      const st = usePptStore.getState()
      const updatedSlide = { ...slide, elements: slide.elements.map(e => e.id === renameElId ? { ...e, name: renameElVal.trim() } : e) }
      usePptStore.setState({ slides: st.slides.map(s => s.id === st.currentSlideId ? updatedSlide : s) })
    }
    setRenameElId(null)
  }

  return (
    <div data-panel="props" className="w-52 border-l border-gray-200 bg-white shrink-0 overflow-y-auto select-none relative z-10">
      <div className="flex border-b border-gray-200">
        <button onClick={() => setActiveTab('props')} className={`flex-1 py-1.5 text-[12px] font-medium text-center cursor-pointer ${activeTab === 'props' ? 'text-zell-600 border-b-2 border-zell-500' : 'text-gray-500 hover:text-gray-700'}`}>属性</button>
        <button onClick={() => setActiveTab('layers')} className={`flex-1 py-1.5 text-[12px] font-medium text-center cursor-pointer ${activeTab === 'layers' ? 'text-zell-600 border-b-2 border-zell-500' : 'text-gray-500 hover:text-gray-700'}`}>图层</button>
      </div>
      <div className="p-3">
        {activeTab === 'props' ? (
          !el ? (
            <div className="space-y-3">
              <span className="text-[13px] font-medium text-gray-700">画板</span>
              {slide && <SlideBackground slide={slide} />}
              <p className="text-xs text-gray-400 text-center pt-2">选择元素后可编辑属性</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                {renameElId === el.id ? (
                  <input autoFocus value={renameElVal}
                    onChange={e => setRenameElVal(e.target.value)}
                    onBlur={submitElRename}
                    onKeyDown={e => { if (e.key === 'Enter') submitElRename(); if (e.key === 'Escape') setRenameElId(null) }}
                    className="flex-1 text-[13px] font-medium text-gray-700 bg-gray-100 rounded px-1 outline-none" />
                ) : (
                  <span className="text-[13px] font-medium text-gray-700 cursor-default"
                    onDoubleClick={() => { setRenameElId(el.id); setRenameElVal(elDisplayName) }}>{elDisplayName}</span>
                )}
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
  const rt = useRichText()

  const remeasure = (patch: Record<string, any>) => {
    const np = { ...el.props, ...patch }
    const html = renderRichTextHTML(el.props.content)
    if (html) {
      const h = (() => {
        const div = document.createElement('div')
        div.className = 'tl-rich-text'
        div.innerHTML = html
        div.style.cssText = [
          `position:absolute;visibility:hidden`,
          `width:${el.w - 8}px`,
          `font-size:${np.fontSize || 16}px`,
          `font-family:${np.fontFamily || 'inherit'}`,
          `line-height:${np.lineHeight || 1.5}`,
          `letter-spacing:${np.letterSpacing || 0}px`,
          `overflow-wrap:break-word;word-break:break-word`,
          `padding:0;margin:0`,
        ].join(';')
        document.body.appendChild(div)
        const hh = Math.ceil(div.getBoundingClientRect().height) + 4
        document.body.removeChild(div)
        return hh
      })()
      update({ props: np, h: Math.max(10, h) })
    } else {
      update({ props: np })
    }
  }

  return (
    <div className="space-y-3">
      {el.type !== 'group' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ScrubInput label="X" value={el.x} onChange={v => update({ x: v })} />
            <ScrubInput label="Y" value={el.y} onChange={v => update({ y: v })} />
            <ScrubInput label="W" value={el.w} onChange={v => update({ w: v })} min={1} />
            <ScrubInput label="H" value={el.h} onChange={v => update({ h: v })} min={1} />
          </div>
          {el.type !== 'rect' && el.type !== 'ellipse' && el.type !== 'text' && (
            <div>
              <label className="text-[10px] text-gray-500">透明度</label>
              <input type="range" min={0} max={1} step={0.1} value={el.opacity} onChange={e => update({ opacity: +e.target.value })} className="w-full" />
            </div>
          )}
        </>
      )}
      {el.type === 'group' && (
        <div className="grid grid-cols-2 gap-2">
          <ScrubInput label="W" value={el.w} onChange={v => update({ w: v })} min={1} />
          <ScrubInput label="H" value={el.h} onChange={v => update({ h: v })} min={1} />
        </div>
      )}
      {el.type === 'text' && (
        <>
          <FontSelect value={el.props.fontFamily || '思源宋体'} onChange={v => {
            localStorage.setItem('zell_last_font', v)
            if (rt.editor) rt.setFontFamily(v)
            remeasure({ fontFamily: v })
          }} />
          <div className="grid gap-1.5 mt-1" style={{ gridTemplateColumns: '2.8em 1fr' }}>
            <span className="text-[11px] text-gray-500 self-center text-right">字号</span>
            <ScrubInput label="" value={el.props.fontSize || 16} onChange={v => {
              if (rt.editor) rt.setFontSize(v + 'px')
              remeasure({ fontSize: v })
            }} min={1} max={999} />
            <span className="text-[11px] text-gray-500 self-center text-right">行距</span>
            <ScrubInput label="" value={el.props.lineHeight || 1.5} onChange={v => remeasure({ lineHeight: v })} min={0.5} max={5} step={0.1} integer={false} />
            <span className="text-[11px] text-gray-500 self-center text-right">字距</span>
            <ScrubInput label="" value={el.props.letterSpacing || 0} onChange={v => remeasure({ letterSpacing: v })} min={-5} max={20} />
          </div>
          <ColorChip label="颜色" color={el.props.fontColor || '#333'} onChange={v => {
            if (rt.editor) rt.setColor(v)
            updateProps({ fontColor: v })
          }} opacity={el.opacity} onOpacityChange={v => update({ opacity: v })} />
          <TextStyleToggles el={el} updateProps={updateProps} />
          <div className="flex gap-0.5">
            <TextAlignBtn el={el} updateProps={updateProps} align="left" icon={<AlignLeft size={13} />} />
            <TextAlignBtn el={el} updateProps={updateProps} align="center" icon={<AlignCenter size={13} />} />
            <TextAlignBtn el={el} updateProps={updateProps} align="right" icon={<AlignRight size={13} />} />
          </div>
          <TextListToggles el={el} updateProps={updateProps} update={update} />
        </>
      )}
      {el.type === 'arrow' && (
        <>
          <ColorChip label="颜色" color={el.props.stroke || '#94a3b8'} onChange={v => updateProps({ stroke: v })} opacity={el.opacity} onOpacityChange={v => update({ opacity: v })} />
          <ScrubInput label="粗细" value={el.props.strokeWidth ?? 2} onChange={v => updateProps({ strokeWidth: v })} min={1} max={20} />
          <div>
            <label className="text-[10px] text-gray-500">起点</label>
            <div className="flex gap-1 mt-0.5">
              {[{ v: 'none', s: '—' }, { v: 'arrow', s: '▶' }, { v: 'circle', s: '●' }, { v: 'square', s: '■' }].map(opt => (
                <button key={opt.v} onClick={() => updateProps({ startShape: opt.v })} className={`flex-1 py-1 text-xs rounded border ${(el.props.startShape || 'none') === opt.v ? 'bg-zell-50 border-zell-300 text-zell-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{opt.s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">终点</label>
            <div className="flex gap-1 mt-0.5">
              {[{ v: 'none', s: '—' }, { v: 'arrow', s: '▶' }, { v: 'circle', s: '●' }, { v: 'square', s: '■' }].map(opt => (
                <button key={opt.v} onClick={() => updateProps({ endShape: opt.v })} className={`flex-1 py-1 text-xs rounded border ${(el.props.endShape || 'arrow') === opt.v ? 'bg-zell-50 border-zell-300 text-zell-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{opt.s}</button>
              ))}
            </div>
          </div>
        </>
      )}
      {el.type === 'image' && (
        <>
          <ScrubInput label="圆角" value={el.props.borderRadius || 0} onChange={v => updateProps({ borderRadius: v })} min={0} max={200} />
          <ShadowSection el={el} updateProps={updateProps} />
          <div className="flex gap-1.5">
            <button onClick={() => alert('AI抠图功能即将上线')} className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors">
              AI抠图
            </button>
            <button onClick={() => alert('边缘柔化功能即将上线')} className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors">
              边缘柔化
            </button>
          </div>
        </>
      )}
      {(el.type === 'rect' || el.type === 'ellipse') && (
        <>
          <ColorChip label="填充" color={el.props.fill || '#e2e8f0'} onChange={v => updateProps({ fill: v })} opacity={el.opacity} onOpacityChange={v => update({ opacity: v })} />
          <StrokeSection el={el} updateProps={updateProps} />
          <ShadowSection el={el} updateProps={updateProps} />
          {el.type === 'rect' && <CornerSection el={el} updateProps={updateProps} />}
        </>
      )}
    </div>
  )
}

function SlideBackground({ slide }: { slide: import('./types').Slide }) {
  const [opEdit, setOpEdit] = useState(false)
  const [opText, setOpText] = useState('')
  const opRef = useRef({ v0: 0, mx: 0 })
  const opDisplay = Math.round((slide.backgroundOpacity ?? 1) * 100)

  const changeBg = (color: string) => {
    const st = usePptStore.getState()
    const slides = st.slides.map(s => s.id === slide.id ? { ...s, background: color } : s)
    usePptStore.setState({ slides })
  }
  const changeOpacity = (v: number) => {
    const st = usePptStore.getState()
    const slides = st.slides.map(s => s.id === slide.id ? { ...s, backgroundOpacity: v } : s)
    usePptStore.setState({ slides })
  }
  const onOpGrip = (e: React.PointerEvent) => {
    e.stopPropagation()
    opRef.current = { v0: opDisplay, mx: e.clientX }
    const onMove = (ev: PointerEvent) => {
      const v = Math.max(0, Math.min(100, Math.round(opRef.current.v0 + (ev.clientX - opRef.current.mx))))
      changeOpacity(v / 100)
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const commitOp = () => {
    const n = parseInt(opText)
    if (!isNaN(n)) changeOpacity(Math.max(0, Math.min(100, n)) / 100)
    setOpEdit(false)
  }

  return (
    <div>
      <label className="text-[12px] text-gray-500">背景色</label>
      <div className="flex items-center gap-1 mt-0.5 bg-gray-100 rounded h-[26px] px-1">
        <div className="relative shrink-0">
          <input type="color" value={slide.background || '#ffffff'} onChange={e => changeBg(e.target.value)}
            className="absolute inset-0 opacity-0 w-6 h-5 cursor-pointer"
          />
          <div className="rounded-sm border border-gray-300" style={{ width: 16, height: 16, background: slide.background || '#ffffff' }} />
        </div>
        <span className="text-[11px] text-gray-600 font-mono flex-1">{slide.background || '#ffffff'}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <div onPointerDown={onOpGrip} className="h-full shrink-0" style={{ cursor: 'ew-resize' }}>
            <Grip size={10} />
          </div>
          {opEdit ? (
            <input autoFocus type="text" value={opText} onChange={e => setOpText(e.target.value)}
              onBlur={commitOp}
              onKeyDown={e => { if (e.key === 'Enter') commitOp(); if (e.key === 'Escape') setOpEdit(false) }}
              className="w-8 h-full text-[12px] text-center bg-transparent outline-none select-text"
            />
          ) : (
            <span onClick={() => { setOpText(String(opDisplay)); setOpEdit(true) }}
              className="text-[12px] text-gray-600 cursor-default min-w-[24px] text-right">{opDisplay}%</span>
          )}
        </div>
      </div>
    </div>
  )
}

function StrokeSection({ el, updateProps }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void }) {
  const hasStroke = (el.props.strokeWidth ?? 0) > 0 && el.props.stroke
  const [showStrokePicker, setShowStrokePicker] = useState(false)
  const [strokePickerPos, setStrokePickerPos] = useState({ x: 0, y: 0 })
  const strokeSwatchRef = useRef<HTMLButtonElement>(null)
  const strokePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showStrokePicker) return
    const updatePos = () => {
      if (strokeSwatchRef.current) {
        const rect = strokeSwatchRef.current.getBoundingClientRect()
        setStrokePickerPos({ x: rect.right - 160, y: rect.bottom + 4 })
      }
    }
    updatePos()
    const onDown = (e: MouseEvent) => {
      if (strokePickerRef.current && !strokePickerRef.current.contains(e.target as Node)) setShowStrokePicker(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [showStrokePicker])

  const [editW, setEditW] = useState(false)
  const [wText, setWText] = useState('')
  const wRef = useRef({ v0: 0, mx: 0 })
  const w = el.props.strokeWidth ?? 1

  const onWGrip = (e: React.PointerEvent) => {
    e.stopPropagation()
    wRef.current = { v0: w, mx: e.clientX }
    const onMove = (ev: PointerEvent) => {
      const v = Math.max(0, Math.min(20, Math.round(wRef.current.v0 + (ev.clientX - wRef.current.mx))))
      updateProps({ strokeWidth: v })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[13px] text-gray-500 font-medium">边框</label>
        {!hasStroke ? (
          <button onClick={() => updateProps({ stroke: '#cbd5e1', strokeWidth: 1 })}
            className="p-0.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
            <svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        ) : (
          <button onClick={() => updateProps({ stroke: undefined, strokeWidth: undefined })}
            className="p-0.5 text-gray-400 hover:text-red-500 rounded">
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      {hasStroke && (
      <div className="flex items-center gap-1 mt-0.5 bg-gray-100 rounded h-[26px] px-1">
          <div className="relative shrink-0">
            <button ref={strokeSwatchRef} onClick={() => setShowStrokePicker(!showStrokePicker)} className="block">
              <div className="rounded-sm border border-gray-300" style={{ width: 16, height: 16, background: el.props.stroke || '#cbd5e1' }} />
            </button>
            {showStrokePicker && createPortal(
                <div ref={strokePickerRef} data-no-deselect className="fixed p-2 bg-white border border-gray-200 rounded-lg shadow-lg z-[99999] space-y-1.5" style={{ width: 160, top: strokePickerPos.y, left: strokePickerPos.x }}>
                <span className="text-[10px] text-gray-400">取色器</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={el.props.stroke || '#cbd5e1'} onChange={e => { addRecentColor(e.target.value); updateProps({ stroke: e.target.value }) }} className="w-6 h-6 cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                  <span className="text-[12px] text-gray-600 font-mono">{el.props.stroke || '#cbd5e1'}</span>
                </div>
                {recentColors.length > 0 && (
                  <>
                    <span className="text-[10px] text-gray-400">最近使用</span>
                    <div className="flex gap-0.5 flex-wrap">
                      {recentColors.slice(0, 16).map(c => (
                        <button key={c} onClick={() => { addRecentColor(c); updateProps({ stroke: c }) }}
                        className="w-5 h-5 rounded-sm border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                          style={{ background: c }} title={c}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>,
              document.body
            )}
          </div>
          <div className="flex items-center h-full overflow-hidden">
            <div onPointerDown={onWGrip} className="h-full shrink-0" style={{ cursor: 'ew-resize', touchAction: 'none' }}>
              <Grip size={10} />
            </div>
            {editW ? (
              <input autoFocus type="text" value={wText}
                onChange={e => setWText(e.target.value)}
                onBlur={() => { const n = parseInt(wText); if (!isNaN(n)) updateProps({ strokeWidth: Math.max(0, Math.min(20, n)) }); setEditW(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { const n = parseInt(wText); if (!isNaN(n)) updateProps({ strokeWidth: Math.max(0, Math.min(20, n)) }); setEditW(false) }; if (e.key === 'Escape') setEditW(false) }}
                className="w-8 h-full text-xs text-center bg-transparent outline-none select-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            ) : (
              <span onClick={() => { setWText(String(w)); setEditW(true) }} className="w-8 text-xs text-gray-700 text-center cursor-default select-none">{w}px</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ShadowSection({ el, updateProps }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void }) {
  const shadows: { x: number; y: number; blur: number; color: string }[] = el.props.shadows || (el.props.shadowBlur ? [{ x: el.props.shadowX ?? 0, y: el.props.shadowY ?? 2, blur: el.props.shadowBlur ?? 4, color: el.props.shadowColor ?? 'rgba(0,0,0,0.15)' }] : [])
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [popPos, setPopPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const popRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (editIdx === null) return
    const updatePos = () => {
      const rowEl = rowRefs.current.get(editIdx)
      if (rowEl) {
      const rect = rowEl.getBoundingClientRect()
      setPopPos({ x: rect.left - 200, y: rect.bottom + 4 })
      }
    }
    updatePos()
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setEditIdx(null)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [editIdx])

  const updateShadow = (idx: number, s: Partial<{ x: number; y: number; blur: number; color: string }>) => {
    const ns = shadows.map((sh, i) => i === idx ? { ...sh, ...s } : sh)
    updateProps({ shadows: ns })
  }
  const removeShadow = (idx: number) => {
    const ns = shadows.filter((_, i) => i !== idx)
    updateProps({ shadows: ns.length > 0 ? ns : undefined, shadowBlur: undefined, shadowX: undefined, shadowY: undefined, shadowColor: undefined })
    setEditIdx(null)
  }
  const addShadow = () => {
    const ns = [...shadows, { x: 0, y: 2, blur: 4, color: 'rgba(0,0,0,0.15)' }]
    updateProps({ shadows: ns })
    setEditIdx(ns.length - 1)
  }

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between">
        <label className="text-[13px] text-gray-500 font-medium">阴影</label>
        <button onClick={addShadow} className="p-0.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
          <svg width="12" height="12" viewBox="0 0 12 12"><line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
      {shadows.map((s, i) => (
        <div key={i} ref={el => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i) }} className="mt-1 relative">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditIdx(editIdx === i ? null : i)}
              className="flex items-center gap-1 flex-1 h-[24px] bg-gray-100 rounded px-1 hover:bg-gray-200 transition"
            >
              <div className="rounded-sm border border-gray-300" style={{ width: 14, height: 14, background: s.color }} />
              <span className="text-[10px] text-gray-500 truncate">{s.color} · {s.blur}px</span>
            </button>
            <button onClick={() => removeShadow(i)} className="p-0.5 text-gray-400 hover:text-red-500 rounded">
              <svg width="10" height="10" viewBox="0 0 10 10"><line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          {editIdx === i && (
            <div ref={popRef} className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] p-2 space-y-1.5" style={{ width: 200, top: popPos.y, left: popPos.x }}>
              <div className="text-[12px] text-gray-600 font-medium">阴影 {i + 1}</div>
              <div className="space-y-1">
                <span className="text-[10px] text-gray-400">颜色</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={s.color} onChange={e => { addRecentColor(e.target.value); updateShadow(i, { color: e.target.value }) }} className="w-6 h-6 cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                  <span className="text-[12px] text-gray-600 font-mono">{s.color}</span>
                </div>
              </div>
              {recentColors.length > 0 && (
                <div className="space-y-0.5">
                  <span className="text-[10px] text-gray-400">最近使用</span>
                  <div className="flex gap-0.5 flex-wrap">
                    {recentColors.slice(0, 16).map(c => (
                      <button key={c} onClick={() => updateShadow(i, { color: c })}
                        className="w-5 h-5 rounded-sm border border-gray-300 hover:scale-110 transition-transform cursor-pointer"
                        style={{ background: c }} title={c}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1">
                <ScrubInput label="X" value={s.x} onChange={v => updateShadow(i, { x: v })} min={-50} max={50} />
                <ScrubInput label="Y" value={s.y} onChange={v => updateShadow(i, { y: v })} min={-50} max={50} />
                <ScrubInput label="模糊" value={s.blur} onChange={v => updateShadow(i, { blur: v })} min={0} max={100} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CornerSection({ el, updateProps }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void }) {
  const hasIndividual = el.props.borderRadiusTL != null || el.props.borderRadiusTR != null || el.props.borderRadiusBL != null || el.props.borderRadiusBR != null
  const [showIndividual, setShowIndividual] = useState(hasIndividual)

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="flex items-center justify-between">
        <label className="text-[13px] text-gray-500 font-medium">圆角</label>
        <button onClick={() => {
          if (!showIndividual) {
            // expand: copy current uniform value to all corners
            const br = el.props.borderRadius ?? 0
            updateProps({ borderRadiusTL: br, borderRadiusTR: br, borderRadiusBL: br, borderRadiusBR: br, borderRadius: undefined })
          } else {
            // collapse: use the first individual value uniformly
            const br = el.props.borderRadiusTL ?? el.props.borderRadiusTR ?? el.props.borderRadiusBL ?? el.props.borderRadiusBR ?? 0
            updateProps({ borderRadius: br, borderRadiusTL: undefined, borderRadiusTR: undefined, borderRadiusBL: undefined, borderRadiusBR: undefined })
          }
          setShowIndividual(!showIndividual)
        }} className="p-0.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="2" width="3" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/>
            <rect x="8" y="2" width="3" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/>
            <rect x="1" y="7" width="3" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/>
            <rect x="8" y="7" width="3" height="3" rx="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
      </div>
      <div className="mt-1">
        {showIndividual ? (
          <div className="grid grid-cols-2 gap-2">
            <ScrubInput label="TL" labelLeft value={el.props.borderRadiusTL ?? 0} onChange={v => updateProps({ borderRadiusTL: v })} min={0} max={200} />
            <ScrubInput label="TR" labelLeft value={el.props.borderRadiusTR ?? 0} onChange={v => updateProps({ borderRadiusTR: v })} min={0} max={200} />
            <ScrubInput label="BL" labelLeft value={el.props.borderRadiusBL ?? 0} onChange={v => updateProps({ borderRadiusBL: v })} min={0} max={200} />
            <ScrubInput label="BR" labelLeft value={el.props.borderRadiusBR ?? 0} onChange={v => updateProps({ borderRadiusBR: v })} min={0} max={200} />
          </div>
        ) : (
          <ScrubInput label="" value={el.props.borderRadius ?? 0} onChange={v => updateProps({ borderRadius: v, borderRadiusTL: undefined, borderRadiusTR: undefined, borderRadiusBL: undefined, borderRadiusBR: undefined })} min={0} max={200} />
        )}
      </div>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [sysFonts, setSysFonts] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const builtin = ['思源宋体', '宋体', '黑体', '微软雅黑', '楷体', '仿宋', 'Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana']
  const fonts = [...builtin, ...sysFonts.filter(f => !builtin.includes(f))]
  const label = value || builtin[0]

  useEffect(() => {
    invoke<string[]>('list_system_fonts').then(setSysFonts).catch((e) => { logger.error('Failed to list system fonts', e) })
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <label className="text-[12px] text-gray-500">字体</label>
      <button onClick={() => setOpen(!open)} className="w-full h-[26px] mt-0.5 bg-gray-100 rounded flex items-center justify-between px-2 text-[12px] text-gray-700 hover:bg-gray-200">
        <span className="truncate" style={{ fontFamily: value === 'inherit' ? undefined : value }}>{label}</span>
        <span className="text-gray-400 ml-1">▾</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
          <button onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'; input.accept = '.ttf,.otf,.woff,.woff2'
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = (ev) => {
                const url = ev.target?.result as string
                const name = file.name.replace(/\.[^.]+$/, '')
                const ff = new FontFace(name, `url(${url})`)
                ff.load().then(() => { (document as any).fonts.add(ff); onChange(name); setSysFonts(prev => [...prev, name]) })
              }
              reader.readAsDataURL(file)
            }
            input.click()
          }} className="w-full text-left px-2 py-1.5 text-[12px] text-blue-600 hover:bg-gray-100 border-b border-gray-100">+ 上传字体</button>
          {fonts.map(f => (
            <button key={f} onClick={() => { onChange(f); setOpen(false) }}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-gray-100"
              style={{ fontFamily: f === 'inherit' ? undefined : f }}
            >{f === 'inherit' ? '默认' : f}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function TextAlignBtn({ el, updateProps, align, icon }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void; align: string; icon: React.ReactNode }) {
  const { editor, textAlign, setTextAlign } = useRichText()
  const currentAlign = el.props.textAlign || 'left'
  const active = editor ? textAlign === align : currentAlign === align
  return (
    <button onClick={() => {
      if (editor) setTextAlign(align)
      else updateProps({ textAlign: align as any })
    }} className={`flex-1 py-1 rounded border flex items-center justify-center ${active ? 'bg-blue-100 text-blue-700 border-blue-300' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
    >{icon}</button>
  )
}

function TextStyleToggles({ el, updateProps }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void }) {
  const p = el.props
  const { editor, isBold, isItalic, isUnderline, isStrike, toggleBold, toggleItalic, toggleUnderline, toggleStrike } = useRichText()
  const activeClass = 'bg-blue-100 text-blue-700 border-blue-300'
  const btnClass = 'flex-1 py-1.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center'

  const boldActive = editor ? isBold : p.fontWeight === 'bold'
  const italicActive = editor ? isItalic : p.fontStyle === 'italic'
  const underlineActive = editor ? isUnderline : p.textDecoration === 'underline'
  const strikeActive = editor ? isStrike : p.textDecoration === 'line-through'

  return (
    <div className="flex gap-0.5">
      <button onClick={() => {
        if (editor) toggleBold()
        else updateProps({ fontWeight: p.fontWeight === 'bold' ? 'normal' : 'bold' })
      }} className={`${btnClass} ${boldActive ? activeClass : ''}`}><Bold size={13} /></button>
      <button onClick={() => {
        if (editor) toggleItalic()
        else updateProps({ fontStyle: p.fontStyle === 'italic' ? 'normal' : 'italic' })
      }} className={`${btnClass} ${italicActive ? activeClass : ''}`}><Italic size={13} /></button>
      <button onClick={() => {
        if (editor) toggleUnderline()
        else updateProps({ textDecoration: p.textDecoration === 'underline' ? 'none' : 'underline' })
      }} className={`${btnClass} ${underlineActive ? activeClass : ''}`}><Underline size={13} /></button>
      <button onClick={() => {
        if (editor) toggleStrike()
        else updateProps({ textDecoration: p.textDecoration === 'line-through' ? 'none' : 'line-through' })
      }} className={`${btnClass} ${strikeActive ? activeClass : ''}`}><Strikethrough size={13} /></button>
    </div>
  )
}

function TextListToggles({ el, updateProps, update }: { el: CanvasElement; updateProps: (p: Partial<CanvasElement['props']>) => void; update: (c: Partial<CanvasElement>) => void }) {
  const p = el.props
  const { editor, isBulletList, isOrderedList, toggleBulletList, toggleOrderedList } = useRichText()
  const content = el.props.content || {}
  const isOL = editor ? isOrderedList : hasListInJSON(content, 'ol')
  const isUL = editor ? isBulletList : hasListInJSON(content, 'ul')
  const btnClass = 'flex-1 py-1.5 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center'
  const activeClass = 'bg-blue-100 text-blue-700 border-blue-300'
  return (
    <div className="flex gap-0.5">
      <button onClick={() => {
        if (editor) { toggleOrderedList() }
        else {
          const newContent = isOL ? removeListFromJSON(content) : toggleListInJSON(content, 'ol')
          update({ props: { ...el.props, content: newContent } })
        }
      }} className={`${btnClass} ${isOL ? activeClass : ''}`}><ListOrdered size={13} /></button>
      <button onClick={() => {
        if (editor) { toggleBulletList() }
        else {
          const newContent = isUL ? removeListFromJSON(content) : toggleListInJSON(content, 'ul')
          update({ props: { ...el.props, content: newContent } })
        }
      }} className={`${btnClass} ${isUL ? activeClass : ''}`}><List size={13} /></button>
      <button onClick={() => { updateProps({ writingMode: p.writingMode === 'vertical-rl' ? 'horizontal-tb' : 'vertical-rl' }) }}
        className={`${btnClass} ${p.writingMode === 'vertical-rl' ? activeClass : ''}`}><ArrowUpDown size={13} /></button>
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
    setRenameVal(el.name || el.props.text || '')
  }
  const submitRename = () => {
    if (renamingId && renameVal.trim()) {
      const st = usePptStore.getState()
      if (st.currentSlideId) {
        const updatedSlide = {
          ...slide,
          elements: slide.elements.map(e => e.id === renamingId ? { ...e, name: renameVal.trim() } : e)
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
        const adjustedTo = fromIdx < d ? toReal + 1 : toReal
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
  const typeLabel = (el: CanvasElement) => el.name || ({ text: '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片', group: '组' } as Record<string,string>)[el.type]

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
            className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs transition-colors ${isSelected(el) ? 'bg-zell-50' : 'hover:bg-gray-50'} ${dragIdx === i ? 'opacity-40' : ''}`}
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
              <span className="truncate flex-1" onDoubleClick={() => startRename(el)}>
                {typeLabel(el)}
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
