import { useState, useEffect, useCallback } from 'react'
import { LayoutGrid, AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react'

export function TableToolbar({ editor }: { editor: any }) {
  const [pos, setPos] = useState<{ x: number; y: number; right: number } | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [gridHover, setGridHover] = useState({ rows: 3, cols: 3 })

  useEffect(() => {
    if (!editor) return
    const update = () => {
      if (!editor.isActive('table')) {
        setPos(null)
        setShowGrid(false)
        return
      }
      const table = editor.view.dom.querySelector('table')
      if (!table) return
      const rect = table.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.top - 22, right: rect.right })
    }
    editor.on('selectionUpdate', update)
    return () => { editor.off('selectionUpdate', update) }
  }, [editor])

  const handleGridSelect = useCallback((rows: number, cols: number) => {
    if (!editor) return
    const tableEl = editor.view.dom.querySelector('table')
    if (!tableEl) return
    const currentRows = tableEl.rows.length
    const currentCols = tableEl.rows[0]?.cells.length || 0

    if (rows < currentRows) {
      for (let i = currentRows; i > rows; i--) {
        if (tableEl.rows.length <= rows) break
        editor.chain().focus().goToNextCell().run()
        editor.chain().focus().deleteRow().run()
      }
    }
    if (cols < currentCols) {
      for (let i = currentCols; i > cols; i--) {
        if ((tableEl.rows[0]?.cells.length || 0) <= cols) break
        editor.chain().focus().goToNextCell().run()
        editor.chain().focus().deleteColumn().run()
      }
    }
    if (rows > currentRows) {
      for (let i = currentRows; i < rows; i++) {
        editor.chain().focus().addRowAfter().run()
      }
    }
    if (cols > currentCols) {
      for (let i = currentCols; i < cols; i++) {
        editor.chain().focus().addColumnAfter().run()
      }
    }
    setShowGrid(false)
  }, [editor])

  if (!pos) return null

  return (
    <>
      <div className="fixed z-40 flex items-center gap-0" style={{ left: pos.x, top: pos.y }}>
        <div className="relative">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            title="调整表格大小"
          >
            <LayoutGrid size={15} style={{ transform: 'translateY(1.5px)', display: 'block' }} />
          </button>
          {showGrid && (
            <div
              className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-2"
              onMouseLeave={() => setShowGrid(false)}
            >
              <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: 'repeat(6, 24px)', gridTemplateRows: 'repeat(6, 24px)' }}
              >
                {Array.from({ length: 6 }, (_, r) =>
                  Array.from({ length: 6 }, (_, c) => (
                    <div
                      key={`${r}-${c}`}
                      className={`rounded cursor-pointer border transition-colors ${
                        r < gridHover.rows && c < gridHover.cols
                          ? 'bg-zell-200 border-zell-400'
                          : 'bg-gray-100 border-gray-200 hover:border-gray-300'
                      }`}
                      onMouseEnter={() => setGridHover({ rows: r + 1, cols: c + 1 })}
                      onClick={() => handleGridSelect(r + 1, c + 1)}
                    />
                  ))
                )}
              </div>
              <div className="text-center text-[10px] text-gray-400 mt-1">
                {gridHover.cols}×{gridHover.rows}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="左对齐">
          <AlignLeft size={15} />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="居中">
          <AlignCenter size={15} />
        </button>
        <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="右对齐">
          <AlignRight size={15} />
        </button>
      </div>

      <div className="fixed z-40" style={{ left: pos.right - 26, top: pos.y }}>
        <button onClick={() => editor.chain().focus().deleteTable().run()} className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer" title="删除表格">
          <Trash2 size={15} />
        </button>
      </div>
    </>
  )
}
