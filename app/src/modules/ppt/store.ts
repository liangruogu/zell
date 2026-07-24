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
  _resizing: boolean

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
  toggleSlideHidden: (id: string) => void

  addElement: (slideId: string, element: CanvasElement) => void
  updateElement: (slideId: string, elementId: string, changes: Partial<CanvasElement>) => void
  deleteElements: (slideId: string, elementIds: string[]) => void
  setSelectedIds: (ids: string[]) => void
  setZoom: (z: number) => void
  resetView: () => void
  _previewing: boolean
  setPreviewing: (v: boolean) => void
  setGuideLines: (lines: GuideLine[]) => void
  undo: () => void
  redo: () => void
  groupElements: (slideId: string, ids: string[]) => void
  ungroupElement: (slideId: string, groupId: string) => void
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
  if (!historyTimer) {
    // first call in a burst: snapshot current state before any pending changes
    const st = usePptStore.getState()
    if (st.slides.length > 0) pushSnapshot(st.slides)
  } else {
    clearTimeout(historyTimer)
  }
  historyTimer = setTimeout(() => {
    historyTimer = null
  }, 400)
}

function flushHistory() {
  if (historyTimer) {
    clearTimeout(historyTimer)
    historyTimer = null
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
  _resizing: false,
  _previewing: false,

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

  toggleSlideHidden: (id) => {
    set(s => {
      pushHistory()
      return { slides: s.slides.map(sl => sl.id === id ? { ...sl, hidden: !sl.hidden } : sl) }
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
      return { slides: ns, currentSlideId: copies[0].id, selectedIds: [], selectedSlideIds: [] }
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
  setResizing: (v: boolean) => set({ _resizing: v }),
  resetView: () => set({ zoom: 1 }),
  setPreviewing: (v) => set({ _previewing: v }),

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

  groupElements: (slideId, ids) => {
    if (ids.length < 2) return
    const st = get()
    const slide = st.slides.find(s => s.id === slideId)
    if (!slide) return
    const children = slide.elements.filter(e => ids.includes(e.id))
    if (children.length < 2) return
    const x1 = Math.min(...children.map(e => e.x))
    const y1 = Math.min(...children.map(e => e.y))
    const x2 = Math.max(...children.map(e => e.x + e.w))
    const y2 = Math.max(...children.map(e => e.y + e.h))
    const group: CanvasElement = {
      id: genId(), name: '组', type: 'group',
      x: x1, y: y1, w: x2 - x1, h: y2 - y1, opacity: 1,
      props: {},
      groupChildren: children.map(e => ({ ...e, x: e.x - x1, y: e.y - y1 })),
    }
    mutate(set, s => {
      const ns = s.slides.map(sl => {
        if (sl.id !== slideId) return sl
        return { ...sl, elements: [...sl.elements.filter(e => !ids.includes(e.id)), group] }
      })
      return { slides: ns, selectedIds: [group.id], currentSlideId: slideId }
    })
  },

  ungroupElement: (slideId, groupId) => {
    const st = get()
    const slide = st.slides.find(s => s.id === slideId)
    if (!slide) return
    const group = slide.elements.find(e => e.id === groupId && e.type === 'group')
    if (!group || !group.groupChildren) return
    const ungrouped = group.groupChildren.map(e => ({ ...e, x: e.x + group.x, y: e.y + group.y }))
    mutate(set, s => {
      const ns = s.slides.map(sl => {
        if (sl.id !== slideId) return sl
        // insert ungrouped elements where the group was
        const idx = sl.elements.findIndex(e => e.id === groupId)
        const before = sl.elements.slice(0, idx)
        const after = sl.elements.slice(idx + 1)
        return { ...sl, elements: [...before, ...ungrouped, ...after] }
      })
      return { slides: ns, selectedIds: ungrouped.map(e => e.id), currentSlideId: slideId }
    })
  },
}))
