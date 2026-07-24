import { Type, Square, Circle, ArrowRight, ImageIcon } from 'lucide-react'
import { usePptStore } from './store'
import type { CanvasElement } from './types'

function genId() { return crypto.randomUUID() }

export function PptToolbar() {
  const { currentSlideId, addElement } = usePptStore()

  const add = (type: CanvasElement['type']) => {
    if (!currentSlideId) return
    const defaults: Record<string, Partial<CanvasElement>> = {
      text: { type: 'text', x: 100, y: 100, w: 300, h: 60, opacity: 1, props: { text: '新文本', fontSize: 20, fontColor: '#333', fontWeight: 'normal' } },
      rect: { type: 'rect', x: 200, y: 150, w: 200, h: 120, opacity: 1, props: { fill: '#e2e8f0', stroke: '#cbd5e1', strokeWidth: 1, borderRadius: 4 } },
      ellipse: { type: 'ellipse', x: 200, y: 150, w: 120, h: 120, opacity: 1, props: { fill: '#e2e8f0', stroke: '#cbd5e1', strokeWidth: 1 } },
      arrow: { type: 'arrow', x: 100, y: 300, w: 300, h: 30, opacity: 1, props: { stroke: '#94a3b8', strokeWidth: 2, endShape: 'arrow', startShape: 'none' } },
      image: { type: 'image', x: 200, y: 100, w: 400, h: 300, opacity: 1, props: { src: '' } },
    }
    const el = { id: genId(), ...defaults[type] } as CanvasElement
    addElement(currentSlideId, el)
  }

  const addImage = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        if (currentSlideId) {
          addElement(currentSlideId, {
            id: genId(), type: 'image', x: 200, y: 100, w: 400, h: 300, opacity: 1,
            props: { src },
          })
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div className="h-10 flex items-center justify-center px-3 gap-2 shrink-0">
      <button onClick={() => add('text')} className="p-2 rounded hover:bg-gray-100" title="文本"><Type size={16} /></button>
      <button onClick={() => add('rect')} className="p-2 rounded hover:bg-gray-100" title="矩形"><Square size={16} /></button>
      <button onClick={() => add('ellipse')} className="p-2 rounded hover:bg-gray-100" title="圆形"><Circle size={16} /></button>
      <span className="text-gray-300">|</span>
      <button onClick={() => add('arrow')} className="p-2 rounded hover:bg-gray-100" title="箭头"><ArrowRight size={16} /></button>
      <span className="text-gray-300">|</span>
      <button onClick={addImage} className="p-2 rounded hover:bg-gray-100" title="插入图片"><ImageIcon size={16} /></button>
    </div>
  )
}
