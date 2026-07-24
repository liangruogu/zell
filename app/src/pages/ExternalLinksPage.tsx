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
import { Plus, PenTool, Trash2, AlertCircle, Presentation, LayoutTemplate, Copy, GripHorizontal, Type, Square, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tldraw, createTLStore, getSnapshot, loadSnapshot, DefaultSpinner, defaultShapeUtils, defaultBindingUtils, createShapeId } from 'tldraw'
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
                currentWhiteboard.wb_type === 'ppt' ? (
                  <PptCanvas store={store} whiteboardId={currentWhiteboard.id} />
                ) : (
                  <Tldraw key={currentWhiteboard.id} store={store} />
                )
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
/*  PPT Canvas                                                          */
/* ------------------------------------------------------------------ */

function PptCanvas({ store, whiteboardId }: { store: TLStore; whiteboardId: string }) {
  const [editor, setEditor] = useState<any>(null)
  const [slides, setSlides] = useState<any[]>([])
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const refreshSlides = useCallback(() => {
    if (!editor) return
    const shapes = editor.getCurrentPageShapes()
      .filter((s: any) => s.type === 'frame')
      .filter((s: any) => s.props?.meta?.slideType === 'slide')
      .sort((a: any, b: any) => (a.props?.meta?.slideIndex ?? 0) - (b.props?.meta?.slideIndex ?? 0))
    setSlides(shapes)
  }, [editor])

  // Track slide frames via editor changes
  useEffect(() => {
    if (!editor) return
    const unsub = editor.store.listen(refreshSlides)
    refreshSlides()
    return () => unsub()
  }, [editor, refreshSlides])

  const focusSlide = useCallback((slideId: string) => {
    if (!editor) return
    setCurrentSlideId(slideId)
    const shape = editor.getShape(slideId)
    if (!shape) return
    editor.setCameraOptions({
      constraints: {
        initialZoom: 'fit-max',
        baseZoom: 'fit-max',
        bounds: { x: shape.x - 60, y: shape.y - 60, w: shape.props.w + 120, h: shape.props.h + 120 },
        behavior: 'contain',
        origin: { x: 0.5, y: 0.5 },
        padding: { x: 20, y: 20 },
      },
    })
    editor.zoomToBounds(
      { x: shape.x - 60, y: shape.y - 60, w: shape.props.w + 120, h: shape.props.h + 120 },
      { animation: { duration: 250 } }
    )
  }, [editor])

  const addSlide = useCallback((afterIndex?: number) => {
    if (!editor) return
    const idx = afterIndex ?? slides.length
    const x = 100 + idx * 1400
    const id = createShapeId()
    editor.createShape({
      id,
      type: 'frame',
      x,
      y: 100,
      props: {
        name: `幻灯片 ${idx + 1}`,
        w: 1280,
        h: 720,
        meta: { slideType: 'slide', slideIndex: idx },
      },
    })
    // Renumber subsequent slides
    editor.batch(() => {
      for (let j = idx + 1; j <= slides.length; j++) {
        const s = slides[j - 1]
        if (s) {
          editor.updateShape({
            id: s.id,
            type: 'frame',
            x: 100 + j * 1400,
            props: { ...s.props, name: `幻灯片 ${j + 1}`, meta: { ...s.props.meta, slideIndex: j } },
          })
        }
      }
    })
    focusSlide(id)
    setTimeout(refreshSlides, 100)
  }, [editor, slides, focusSlide, refreshSlides])

  const duplicateSlide = useCallback((e: React.MouseEvent, slideId: string) => {
    e.stopPropagation()
    if (!editor) return
    const idx = slides.findIndex(s => s.id === slideId)
    if (idx < 0) return
    addSlide(idx)
    setTimeout(refreshSlides, 100)
  }, [editor, slides, addSlide, refreshSlides])

  const deleteSlide = useCallback((e: React.MouseEvent, slideId: string) => {
    e.stopPropagation()
    if (!editor) return
    if (slides.length <= 1) return
    const idx = slides.findIndex(s => s.id === slideId)
    editor.deleteShape(slideId)
    // Renumber
    const remaining = slides.filter(s => s.id !== slideId)
    editor.batch(() => {
      remaining.forEach((s: any, i: number) => {
        editor.updateShape({
          id: s.id,
          type: 'frame',
          x: 100 + i * 1400,
          props: { ...s.props, name: `幻灯片 ${i + 1}`, meta: { ...s.props.meta, slideIndex: i } },
        })
      })
    })
    if (currentSlideId === slideId && remaining.length > 0) {
      focusSlide(remaining[0].id)
    }
    setTimeout(refreshSlides, 100)
  }, [editor, slides, currentSlideId, focusSlide, refreshSlides])

  // Reorder: swap x positions and indices
  const moveSlide = useCallback((fromIdx: number, toIdx: number) => {
    if (!editor || fromIdx === toIdx) return
    const a = slides[fromIdx]
    const b = slides[toIdx]
    if (!a || !b) return
    editor.batch(() => {
      editor.updateShape({ id: a.id, type: 'frame', x: 100 + toIdx * 1400, props: { ...a.props, name: `幻灯片 ${toIdx + 1}`, meta: { ...a.props.meta, slideIndex: toIdx } } })
      editor.updateShape({ id: b.id, type: 'frame', x: 100 + fromIdx * 1400, props: { ...b.props, name: `幻灯片 ${fromIdx + 1}`, meta: { ...b.props.meta, slideIndex: fromIdx } } })
    })
    setTimeout(refreshSlides, 100)
  }, [editor, slides])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toIdx: number) => {
    e.preventDefault()
    if (dragIdx !== null && dragIdx !== toIdx) {
      moveSlide(dragIdx, toIdx)
    }
    setDragIdx(null)
  }, [dragIdx, moveSlide])

  // Select first slide when editor mounts
  useEffect(() => {
    if (!editor || slides.length === 0) return
    if (!currentSlideId || !slides.find(s => s.id === currentSlideId)) {
      focusSlide(slides[0].id)
    }
  }, [editor, slides, currentSlideId, focusSlide])

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="h-9 border-b border-gray-200 bg-white flex items-center px-3 gap-1 shrink-0">
        {editor && (
          <>
            <button onClick={() => editor.setCurrentTool('select')} className="px-2 py-1 text-xs rounded hover:bg-gray-100">选择</button>
            <span className="text-gray-200">|</span>
            <button onClick={() => editor.setCurrentTool('text')} className="p-1 text-xs rounded hover:bg-gray-100" title="文本"><Type size={14} /></button>
            <button onClick={() => editor.setCurrentTool('geo')} className="p-1 text-xs rounded hover:bg-gray-100" title="形状"><Square size={14} /></button>
            <button onClick={() => editor.setCurrentTool('draw')} className="p-1 text-xs rounded hover:bg-gray-100" title="画笔"><PenTool size={14} /></button>
            <button onClick={() => editor.setCurrentTool('arrow')} className="p-1 text-xs rounded hover:bg-gray-100" title="箭头">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/></svg>
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={async () => {
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
              className="p-1 text-xs rounded hover:bg-gray-100" title="插入图片"><ImageIcon size={14} /></button>
          </>
        )}
      </div>

      {/* Center: canvas + right panel */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative bg-gray-300">
          <Tldraw
            key={whiteboardId}
            store={store}
            hideUi
            onMount={(ed) => setEditor(ed)}
          />
          {slides.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="text-center text-gray-500 bg-white/80 rounded-xl p-8 shadow-sm">
                <Presentation size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg mb-2">创建你的第一张幻灯片</p>
                <button onClick={() => addSlide()} className="pointer-events-auto px-4 py-2 bg-bindle-500 text-white rounded-lg text-sm hover:bg-bindle-600">
                  <Plus size={14} className="inline mr-1" />新建幻灯片
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: properties panel */}
        <div className="w-48 border-l border-gray-200 bg-white shrink-0 p-3">
          <p className="text-xs text-gray-400 text-center pt-4">
            {currentSlideId ? '选中元素后可编辑属性' : '点击幻灯片开始编辑'}
          </p>
        </div>
      </div>

      {/* Bottom: horizontal slide strip */}
      <div className="h-28 border-t border-gray-200 bg-gray-50 flex items-center px-3 gap-2 shrink-0">
        <button
          onClick={() => addSlide()}
          className="w-20 h-[72px] border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:border-bindle-400 hover:text-bindle-500 shrink-0 transition-colors"
        >
          <Plus size={20} />
        </button>
        <div className="flex gap-2 overflow-x-auto py-1">
          {slides.map((s: any, i: number) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, i)}
              onClick={() => focusSlide(s.id)}
              onDoubleClick={() => {
                // Double click to rename
                const newName = prompt('幻灯片名称', s.props?.name || `幻灯片 ${i + 1}`)
                if (newName && editor) {
                  editor.updateShape({
                    id: s.id,
                    type: 'frame',
                    props: { ...s.props, name: newName },
                  })
                }
              }}
              className={cn(
                'group relative w-28 h-[72px] border rounded cursor-pointer shrink-0 transition-all',
                currentSlideId === s.id
                  ? 'border-bindle-400 ring-2 ring-bindle-200'
                  : 'border-gray-300 hover:border-gray-400',
                dragIdx === i && 'opacity-50'
              )}
            >
              <div className="w-full h-full bg-white rounded flex items-center justify-center text-[10px] text-gray-400">
                {i + 1}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/30 text-white text-[9px] px-1 py-0.5 rounded-b flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="truncate flex-1">{s.props?.name || `幻灯片 ${i + 1}`}</span>
                <GripHorizontal size={9} className="cursor-grab shrink-0 ml-0.5" />
              </div>
              <div className="absolute top-0 right-0 flex opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => duplicateSlide(e, s.id)} className="p-0.5 bg-white border border-gray-200 rounded-bl hover:bg-bindle-50" title="复制">
                  <Copy size={9} />
                </button>
                <button onClick={(e) => deleteSlide(e, s.id)} className="p-0.5 bg-white border border-gray-200 rounded-br hover:bg-red-50" title="删除">
                  <Trash2 size={9} className="text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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
