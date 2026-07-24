import { useEffect, useState, useCallback, useMemo } from 'react'
import { throttle } from 'lodash'
import { invoke } from '@tauri-apps/api/core'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useResizablePanel } from '@/components/layout/ResizablePanel'
import type { Whiteboard } from '@/types/whiteboard'
import { Plus, PenTool, Trash2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tldraw, createTLStore, getSnapshot, loadSnapshot, DefaultSpinner, defaultShapeUtils, defaultBindingUtils } from 'tldraw'
import type { TLStore } from 'tldraw'
import 'tldraw/tldraw.css'


/* ------------------------------------------------------------------ */
/*  page                                                               */
/* ------------------------------------------------------------------ */

export default function WhiteboardPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const {
    whiteboards, currentWhiteboard, loading,
    fetchWhiteboards, createWhiteboard, deleteWhiteboard, renameWhiteboard,
    setCurrentWhiteboard, saveSnapshot,
  } = useWhiteboardStore()
  const panel = useResizablePanel()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('free')
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null)

  const [loadState, setLoadState] = useState<
    { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: string }
  >({ status: 'loading' })

  const [store, setStore] = useState<TLStore | null>(null)

  const emptyStoreOpts = useMemo(
    () => ({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
    []
  )

  /* ---------- 项目 & 白板列表 ---------- */
  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchWhiteboards(projectId)
    }
  }, [projectId, fetchProject, fetchWhiteboards])

  /* ---------- 鎸佷箙鍖?---------- */
  useEffect(() => {
    if (!currentWhiteboard) {
      setStore(null)
      return
    }

    setLoadState({ status: 'loading' })

    const newStore = createTLStore(emptyStoreOpts)

    ;(async () => {
      try {
        const wb = await invoke<Whiteboard>('get_whiteboard', { id: currentWhiteboard.id })
        if (wb.snapshot) {
          const snapshot = JSON.parse(wb.snapshot)
          loadSnapshot(newStore, snapshot)
        }
        setStore(newStore)
        setLoadState({ status: 'ready' })
      } catch (error: any) {
        setLoadState({ status: 'error', error: error.message })
        console.error('加载失败:', error)
      }
    })()

    const throttledSave = throttle(() => {
      const json = JSON.stringify(getSnapshot(newStore))
      saveSnapshot(currentWhiteboard.id, json)
        .then(() => console.log('自动保存成功'))
        .catch((e) => console.error('自动保存失败:', e))
    }, 1000)

    const cleanupFn = newStore.listen(throttledSave)

    return () => {
      cleanupFn()
      throttledSave.cancel()
    }
  }, [currentWhiteboard?.id])

  const handleSelectWhiteboard = useCallback((wb: Whiteboard) => {
    setCurrentWhiteboard(wb)
  }, [setCurrentWhiteboard])

  /* ---------- 閿洏 ---------- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); panel.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel.toggle])

  /* ---------- CRUD ---------- */
  const handleCreate = useCallback(async () => {
    if (!projectId || !newName.trim()) return
    const wb = await createWhiteboard(projectId, newName.trim(), newType)
    setNewName(''); setShowCreate(false); setNewType('free'); setCurrentWhiteboard(wb)
  }, [projectId, newName, newType, createWhiteboard, setCurrentWhiteboard])

  const confirmDelete = useCallback((wb: Whiteboard) => setDeleteTarget(wb), [])
  const handleRename = useCallback((wb: Whiteboard, newName: string) => {
    renameWhiteboard(wb.id, newName)
  }, [renameWhiteboard])
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteWhiteboard(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteWhiteboard])

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
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
                  onSelect={handleSelectWhiteboard}
                  onDelete={confirmDelete}
                  onRename={handleRename}
                />
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100 space-y-1 shrink-0">
            {showCreate ? (
              <div className="space-y-2">
                <input autoFocus type="text" placeholder="白板名称" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setShowCreate(false); setNewName(''); setNewType('free') }
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400"
                />
                <div className="flex gap-1">
                  {(['free', 'ppt', 'aigc', 'figma'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNewType(t)}
                      className={cn(
                        'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                        newType === t ? 'bg-bindle-50 border-bindle-300 text-bindle-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      )}
                    >
                      {{ free: '自由', ppt: 'PPT', aigc: 'AIGC', figma: 'UI' }[t]}
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="w-full">确定</Button>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors">
                <Plus size={14} /> 新建白板
              </button>
            )}
            <p className="text-xs text-gray-400 px-2.5">{whiteboards.length} 个白板</p>
          </div>
        </div>

        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentWhiteboard ? (
            <div className="flex-1 relative">
              {loadState.status === 'loading' ? (
                <div className="flex items-center justify-center h-full">
                  <DefaultSpinner />
                </div>
              ) : loadState.status === 'error' ? (
                <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                  <AlertCircle size={32} />
                  <p>加载失败: {loadState.error}</p>
                </div>
              ) : store ? (
                <Tldraw key={currentWhiteboard.id} store={store} />
              ) : null}
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

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}
        title="删除白板"
        description={`确定要删除「${deleteTarget?.name}」吗？此操作不可撤销。`}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}

/* ------------------------------------------------------------------ */
/*  WhiteboardItem                                                     */
/* ------------------------------------------------------------------ */

function WhiteboardItem({ whiteboard, isActive, onSelect, onDelete, onRename }: {
  whiteboard: Whiteboard; isActive: boolean
  onSelect: (w: Whiteboard) => void
  onDelete: (w: Whiteboard) => void
  onRename: (w: Whiteboard, newName: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(whiteboard.name)

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setRenaming(true)
    setRenameValue(whiteboard.name)
  }

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== whiteboard.name) {
      onRename(whiteboard, renameValue.trim())
    }
    setRenaming(false)
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
        isActive ? 'bg-bindle-100 text-bindle-700' : 'text-gray-600 hover:bg-gray-50'
      )}
      onClick={() => onSelect(whiteboard)}
      onDoubleClick={handleDoubleClick}
    >
      <PenTool size={14} className="shrink-0 text-gray-400" />
      {whiteboard.wb_type && whiteboard.wb_type !== 'free' && (
        <span className="text-[10px] text-gray-400 shrink-0">{{ ppt: 'PPT', aigc: 'AIGC', figma: 'UI' }[whiteboard.wb_type] || whiteboard.wb_type}</span>
      )}
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRenameSubmit()
            if (e.key === 'Escape') { setRenaming(false); setRenameValue(whiteboard.name) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 px-1 py-0.5 text-sm border border-bindle-300 rounded outline-none focus:ring-1 focus:ring-bindle-400"
        />
      ) : (
        <span className="truncate flex-1">{whiteboard.name}</span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onDelete(whiteboard) }}
          className="p-0.5 rounded hover:bg-red-100" title="删除">
          <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}
