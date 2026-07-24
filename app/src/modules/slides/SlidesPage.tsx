import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { useProjectStore } from '@/stores/projectStore'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useResizablePanel } from '@/components/layout/ResizablePanel'
import { cn } from '@/lib/utils'
import {
  Tldraw, createTLStore, getSnapshot, loadSnapshot,
  DefaultSpinner, defaultShapeUtils, defaultBindingUtils,
} from 'tldraw'
import type { TLStore, TLFrameShape } from 'tldraw'
import 'tldraw/tldraw.css'
import { Plus, Trash2, Presentation, AlertCircle } from 'lucide-react'

const SLIDE_FRAME_TYPE = 'slide'
const SLIDE_SIZE = { w: 1280, h: 720 }

export default function SlidesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const {
    whiteboards, currentWhiteboard, loading,
    fetchWhiteboards, createWhiteboard, deleteWhiteboard,
    setCurrentWhiteboard, saveSnapshot,
  } = useWhiteboardStore()
  const panel = useResizablePanel()

  const [store, setStore] = useState<TLStore | null>(null)
  const [loadState, setLoadState] = useState<{ status: 'loading' } | { status: 'ready' } | { status: 'error'; error: string }>({ status: 'loading' })
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null)
  const [slideIds, setSlideIds] = useState<string[]>([])

  const emptyStoreOpts = useMemo(
    () => ({ shapeUtils: defaultShapeUtils, bindingUtils: defaultBindingUtils }),
    []
  )

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchWhiteboards(projectId)
    }
  }, [projectId, fetchProject, fetchWhiteboards])

  // Auto-create or select first whiteboard for slides
  useEffect(() => {
    if (loading || !projectId) return
    if (whiteboards.length === 0) {
      createWhiteboard(projectId, 'PPT').then(wb => setCurrentWhiteboard(wb))
    } else {
      // Find a slides whiteboard or use first
      const slidesWb = whiteboards.find(w => w.name.includes('PPT')) || whiteboards[0]
      setCurrentWhiteboard(slidesWb)
    }
  }, [loading, whiteboards.length])

  // Initialize tldraw store
  useEffect(() => {
    if (!currentWhiteboard) {
      setStore(null)
      return
    }
    setLoadState({ status: 'loading' })
    const newStore = createTLStore(emptyStoreOpts)
    const loaded = currentWhiteboard.snapshot
      ? (() => { try { return JSON.parse(currentWhiteboard.snapshot) } catch { return null } })()
      : null
    if (loaded) {
      try { loadSnapshot(newStore, loaded) } catch { /* */ }
    }
    setStore(newStore)
    setLoadState({ status: 'ready' })
  }, [currentWhiteboard?.id])

  // Track slide frames
  useEffect(() => {
    if (!store) return
    const updateSlides = () => {
      const shapes = store.allRecords().filter(r => {
        if (r.typeName !== 'shape') return false
        const s = r as any
        return s.type === 'frame' && s.props?.meta?.slideType === SLIDE_FRAME_TYPE
      })
      setSlideIds(shapes.map(s => s.id))
    }
    const unsub = store.listen(updateSlides)
    updateSlides()
    return () => unsub()
  }, [store])

  const addSlide = useCallback(() => {
    if (!store) return
    const existingSlides = slideIds.length
    const x = 100 + existingSlides * (SLIDE_SIZE.w + 80)
    const id = store.createShapeId()
    store.put([{
      id,
      typeName: 'shape' as any,
      type: 'frame' as any,
      x,
      y: 100,
      props: {
        name: `幻灯片 ${existingSlides + 1}`,
        w: SLIDE_SIZE.w,
        h: SLIDE_SIZE.h,
        meta: { slideType: SLIDE_FRAME_TYPE, slideIndex: existingSlides },
      },
      parentId: store.getCurrentPageId(),
    }] as any)
  }, [store, slideIds.length])

  const deleteSlide = useCallback((id: string) => {
    if (!store) return
    store.remove([id])
  }, [store])

  // Auto-save
  useEffect(() => {
    if (!store || !currentWhiteboard) return
    const unsub = store.listen(() => {
      const json = JSON.stringify(getSnapshot(store))
      saveSnapshot(currentWhiteboard.id, json)
    })
    return () => unsub()
  }, [store, currentWhiteboard?.id])

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        {/* Slide sidebar */}
        <div {...panel.panelProps}>
          <div className="flex-1 overflow-auto py-1 space-y-1">
            {loadState.status !== 'ready' ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
            ) : slideIds.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无幻灯片</p>
            ) : (
              slideIds.map((id: string) => (
                <SlideThumb
                  key={id}
                  store={store!}
                  shapeId={id}
                  isSelected={selectedSlideId === id}
                  onSelect={() => setSelectedSlideId(id)}
                  onDelete={() => deleteSlide(id)}
                />
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100 shrink-0">
            <Button size="sm" onClick={addSlide} className="w-full">
              <Plus size={14} className="mr-1" />新建幻灯片
            </Button>
          </div>
        </div>

        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Canvas */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentWhiteboard ? (
            <div className="flex-1 relative">
              {loadState.status === 'loading' ? (
                <div className="flex items-center justify-center h-full"><DefaultSpinner /></div>
              ) : loadState.status === 'error' ? (
                <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                  <AlertCircle size={32} /><p>{loadState.error}</p>
                </div>
              ) : store ? (
                <Tldraw key={currentWhiteboard.id} store={store} />
              ) : null}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Presentation size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg">正在准备幻灯片...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function SlideThumb({ store, shapeId, isSelected, onSelect, onDelete }: {
  store: TLStore; shapeId: string; isSelected: boolean
  onSelect: () => void; onDelete: () => void
}) {
  const shape = store.getSnapshot().store[`shape:${shapeId}`] as any
  if (!shape) return null
  const name = shape.props?.name || '幻灯片'
  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
        isSelected ? 'bg-bindle-100 text-bindle-700' : 'text-gray-600 hover:bg-gray-50'
      )}
      onClick={onSelect}
    >
      <div className="w-10 h-6 bg-gray-200 rounded shrink-0 border border-gray-300 flex items-center justify-center text-[8px] text-gray-400">
        预览
      </div>
      <span className="truncate flex-1 text-xs">{name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 shrink-0"
      >
        <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
      </button>
    </div>
  )
}
