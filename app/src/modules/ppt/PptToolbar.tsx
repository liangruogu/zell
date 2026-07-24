import { Type, Square, PenTool, ImageIcon } from 'lucide-react'
import { createShapeId, type Editor } from 'tldraw'

interface PptToolbarProps {
  editor: Editor
}

export function PptToolbar({ editor }: PptToolbarProps) {
  return (
    <div className="h-9 border-b border-gray-200 bg-white flex items-center px-3 gap-1 shrink-0">
      <button onClick={() => editor.setCurrentTool('select')} className="px-2 py-1 text-xs rounded hover:bg-gray-100">选择</button>
      <span className="text-gray-200">|</span>
      <button onClick={() => editor.setCurrentTool('text')} className="p-1 rounded hover:bg-gray-100" title="文本"><Type size={14} /></button>
      <button onClick={() => editor.setCurrentTool('geo')} className="p-1 rounded hover:bg-gray-100" title="形状"><Square size={14} /></button>
      <button onClick={() => editor.setCurrentTool('draw')} className="p-1 rounded hover:bg-gray-100" title="画笔"><PenTool size={14} /></button>
      <button onClick={() => editor.setCurrentTool('arrow')} className="p-1 rounded hover:bg-gray-100" title="箭头">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>
      </button>
      <span className="text-gray-200">|</span>
      <button
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              editor.createShape({ id: createShapeId(), type: 'image', x: 300, y: 200, props: { src: dataUrl, w: 400, h: 300 } })
            }
            reader.readAsDataURL(file)
          }
          input.click()
        }}
        className="p-1 rounded hover:bg-gray-100" title="插入图片"><ImageIcon size={14} />
      </button>
    </div>
  )
}
