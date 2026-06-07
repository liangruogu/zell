import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useResizablePanel } from '@/components/layout/ResizablePanel'
import type { Whiteboard } from '@/types/whiteboard'
import { Plus, PenTool, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

function parseSnapshot(wb: Whiteboard | null) {
  if (!wb?.snapshot) return undefined
  try {
    const json = new TextDecoder().decode(new Uint8Array(wb.snapshot))
    return JSON.parse(json)
  } catch {
    return undefined
  }
}

export default function WhiteboardPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const { whiteboards, currentWhiteboard, loading, fetchWhiteboards, createWhiteboard, deleteWhiteboard, setCurrentWhiteboard   } = useWhiteboardStore()
  const panel = useResizablePanel()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null)
  const snapshot = useMemo(() => parseSnapshot(currentWhiteboard), [currentWhiteboard])

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchWhiteboards(projectId)
    }
  }, [projectId, fetchProject, fetchWhiteboards])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        panel.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel.toggle])

  const handleCreate = useCallback(async () => {
    if (!projectId || !newName.trim()) return
    const wb = await createWhiteboard(projectId, newName.trim())
    setNewName('')
    setShowCreate(false)
    setCurrentWhiteboard(wb)
  }, [projectId, newName, createWhiteboard, setCurrentWhiteboard])

  const confirmDelete = useCallback((wb: Whiteboard) => {
    setDeleteTarget(wb)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteWhiteboard(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteWhiteboard])

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        {/* Whiteboard list sidebar */}
        <div {...panel.panelProps}>
          <div className="flex-1 overflow-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
            ) : whiteboards.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无白板</p>
            ) : (
              whiteboards.map((wb) => (
                <WhiteboardItem
                  key={wb.id}
                  whiteboard={wb}
                  isActive={currentWhiteboard?.id === wb.id}
                  onSelect={setCurrentWhiteboard}
                  onDelete={confirmDelete}
                />
              ))
            )}
          </div>

          <div className="p-2 border-t border-gray-100 space-y-1 shrink-0">
            {showCreate ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="白板名称"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setShowCreate(false); setNewName('') }
                  }}
                  className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400"
                />
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>确定</Button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
              >
                <Plus size={14} />
                新建白板
              </button>
            )}
            <p className="text-xs text-gray-400 px-2.5">{whiteboards.length} 个白板</p>
          </div>
        </div>

        {/* Resize handle */}
        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Canvas area */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentWhiteboard ? (
            <div className="flex-1 relative">
              <Tldraw
                key={currentWhiteboard.id}
                snapshot={snapshot}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <PenTool size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg">选择或创建一个白板</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="删除白板"
        description={`确定要删除「${deleteTarget?.name}」吗？此操作不可撤销。`}
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}

function WhiteboardItem({
  whiteboard, isActive, onSelect, onDelete,
}: {
  whiteboard: Whiteboard; isActive: boolean
  onSelect: (w: Whiteboard) => void
  onDelete: (w: Whiteboard) => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
        isActive ? 'bg-bindle-100 text-bindle-700' : 'text-gray-600 hover:bg-gray-50'
      )}
      onClick={() => onSelect(whiteboard)}
    >
      <PenTool size={14} className="shrink-0 text-gray-400" />
      <span className="truncate flex-1">{whiteboard.name}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(whiteboard) }}
          className="p-0.5 rounded hover:bg-red-100" title="删除"
        >
          <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}
