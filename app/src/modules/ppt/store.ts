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
  selectedSlideIds: string[]
  zoom: number
  guideLines: GuideLine[]
  clipboardSlide: Slide | null
  clipboardSlides: Slide[] | null
  _undo: Slide[][]
  _redo: Slide[][]
  _timer: ReturnType<typeof setTimeout> | null

  init: (data: PptData) => void
  getData: () => PptData
  setCurrentSlide: (id: string) => void
  addSlide: (afterIndex?: number) => void
  deleteSlide: (id: string) => void
  deleteSlides: (ids: string[]) => void
  duplicateSlide: (id: string) => void
  copySlide: () => void
  pasteSlide: () => void
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
function pushSnapshot(slides: Slide[]) {
  const s = usePptStore.getState()
  if (s._undo.length >= 100) s._undo = s._undo.slice(-99)
  usePptStore.setState({
    _undo: [...s._undo, clone(slides)],
    _redo: [],
  })
}

function pushHistory() {
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(() => {
    const s = usePptStore.getState()
    if (s.slides.length === 0) return
    pushSnapshot(s.slides)
  }, 400)
}

function flushHistory() {
  if (historyTimer) {
    clearTimeout(historyTimer)
    historyTimer = null
    const s = usePptStore.getState()
    if (s.slides.length > 0) {
      usePptStore.setState({
        _undo: [...s._undo.slice(-99), clone(s.slides)],
        _redo: [],
      })
    }
  }
}

function mutate(set: any, fn: (s: PptState) => Partial<PptState>) {
  const prev = clone(usePptStore.getState().slides)
  set((s: PptState) => {
    const result = fn(s)
    const next = result.slides || s.slides
    if (JSON.stringify(prev) !== JSON.stringify(next)) pushSnapshot(prev)
    return result
  })
}

export const usePptStore = create<PptState>((set, get) => ({
  slides: [],
  currentSlideId: null,
  selectedIds: [],
  selectedSlideIds: [],
  zoom: 1,
  guideLines: [],
  clipboardSlide: null,
  clipboardSlides: null,
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

  deleteSlides: (ids) => {
    if (ids.length === 0) return
    mutate(set, ({ slides, currentSlideId }) => {
      const ns = slides.filter(s => !ids.includes(s.id))
      if (ns.length === 0) return {}
      ns.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
      const nextId = ids.includes(currentSlideId || '') ? ns[0]?.id || null : currentSlideId
      return { slides: ns, currentSlideId: nextId, selectedIds: [] }
    })
  },

  copySlide: () => {
    const { selectedSlideIds, slides, currentSlideId } = get()
    if (selectedSlideIds.length > 0) {
      const copies = slides.filter(s => selectedSlideIds.includes(s.id))
      set({ clipboardSlide: clone(copies)[0], clipboardSlides: clone(copies) })
    } else {
      const slide = slides.find(s => s.id === currentSlideId)
      if (slide) set({ clipboardSlide: clone([slide])[0], clipboardSlides: null })
    }
  },

  pasteSlide: () => {
    const { clipboardSlides, clipboardSlide, slides, currentSlideId } = get()
    const toPaste = clipboardSlides || (clipboardSlide ? [clipboardSlide] : [])
    if (toPaste.length === 0) return
    const idx = slides.findIndex(s => s.id === currentSlideId)
    const after = idx >= 0 ? idx + 1 : slides.length
    mutate(set, ({ slides: sls }) => {
      const copies = toPaste.map(s => ({ ...s, id: genId(), name: `${s.name} (副本)`, elements: s.elements.map(e => ({ ...e, id: genId() })) }))
      const ns = [...sls]
      ns.splice(after, 0, ...copies)
      ns.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
      return { slides: ns, currentSlideId: copies[0].id, selectedIds: [] }
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
    flushHistory()
    const { _undo, slides } = get()
    if (_undo.length === 0) return
    const restoredSlides = _undo[_undo.length - 1]
    set(s => ({
      slides: restoredSlides,
      _undo: _undo.slice(0, -1),
      _redo: [...s._redo, clone(slides)],
      selectedIds: [],
      currentSlideId: restoredSlides[0]?.id || null,
    }))
  },

  redo: () => {
    flushHistory()
    const { _redo, slides } = get()
    if (_redo.length === 0) return
    const restoredSlides = _redo[_redo.length - 1]
    set(s => ({
      slides: restoredSlides,
      _redo: _redo.slice(0, -1),
      _undo: [...s._undo, clone(slides)],
      selectedIds: [],
      currentSlideId: restoredSlides[0]?.id || null,
    }))
  },
}))
