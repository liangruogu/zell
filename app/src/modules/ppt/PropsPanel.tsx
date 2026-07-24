import { X } from 'lucide-react'
import { usePptStore } from './store'
import type { CanvasElement } from './types'

export function PropsPanel() {
  const { slides, currentSlideId, selectedIds, updateElement, setSelectedIds } = usePptStore()
  const slide = slides.find(s => s.id === currentSlideId)
  if (!slide || selectedIds.length !== 1) return null
  const el = slide.elements.find(e => e.id === selectedIds[0])
  if (!el) return null

  const update = (changes: Partial<CanvasElement>) => {
    updateElement(slide.id, el.id, changes)
  }

  const updateProps = (props: Partial<CanvasElement['props']>) => {
    update({ props: { ...el.props, ...props } })
  }

  return (
    <div className="w-48 border-l border-gray-200 bg-white shrink-0 p-3 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-700">
          {{ text: '文本', rect: '矩形', ellipse: '圆形', line: '线条', arrow: '箭头', image: '图片' }[el.type]}
        </span>
        <button onClick={() => setSelectedIds([])} className="p-0.5 text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500">X</label>
            <input type="number" value={Math.round(el.x)} onChange={e => update({ x: +e.target.value })}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">Y</label>
            <input type="number" value={Math.round(el.y)} onChange={e => update({ y: +e.target.value })}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">宽</label>
            <input type="number" value={Math.round(el.w)} onChange={e => update({ w: +e.target.value })}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">高</label>
            <input type="number" value={Math.round(el.h)} onChange={e => update({ h: +e.target.value })}
              className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500">透明度</label>
          <input type="range" min={0} max={1} step={0.1} value={el.opacity}
            onChange={e => update({ opacity: +e.target.value })}
            className="w-full" />
        </div>

        {el.type === 'text' && (
          <>
            <div>
              <label className="text-[10px] text-gray-500">字号</label>
              <input type="number" value={el.props.fontSize || 16} onChange={e => updateProps({ fontSize: +e.target.value })}
                className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">颜色</label>
              <input type="color" value={el.props.fontColor || '#333'} onChange={e => updateProps({ fontColor: e.target.value })}
                className="w-full h-7 border border-gray-200 rounded cursor-pointer" />
            </div>
          </>
        )}

        {(el.type === 'rect' || el.type === 'ellipse') && (
          <>
            <div>
              <label className="text-[10px] text-gray-500">填充色</label>
              <div className="flex gap-1">
                <input type="color" value={el.props.fill || '#e2e8f0'} onChange={e => updateProps({ fill: e.target.value })}
                  className="flex-1 h-7 border border-gray-200 rounded cursor-pointer" />
                <button onClick={() => updateProps({ fill: 'transparent' })}
                  className="px-2 py-0.5 text-[10px] border border-gray-200 rounded hover:bg-gray-50">透明</button>
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500">边框色</label>
              <input type="color" value={el.props.stroke || '#cbd5e1'} onChange={e => updateProps({ stroke: e.target.value })}
                className="w-full h-7 border border-gray-200 rounded cursor-pointer" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">边框粗细</label>
              <input type="number" value={el.props.strokeWidth || 1} min={0} max={20}
                onChange={e => updateProps({ strokeWidth: +e.target.value })}
                className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
            </div>
            {el.type === 'rect' && (
              <div>
                <label className="text-[10px] text-gray-500">圆角</label>
                <input type="number" value={el.props.borderRadius || 0} min={0} max={100}
                  onChange={e => updateProps({ borderRadius: +e.target.value })}
                  className="w-full px-1.5 py-0.5 text-xs border border-gray-200 rounded" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
