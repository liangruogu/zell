import { useState, useCallback, useEffect } from 'react'
import { Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { usePptStore } from './store'
import { SLIDE_W, SLIDE_H } from './types'

export function PreviewButton() {
  const [fullscreen, setFullscreen] = useState(false)
  const { slides, currentSlideId, setCurrentSlide } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)

  if (!slides.length) return null

  if (!fullscreen) {
    return (
      <button
        onClick={() => setFullscreen(true)}
        className="absolute bottom-3 right-3 z-50 p-2 bg-white/80 backdrop-blur rounded-lg shadow hover:bg-white transition"
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

  // ESC to exit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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

  if (!slide) return null

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black flex items-center justify-center"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const midX = rect.width / 2
        if (e.clientX > midX) goNext()
        else goPrev()
      }}
      onMouseMove={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const midX = rect.width / 2
        e.currentTarget.style.cursor = e.clientX > midX ? 'e-resize' : 'w-resize'
      }}
    >
      {/* Slide content */}
      <div
        className="relative shadow-2xl"
        style={{
          width: `min(95vw, calc(85vh * ${SLIDE_W/SLIDE_H}))`,
          height: `min(85vh, calc(95vw * ${SLIDE_H/SLIDE_W}))`,
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
      {idx > 0 && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
          <ChevronLeft size={32} />
        </div>
      )}
      {idx < visible.length - 1 && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">
          <ChevronRight size={32} />
        </div>
      )}

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <div
          className="h-full bg-white/40 transition-all duration-300"
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
