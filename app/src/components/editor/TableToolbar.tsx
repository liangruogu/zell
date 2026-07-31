import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'
import { LayoutGrid, AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react'

export function TableToolbar({ editor }: { editor: any }) {
  const [pos, setPos] = useState<{ x: number; y: number; right: number } | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [gridHover, setGridHover] = useState({ rows: 3, cols: 3 })

  useEffect(() => {
    if (!editor) return
    let viewDom: HTMLElement
    try { viewDom = editor.view.dom } catch (e) { logger.error('TableToolbar: failed to access editor dom', e); return }
    const updatePos = () => {
      if (!editor.isActive('table')) {
        setPos(null)
        setShowGrid(false)
        return
      }
      const table = viewDom.querySelector('table')
      if (!table) return
      const rect = table.getBoundingClientRect()
      setPos({ x: rect.left, y: rect.top - 22, right: rect.right })
    }

    editor.on('selectionUpdate', updatePos)

    const scrollContainer = viewDom.closest('.overflow-auto') as HTMLElement
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updatePos)
    }
    if (scrollContainer) scrollContainer.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      editor.off('selectionUpdate', updatePos)
      cancelAnimationFrame(raf)
      if (scrollContainer) scrollContainer.removeEventListener('scroll', onScroll)
    }
  }, [editor])

  const setAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!editor) return
    const { state } = editor
    const { $from } = state.selection

    // Find the table cell and its column index
    let cellNode: any = null
    let cellPos = -1
    for (let d = $from.depth; d > 0; d--) {
      const n = $from.node(d)
      if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') {
        cellNode = n
        cellPos = $from.before(d)
        break
      }
    }
    if (!cellNode) return

    // Find the row containing this cell
    let rowNode: any = null
    let rowPos = -1
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'tableRow') {
        rowNode = $from.node(d)
        rowPos = $from.before(d)
        break
      }
    }
    if (!rowNode) return

    // Find column index
    let colIdx = 0
    let pos = rowPos + 1
    while (pos < cellPos) {
      const n = state.doc.nodeAt(pos)
      if (n && (n.type.name === 'tableCell' || n.type.name === 'tableHeader')) {
        colIdx++
        pos += n.nodeSize
      } else {
        pos++
      }
    }

    // Apply alignment to all cells in this column
    const table = editor.view.dom.querySelector('table')
    if (!table) return
    const rows = table.rows
    const chain = editor.chain()
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      if (colIdx < row.cells.length) {
        const cell = row.cells[colIdx]
        const domPos = editor.view.posAtDOM(cell, 0)
        chain.setTextSelection(domPos + 1).setTextAlign(align)
      }
    }
    chain.run()
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

        <button onClick={() => setAlign('left')} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="左对齐">
          <AlignLeft size={15} />
        </button>
        <button onClick={() => setAlign('center')} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="居中">
          <AlignCenter size={15} />
        </button>
        <button onClick={() => setAlign('right')} className="p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer" title="右对齐">
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

  function handleGridSelect(rows: number, cols: number) {
    if (!editor) return
    const tableEl = editor.view.dom.querySelector('table')
    if (!tableEl) return
    const currentRows = tableEl.rows.length
    const currentCols = tableEl.rows[0]?.cells.length || 0

    // Delete extra rows from bottom-up (preserve data above)
    while (tableEl.rows.length > rows) {
      const lastRow = tableEl.rows[tableEl.rows.length - 1]
      const lastCell = lastRow.cells[lastRow.cells.length - 1]
      const pos = editor.view.posAtDOM(lastCell, 0)
      editor.chain().focus().setTextSelection(pos + lastCell.textContent!.length).deleteRow().run()
    }

    // Delete extra columns from right-to-left
    while (tableEl.rows[0]?.cells && tableEl.rows[0].cells.length > cols) {
      const lastCell = tableEl.rows[0].cells[tableEl.rows[0].cells.length - 1]
      const pos = editor.view.posAtDOM(lastCell, 0)
      editor.chain().focus().setTextSelection(pos + lastCell.textContent!.length).deleteColumn().run()
    }

    // Add rows (empty rows at bottom)
    for (let i = currentRows; i < rows; i++) {
      if (tableEl.rows.length > 0) {
        const lastCell = tableEl.rows[tableEl.rows.length - 1].cells[0]
        const pos = editor.view.posAtDOM(lastCell, 0)
        editor.chain().focus().setTextSelection(pos).addRowAfter().run()
      }
    }

    // Add columns (empty columns at right)
    for (let i = currentCols; i < cols; i++) {
      if (tableEl.rows.length > 0 && tableEl.rows[0].cells.length > 0) {
        const lastCell = tableEl.rows[0].cells[tableEl.rows[0].cells.length - 1]
        const pos = editor.view.posAtDOM(lastCell, 0)
        editor.chain().focus().setTextSelection(pos).addColumnAfter().run()
      }
    }

    setShowGrid(false)
  }
}
