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
    fetchWhiteboards, createWhiteboard, deleteWhiteboard,
    setCurrentWhiteboard, saveSnapshot,
  } = useWhiteboardStore()
  const panel = useResizablePanel()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null)

  const [loadState, setLoadState] = useState<
    { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: string }
  >({ status: 'loading' })

  const [store, setStore] = useState<TLStore | null>(null)

  const emptyStoreOpts = useMemo(
    () => ({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
    []
  )

  /* ---------- 椤圭洰 & 鐧芥澘鍒楄〃 ---------- */
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
        console.error('鍔犺浇澶辫触:', error)
      }
    })()

    const throttledSave = throttle(() => {
      const json = JSON.stringify(getSnapshot(newStore))
      saveSnapshot(currentWhiteboard.id, json)
        .then(() => console.log('鑷姩淇濆瓨鎴愬姛'))
        .catch((e) => console.error('鑷姩淇濆瓨澶辫触:', e))
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
    const wb = await createWhiteboard(projectId, newName.trim())
    setNewName(''); setShowCreate(false); setCurrentWhiteboard(wb)
  }, [projectId, newName, createWhiteboard, setCurrentWhiteboard])

  const confirmDelete = useCallback((wb: Whiteboard) => setDeleteTarget(wb), [])
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
                />
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100 space-y-1 shrink-0">
            {showCreate ? (
              <div className="flex gap-1">
                <input autoFocus type="text" placeholder="鐧芥澘鍚嶇О" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setShowCreate(false); setNewName('') }
                  }}
                  className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400"
                />
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>纭畾</Button>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors">
                <Plus size={14} /> 鏂板缓鐧芥澘
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
                  <p>鍔犺浇澶辫触: {loadState.error}</p>
                </div>
              ) : store ? (
                <Tldraw key={currentWhiteboard.id} store={store} />
              ) : null}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <PenTool size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg">閫夋嫨鎴栧垱寤轰竴涓櫧鏉?/p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}
        title="鍒犻櫎鐧芥澘"
        description={`纭畾瑕佸垹闄ゃ€?{deleteTarget?.name}銆嶅悧锛熸鎿嶄綔涓嶅彲鎾ら攢銆俙}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>鍙栨秷</Button>
          <Button variant="destructive" onClick={handleDelete}>纭鍒犻櫎</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}

/* ------------------------------------------------------------------ */
/*  WhiteboardItem                                                     */
/* ------------------------------------------------------------------ */

function WhiteboardItem({ whiteboard, isActive, onSelect, onDelete }: {
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
        <button onClick={(e) => { e.stopPropagation(); onDelete(whiteboard) }}
          className="p-0.5 rounded hover:bg-red-100" title="鍒犻櫎">
          <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
        </button>
      </div>
    </div>
  )
}
