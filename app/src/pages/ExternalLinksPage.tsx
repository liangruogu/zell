import { useEffect, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
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
import { PptCanvas } from '@/modules/ppt/PptCanvas'
import type { PptData } from '@/modules/ppt/types'

export default function WhiteboardPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const { whiteboards, currentWhiteboard, loading, fetchWhiteboards, createWhiteboard, deleteWhiteboard, renameWhiteboard, setCurrentWhiteboard } = useWhiteboardStore()
  const panel = useResizablePanel(224, 120, 400, 80, 'zell_panel_whiteboard')

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('ppt')
  const [deleteTarget, setDeleteTarget] = useState<Whiteboard | null>(null)
  const [pptData, setPptData] = useState<PptData | null>(null)

  useEffect(() => {
    if (projectId) { fetchProject(projectId); fetchWhiteboards(projectId) }
  }, [projectId])

  // Ctrl+Shift+L toggle sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); panel.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel.toggle])

  // Load PPT data from whiteboard snapshot
  useEffect(() => {
    if (currentWhiteboard?.wb_type === 'ppt' && currentWhiteboard.snapshot) {
      try { setPptData(JSON.parse(currentWhiteboard.snapshot)) } catch { setPptData({ slides: [] }) }
    } else if (currentWhiteboard?.wb_type === 'ppt') {
      setPptData({ slides: [] })
    } else {
      setPptData(null)
    }
  }, [currentWhiteboard?.id])

  const handlePptChange = useCallback((data: PptData) => {
    if (!currentWhiteboard) return
    const json = JSON.stringify(data)
    invoke('save_whiteboard_snapshot', { id: currentWhiteboard.id, snapshot: json }).catch(console.error)
    setCurrentWhiteboard({ ...currentWhiteboard, snapshot: json })
  }, [currentWhiteboard])

  const handleCreate = useCallback(async () => {
    if (!projectId || !newName.trim()) return
    const dup = whiteboards.find(w => w.name === newName.trim() && w.wb_type === newType)
    if (dup) { alert('same name and type already exists'); return }
    const wb = await createWhiteboard(projectId, newName.trim(), newType)
    setNewName(''); setShowCreate(false); setNewType('ppt'); setCurrentWhiteboard(wb)
  }, [projectId, newName, newType, whiteboards, createWhiteboard, setCurrentWhiteboard])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return; await deleteWhiteboard(deleteTarget.id); setDeleteTarget(null)
  }, [deleteTarget, deleteWhiteboard])

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        <div {...panel.panelProps}>
          <div className="flex-1 overflow-auto py-1">
            {loading ? <p className="px-3 py-4 text-sm text-gray-400 text-center">loading...</p>
              : whiteboards.length === 0 ? <p className="px-3 py-4 text-sm text-gray-400 text-center">no whiteboards</p>
                : whiteboards.map(wb => (
                  <WhiteboardItem key={wb.id} whiteboard={wb} isActive={currentWhiteboard?.id === wb.id}
                    onSelect={setCurrentWhiteboard} onDelete={setDeleteTarget} onRename={renameWhiteboard} />
                ))}
          </div>
          <div className="p-2 border-t border-gray-100 space-y-1 shrink-0">
            {showCreate ? (
              <div className="space-y-2">
                <input autoFocus placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName(''); setNewType('ppt') } }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-zell-400" />
                <div className="flex gap-1">
                  {(['ppt', 'mood', 'figma'] as const).map(t => (
                    <button key={t} onClick={() => setNewType(t)} className={cn('flex-1 px-2 py-1 text-xs rounded border transition-colors',
                      newType === t ? 'bg-zell-50 border-zell-300 text-zell-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100')}>
                      {{ ppt: 'PPT', mood: 'Mood', figma: 'UI' }[t]}
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="w-full">Create</Button>
              </div>
            ) : (
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded">
                <Plus size={14} /> New Whiteboard
              </button>
            )}
            
          </div>
        </div>

        {panel.handleProps && <div {...panel.handleProps} />}

        <div className="flex-1 flex flex-col min-w-0">
          {currentWhiteboard ? (
            currentWhiteboard.wb_type === 'ppt' ? <PptCanvas data={pptData} onDataChange={handlePptChange} />
              : (
                <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-100">
                  <div className="text-center">
                    <PenTool size={48} strokeWidth={1} className="mx-auto mb-3" />
                    <p className="text-lg">{currentWhiteboard.name}</p>
                    <p className="text-sm mt-1">{currentWhiteboard.wb_type} canvas ¡ª coming soon</p>
                  </div>
                </div>
              )
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <PenTool size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg">Select or create a whiteboard</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="Delete" description={`Delete "${deleteTarget?.name}"?`}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}

function WhiteboardItem({ whiteboard, isActive, onSelect, onDelete, onRename }: {
  whiteboard: Whiteboard; isActive: boolean; onSelect: (w: Whiteboard) => void; onDelete: (w: Whiteboard) => void; onRename: (id: string, name: string) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(whiteboard.name)
  const submit = () => { if (renameValue.trim() && renameValue !== whiteboard.name) onRename(whiteboard.id, renameValue.trim()); setRenaming(false) }
  return (
    <div className={cn('group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
      isActive ? 'bg-zell-100 text-zell-700' : 'text-gray-600 hover:bg-gray-50')}
      onClick={() => onSelect(whiteboard)} onDoubleClick={() => { setRenaming(true); setRenameValue(whiteboard.name) }}>
      <PenTool size={14} className="shrink-0 text-gray-400" />
      {whiteboard.wb_type && <span className="text-[10px] text-gray-400 shrink-0">{{ ppt: 'PPT', mood: 'Mood', figma: 'UI' }[whiteboard.wb_type]}</span>}
      {renaming ? <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={submit} onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setRenaming(false); setRenameValue(whiteboard.name) } }} onClick={e => e.stopPropagation()} className="flex-1 px-1 py-0.5 text-sm border border-zell-300 rounded" />
        : <span className="truncate flex-1">{whiteboard.name}</span>}
      <button onClick={e => { e.stopPropagation(); onDelete(whiteboard) }} className="p-0.5 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100"><Trash2 size={13} className="text-gray-400 hover:text-red-500" /></button>
    </div>
  )
}
