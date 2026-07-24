// PPT element types

export const SLIDE_W = 1280
export const SLIDE_H = 720
export const SLIDE_GAP = 80

export type ElementType = 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'image'

export interface CanvasElement {
  id: string
  type: ElementType
  x: number; y: number; w: number; h: number
  opacity: number
  props: {
    text?: string; fontSize?: number; fontColor?: string; fontWeight?: string
    fill?: string; stroke?: string; strokeWidth?: number
    borderRadius?: number
    borderRadiusTL?: number; borderRadiusTR?: number; borderRadiusBL?: number; borderRadiusBR?: number
    startShape?: string; endShape?: string
    src?: string
    shadowX?: number; shadowY?: number; shadowBlur?: number; shadowColor?: string
  }
}

export interface Slide {
  id: string
  name: string
  elements: CanvasElement[]
  background: string
  hidden?: boolean
}

export interface PptData {
  slides: Slide[]
}
