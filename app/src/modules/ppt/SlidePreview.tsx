import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePptStore } from './store'
import { SLIDE_W, SLIDE_H } from './types'

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

  // Request fullscreen
  useEffect(() => {
    const el = document.documentElement
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {})
    return () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}) }
  }, [])

  // ESC to exit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
    }
    const onFsChange = () => { if (!document.fullscreenElement) onClose() }
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [idx, visible.length])

  const goNext = useCallback(() => {
    if (idx < visible.length - 1) {
      setIdx(idx + 1)
      setCurrentSlide(visible[idx + 1].id)
    }
  }, [idx, visible])

  const goPrev = useCallback(() => {
    if (idx > 0) {
      setIdx(idx - 1)
      setCurrentSlide(visible[idx - 1].id)
    }
  }, [idx, visible])

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
        <p className="text-white/60 text-lg">已经到最后一张幻灯片了，�?ESC 退�?/p>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black flex items-center justify-center"
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setHoverSide(e.clientX > rect.width / 2 ? 'right' : 'left')
      }}
      onMouseLeave={() => setHoverSide(null)}
    >
      {/* Left click zone */}
      <div className="absolute left-0 top-0 bottom-0 w-1/2 z-10" onClick={goPrev} style={{ cursor: 'default' }} />
      {/* Right click zone */}
      <div className="absolute right-0 top-0 bottom-0 w-1/2 z-10" onClick={goNext} style={{ cursor: 'default' }} />
      {/* Slide content �?fills viewport height, 16:9 aspect */}
      <div
        className="relative shadow-2xl flex-shrink-0"
        style={{
          width: `calc(100vh * ${SLIDE_W / SLIDE_H})`,
          maxWidth: '100vw',
          height: `min(100vh, calc(100vw * ${SLIDE_H / SLIDE_W}))`,
          background: slide.background || '#ffffff',
        }}
      >
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
              <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }}>
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

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/15">
        <div
          className="h-full bg-zell-500 transition-all duration-300"
          style={{ width: `${((idx + 1) / visible.length) * 100}%` }}
        />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/40 text-xs">
        {idx + 1} / {visible.length}
      </div>
    </div>
  )
}

function renderElement(el: any) {
  const s = 1
  const br = el.props?.borderRadius || 0
  const ss = el.props?.shadows ? el.props.shadows.map((s: any) => `${s.x || 0}px ${s.y || 2}px ${s.blur}px ${s.color || 'rgba(0,0,0,0.15)'}`).join(', ') : undefined
  const sw = el.props?.strokeWidth ?? 0
  const hasStroke = sw > 0 && el.props?.stroke

  switch (el.type) {
    case 'image':
      return <img key={el.id} src={el.props.src || ''} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity }} draggable={false} />
    case 'text':
      return <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, fontSize: el.props.fontSize || 16, color: el.props.fontColor || '#333', fontWeight: el.props.fontWeight || 'normal', padding: 8, overflow: 'hidden', whiteSpace: 'pre-wrap', boxShadow: ss }}>{el.props.text || ''}</div>
    case 'ellipse':
      return <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: '50%', background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss }} />
    case 'arrow': {
      const sw2 = el.props.strokeWidth || 2; const c2 = el.props.stroke || '#94a3b8'; const hs = sw2 * 5
      const x1 = el.props.startShape && el.props.startShape !== 'none' ? hs : 0
      const x2 = el.props.endShape && el.props.endShape !== 'none' ? el.w - hs : el.w
      return (
        <svg key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, overflow: 'visible', opacity: el.opacity }}>
          <line x1={x1} y1={el.h / 2} x2={x2} y2={el.h / 2} stroke={c2} strokeWidth={sw2} />
        </svg>
      )
    }
    default:
      return <div key={el.id} style={{ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, opacity: el.opacity, borderRadius: `${el.props.borderRadiusTL ?? br}px ${el.props.borderRadiusTR ?? br}px ${el.props.borderRadiusBR ?? br}px ${el.props.borderRadiusBL ?? br}px`, background: el.props.fill || '#e2e8f0', border: hasStroke ? `${sw}px solid ${el.props.stroke}` : 'none', boxShadow: ss }} />
  }
}
