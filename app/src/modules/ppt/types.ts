// PPT element types

export const SLIDE_W = 1280
export const SLIDE_H = 720
export const SLIDE_GAP = 80

export type ElementType = 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'image' | 'group'

export interface CanvasElement {
  id: string
  name?: string
  type: ElementType
  x: number; y: number; w: number; h: number
  opacity: number
  props: {
    text?: string; fontSize?: number; fontColor?: string; fontWeight?: string
    content?: any
    fontFamily?: string; lineHeight?: number; letterSpacing?: number
    fontStyle?: 'normal' | 'italic'
    textDecoration?: 'none' | 'underline' | 'line-through'
    textAlign?: 'left' | 'center' | 'right'
    writingMode?: 'horizontal-tb' | 'vertical-rl'
    listType?: 'none' | 'ol' | 'ul'
    fill?: string; stroke?: string; strokeWidth?: number
    borderRadius?: number
    borderRadiusTL?: number; borderRadiusTR?: number; borderRadiusBL?: number; borderRadiusBR?: number
    startShape?: string; endShape?: string
    src?: string
    origW?: number; origH?: number
    imgScale?: number
    cropL?: number; cropR?: number; cropT?: number; cropB?: number
    shadowX?: number; shadowY?: number; shadowBlur?: number; shadowColor?: string
    shadows?: { x: number; y: number; blur: number; color: string }[]
  }
  groupChildren?: CanvasElement[]
}

export interface Slide {
  id: string
  name: string
  elements: CanvasElement[]
  background: string
  backgroundOpacity?: number
  hidden?: boolean
}

export interface PptData {
  slides: Slide[]
}
