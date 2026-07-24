import { create } from 'zustand'
import type { Slide, CanvasElement, PptData } from './types'

function clone(slides: Slide[]): Slide[] {
  return JSON.parse(JSON.stringify(slides))
}

interface GuideLine { type: 'h' | 'v'; pos: number; start: number; end: number }

interface PptState {
  slides: Slide[]
  currentSlideId: string | null
  selectedIds: string[]
  zoom: number
  guideLines: GuideLine[]
  _undo: Slide[][]
  _redo: Slide[][]
  _timer: ReturnType<typeof setTimeout> | null

  init: (data: PptData) => void
  getData: () => PptData
  setCurrentSlide: (id: string) => void
  addSlide: (afterIndex?: number) => void
  deleteSlide: (id: string) => void
  duplicateSlide: (id: string) => void
  moveSlide: (fromIdx: number, toIdx: number) => void
  renameSlide: (id: string, name: string) => void

  addElement: (slideId: string, element: CanvasElement) => void
  updateElement: (slideId: string, elementId: string, changes: Partial<CanvasElement>) => void
  deleteElements: (slideId: string, elementIds: string[]) => void
  setSelectedIds: (ids: string[]) => void
  setZoom: (z: number) => void
  setGuideLines: (lines: GuideLine[]) => void
  undo: () => void
  redo: () => void
}

function genId(): string { return crypto.randomUUID() }

let historyTimer: any = null
function pushHistory() {
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    const s = usePptStore.getState()
    if (s.slides.length === 0) return
    usePptStore.setState({
      _undo: [...s._undo.slice(-49), clone(s.slides)],
      _redo: [],
    })
  }, 400)
}

function mutate(set: any, fn: (s: PptState) => Partial<PptState>) {
  const prev = clone(usePptStore.getState().slides)
  set((s: PptState) => {
    const result = fn(s)
    const next = result.slides || s.slides
    if (JSON.stringify(prev) !== JSON.stringify(next)) pushHistory()
    return result
  })
}

export const usePptStore = create<PptState>((set, get) => ({
  slides: [],
  currentSlideId: null,
  selectedIds: [],
  zoom: 1,
  guideLines: [],
  _undo: [],
  _redo: [],
  _timer: null,

  init: (data) => set({ slides: clone(data.slides), currentSlideId: data.slides[0]?.id || null, selectedIds: [], _undo: [], _redo: [] }),

  getData: () => ({ slides: get().slides }),

  setCurrentSlide: (id) => set({ currentSlideId: id, selectedIds: [] }),

  addSlide: (afterIndex) => {
    mutate(set, ({ slides }) => {
      const idx = afterIndex ?? slides.length
      const ns: Slide = { id: genId(), name: `幻灯片 ${idx + 1}`, elements: [], background: '#ffffff' }
      const newSlides = [...slides]
      newSlides.splice(idx, 0, ns)
      newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
      return { slides: newSlides, currentSlideId: ns.id, selectedIds: [] }
    })
  },

  deleteSlide: (id) => {
    const { slides, currentSlideId } = get()
    if (slides.length <= 1) return
    const newSlides = slides.filter(s => s.id !== id)
    newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
    set({ slides: newSlides, currentSlideId: currentSlideId === id ? (newSlides[0]?.id || null) : currentSlideId, selectedIds: [] })
    pushHistory()
  },

  duplicateSlide: (id) => {
    mutate(set, ({ slides }) => {
      const idx = slides.findIndex(s => s.id === id)
      if (idx < 0) return {}
      const orig = slides[idx]
      const copy: Slide = { ...orig, id: genId(), name: `${orig.name} (副本)`, elements: orig.elements.map(e => ({ ...e, id: genId() })) }
      const newSlides = [...slides]
      newSlides.splice(idx + 1, 0, copy)
      newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
      return { slides: newSlides, currentSlideId: copy.id, selectedIds: [] }
    })
  },

  moveSlide: (fromIdx, toIdx) => {
    mutate(set, ({ slides }) => {
      const ns = [...slides]
      const [m] = ns.splice(fromIdx, 1)
      ns.splice(toIdx, 0, m)
      ns.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
      return { slides: ns }
    })
  },

  renameSlide: (id, name) => {
    set(s => {
      pushHistory()
      return { slides: s.slides.map(sl => sl.id === id ? { ...sl, name } : sl) }
    })
  },

  addElement: (slideId, element) => {
    mutate(set, s => ({ slides: s.slides.map(sl => sl.id === slideId ? { ...sl, elements: [...sl.elements, element] } : sl), selectedIds: [element.id] }))
  },

  updateElement: (slideId, elementId, changes) => {
    set(s => ({
      slides: s.slides.map(sl => sl.id === slideId ? { ...sl, elements: sl.elements.map(el => el.id === elementId ? { ...el, ...changes } : el) } : sl),
    }))
    // Push history only when NOT already in a burst (no pending timer)
    if (!historyTimer) pushHistory()
  },

  deleteElements: (slideId, elementIds) => {
    if (elementIds.length === 0) return
    mutate(set, s => ({ slides: s.slides.map(sl => sl.id === slideId ? { ...sl, elements: sl.elements.filter(el => !elementIds.includes(el.id)) } : sl), selectedIds: [] }))
  },

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(3, z)) }),
  setGuideLines: (lines) => set({ guideLines: lines }),

  undo: () => {
    const { _undo, slides } = get()
    if (_undo.length === 0) return
    set(s => ({
      slides: _undo[_undo.length - 1],
      _undo: _undo.slice(0, -1),
      _redo: [...s._redo, clone(slides)],
      selectedIds: [],
    }))
  },

  redo: () => {
    const { _redo, slides } = get()
    if (_redo.length === 0) return
    set(s => ({
      slides: _redo[_redo.length - 1],
      _redo: _redo.slice(0, -1),
      _undo: [...s._undo, clone(slides)],
      selectedIds: [],
    }))
  },
}))
