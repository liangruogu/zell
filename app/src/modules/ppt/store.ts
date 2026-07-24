import { create } from 'zustand'
import type { Slide, CanvasElement, PptData } from './types'

interface PptState {
  slides: Slide[]
  currentSlideId: string | null
  selectedIds: string[]
  zoom: number

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
}

function genId(): string {
  return crypto.randomUUID()
}

export const usePptStore = create<PptState>((set, get) => ({
  slides: [],
  currentSlideId: null,
  selectedIds: [],
  zoom: 1,

  init: (data) => set({ slides: data.slides, currentSlideId: data.slides[0]?.id || null, selectedIds: [] }),

  getData: () => ({ slides: get().slides }),

  setCurrentSlide: (id) => {
    set({ currentSlideId: id, selectedIds: [] })
  },

  addSlide: (afterIndex) => {
    const { slides } = get()
    const idx = afterIndex ?? slides.length
    const newSlide: Slide = {
      id: genId(),
      name: `幻灯片 ${idx + 1}`,
      elements: [],
      background: '#ffffff',
    }
    const newSlides = [...slides]
    newSlides.splice(idx, 0, newSlide)
    // Renumber
    newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
    set({ slides: newSlides, currentSlideId: newSlide.id, selectedIds: [] })
  },

  deleteSlide: (id) => {
    const { slides, currentSlideId } = get()
    if (slides.length <= 1) return
    const newSlides = slides.filter(s => s.id !== id)
    newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
    set({
      slides: newSlides,
      currentSlideId: currentSlideId === id ? (newSlides[0]?.id || null) : currentSlideId,
      selectedIds: [],
    })
  },

  duplicateSlide: (id) => {
    const { slides } = get()
    const idx = slides.findIndex(s => s.id === id)
    if (idx < 0) return
    const orig = slides[idx]
    const copy: Slide = { ...orig, id: genId(), name: `${orig.name} (副本)`, elements: orig.elements.map(e => ({ ...e, id: genId() })) }
    const newSlides = [...slides]
    newSlides.splice(idx + 1, 0, copy)
    newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
    set({ slides: newSlides, currentSlideId: copy.id, selectedIds: [] })
  },

  moveSlide: (fromIdx, toIdx) => {
    const { slides } = get()
    if (fromIdx === toIdx) return
    const newSlides = [...slides]
    const [moved] = newSlides.splice(fromIdx, 1)
    newSlides.splice(toIdx, 0, moved)
    newSlides.forEach((s, i) => { s.name = `幻灯片 ${i + 1}` })
    set({ slides: newSlides })
  },

  renameSlide: (id, name) => {
    set(s => ({ slides: s.slides.map(sl => sl.id === id ? { ...sl, name } : sl) }))
  },

  addElement: (slideId, element) => {
    set(s => ({
      slides: s.slides.map(sl => sl.id === slideId ? { ...sl, elements: [...sl.elements, element] } : sl),
      selectedIds: [element.id],
    }))
  },

  updateElement: (slideId, elementId, changes) => {
    set(s => ({
      slides: s.slides.map(sl => sl.id === slideId ? {
        ...sl,
        elements: sl.elements.map(el => el.id === elementId ? { ...el, ...changes } : el),
      } : sl),
    }))
  },

  deleteElements: (slideId, elementIds) => {
    if (elementIds.length === 0) return
    set(s => ({
      slides: s.slides.map(sl => sl.id === slideId ? {
        ...sl,
        elements: sl.elements.filter(el => !elementIds.includes(el.id)),
      } : sl),
      selectedIds: [],
    }))
  },

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(3, z)) }),
}))
