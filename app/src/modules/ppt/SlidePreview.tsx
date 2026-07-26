import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { usePptStore } from './store'
import { SLIDE_W, SLIDE_H } from './types'
import { renderRichTextHTML } from './elements/RichTextEditor'

export function PreviewButton() {
  const [fullscreen, setFullscreen] = useState(false)
  const { slides, currentSlideId, setCurrentSlide } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)

  useEffect(() => {
    if (fullscreen) {
      usePptStore.getState().setPreviewing(true)
      return () => usePptStore.getState().setPreviewing(false)
    }
  }, [fullscreen])

  if (!slides.length) return null

  if (!fullscreen) {
    return (
      <button
        onClick={() => setFullscreen(true)}
        className="p-2 bg-white/80 backdrop-blur rounded-lg shadow hover:bg-white hover:scale-110 transition cursor-pointer"
        title="预览"
      >
        <Play size={16} className="text-gray-600" />
      </button>
    )
  }

  return <FullscreenPreview slides={slides} currentSlideId={currentSlideId} onClose={() => setFullscreen(false)} />
}

function FullscreenPreview({ slides, currentSlideId, onClose }: {
  slides: { id: string; name: string; background: string; backgroundOpacity?: number; elements: any[]; hidden?: boolean }[]
  currentSlideId: string | null
  onClose: () => void
}) {
  const visible = slides.filter(s => !s.hidden)
  const currentIdx = visible.findIndex(s => s.id === currentSlideId)
  const [idx, setIdx] = useState(currentIdx >= 0 ? currentIdx : 0)
  const slide = visible[idx]
  const { setCurrentSlide } = usePptStore()

  // Enter Tauri fullscreen (hides taskbar)
  useEffect(() => {
    const win = getCurrentWindow()
    win.setFullscreen(true)
    return () => { win.setFullscreen(false) }
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k') goPrev()
      if (e.key === 'g') {
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return
        if (ggTimer.current) { clearTimeout(ggTimer.current); ggTimer.current = null; goFirst() }
        else { ggTimer.current = setTimeout(() => { ggTimer.current = null }, 350) }
      }
      if (e.key === 'G' && !e.ctrlKey) goLast()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [idx, visible.length, goNext, goPrev, goFirst, goLast, onClose])

  const goNext = useCallback(() => {
    if (idx < visible.length - 1) { setIdx(idx + 1); setCurrentSlide(visible[idx + 1].id) }
  }, [idx, visible])

  const goPrev = useCallback(() => {
    if (idx > 0) { setIdx(idx - 1); setCurrentSlide(visible[idx - 1].id) }
  }, [idx, visible])

  const goFirst = useCallback(() => {
    if (visible.length > 0 && idx !== 0) { setIdx(0); setCurrentSlide(visible[0].id) }
  }, [idx, visible])

  const goLast = useCallback(() => {
    const last = visible.length - 1
    if (last >= 0 && idx !== last) { setIdx(last); setCurrentSlide(visible[last].id) }
  }, [idx, visible])

  const ggTimer = useRef<ReturnType<typeof setTimeout>>()

  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null)
  const cursorTimer = useRef<ReturnType<typeof setTimeout>>()

  // auto-hide cursor using CSS class
  useEffect(() => {
    const show = () => {
      document.body.classList.remove('cursor-none')
      clearTimeout(cursorTimer.current)
      cursorTimer.current = setTimeout(() => { document.body.classList.add('cursor-none') }, 2000)
    }
    show()
    window.addEventListener('mousemove', show)
    return () => { window.removeEventListener('mousemove', show); clearTimeout(cursorTimer.current); document.body.classList.remove('cursor-none') }
  }, [])

  const ended = idx >= visible.length
  if (ended) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black flex items-center justify-center">
        <p className="text-white/60 text-lg">已经到最后一张幻灯片了，按ESC 退出</p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black flex items-center justify-center"
      data-preview="true"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        if (e.clientX < rect.left + rect.width / 2) goPrev()
        else goNext()
      }}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setHoverSide(e.clientX > rect.width / 2 ? 'right' : 'left')
      }}
      onMouseLeave={() => setHoverSide(null)}
    >
      {/* Slide content — aspect-fit with black bars */}
      <div
        className="relative shadow-2xl"
        style={{
          width: `min(100vw, calc(100vh * ${SLIDE_W / SLIDE_H}))`,
          height: `min(100vh, calc(100vw * ${SLIDE_H / SLIDE_W}))`,
        }}
      >
        <div style={{
          width: '100%',
          height: '100%',
          background: slide.background || '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}>
        {/* Background with opacity */}
        <div style={{
          position: 'absolute', inset: 0,
          background: slide.background || '#ffffff',
          opacity: slide.backgroundOpacity ?? 1,
        }} />
        {/* Elements */}
        {slide.elements.map((el: any) => {
          if (el.type === 'group' && el.groupChildren) {
            return (
              <div key={el.id} style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%` }}>
                {el.groupChildren.map((c: any) => renderElement(c))}
              </div>
            )
          }
          return renderElement(el)
        })}
      </div>

      {/* Navigation hints */}
      <div className={`absolute left-0 top-0 bottom-0 w-1/2 flex items-center justify-start pl-8 pointer-events-none transition-opacity duration-200 ${hoverSide === 'left' ? 'opacity-100' : 'opacity-0'}`}>
        <ChevronLeft size={48} className="text-white/50" />
      </div>
      <div className={`absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-end pr-8 pointer-events-none transition-opacity duration-200 ${hoverSide === 'right' ? 'opacity-100' : 'opacity-0'}`}>
        <ChevronRight size={48} className="text-white/50" />
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
        <div
          className="h-full bg-zell-500 transition-all duration-300"
          style={{ width: `${((idx + 1) / visible.length) * 100}%` }}
        />
      </div>
      </div>
    </div>
  )
}

function renderElement(el: any) {
  const ss = el.props?.shadows ? el.props.shadows.map((s: any) => `${s.x || 0}px ${s.y || 2}px ${s.blur}px ${s.color || 'rgba(0,0,0,0.15)'}`).join(', ') : undefined
  const sw = el.props?.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props?.stroke
  const p = el.props || {}

  switch (el.type) {
    case 'image':
      return <img key={el.id} src={p.src || ''} style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%`, opacity: el.opacity }} draggable={false} />
    case 'text': {
      const content = p.content || (p.text ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: p.text }] }] } : { type: 'doc', content: [{ type: 'paragraph' }] })
      const html = renderRichTextHTML(content)
      return (
        <div key={el.id} className="tl-rich-text" style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%`, opacity: el.opacity, fontSize: `calc(${(p.fontSize || 16) / SLIDE_W * 100}vw)`, color: p.fontColor || '#333', fontFamily: p.fontFamily || '思源宋体', fontWeight: p.fontWeight || 'normal', fontStyle: p.fontStyle || 'normal', textDecoration: p.textDecoration || 'none', lineHeight: p.lineHeight || 1.5, letterSpacing: `calc(${(p.letterSpacing || 0) / SLIDE_W * 100}vw)`, padding: '0.5%', overflow: 'hidden', boxShadow: ss }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )
    }
    case 'ellipse':
      return <div key={el.id} style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%`, opacity: el.opacity, borderRadius: '50%', background: p.fill || '#e2e8f0', border: hasStroke ? `calc(${sw} / ${SLIDE_W} * 100vw) solid ${p.stroke}` : 'none', boxShadow: ss }} />
    case 'arrow': {
      const hs = (p.strokeWidth || 2) * 5
      const x1 = p.startShape && p.startShape !== 'none' ? `${hs / SLIDE_W * 100}%` : '0%'
      const x2 = p.endShape && p.endShape !== 'none' ? `${(el.w - hs) / SLIDE_W * 100}%` : `${el.w / SLIDE_W * 100}%`
      return (
        <svg key={el.id} style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%`, overflow: 'visible', opacity: el.opacity }}>
          <line x1={x1} y1="50%" x2={x2} y2="50%" stroke={p.stroke || '#94a3b8'} strokeWidth={`calc(${p.strokeWidth || 2} / ${SLIDE_W} * 100vw)`} />
        </svg>
      )
    }
    default: {
      const br = p.borderRadius || 0
      const brTL = ((p.borderRadiusTL ?? br) / SLIDE_W * 100).toFixed(2)
      const brTR = ((p.borderRadiusTR ?? br) / SLIDE_W * 100).toFixed(2)
      const brBR = ((p.borderRadiusBR ?? br) / SLIDE_W * 100).toFixed(2)
      const brBL = ((p.borderRadiusBL ?? br) / SLIDE_W * 100).toFixed(2)
      return <div key={el.id} style={{ position: 'absolute', left: `${el.x / SLIDE_W * 100}%`, top: `${el.y / SLIDE_H * 100}%`, width: `${el.w / SLIDE_W * 100}%`, height: `${el.h / SLIDE_H * 100}%`, opacity: el.opacity, borderRadius: `${brTL}vw ${brTR}vw ${brBR}vw ${brBL}vw`, background: p.fill || '#e2e8f0', border: hasStroke ? `calc(${sw} / ${SLIDE_W} * 100vw) solid ${p.stroke}` : 'none', boxShadow: ss }} />
    }
  }
}
