// PPT module types
// Slides are stored as tldraw Frame shapes with meta:
//   shape.meta = { slideType: 'slide', slideIndex: number }

export const SLIDE_SIZE = { w: 1280, h: 720 }
export const SLIDE_GAP = 80

export interface SlideMeta {
  slideType: 'slide'
  slideIndex: number
}

export function getSlideMeta(shape: any): SlideMeta | null {
  const m = shape?.meta
  if (m?.slideType === 'slide') return m as SlideMeta
  return null
}
