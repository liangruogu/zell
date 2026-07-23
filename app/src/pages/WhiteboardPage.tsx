import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { useLinkStore } from '@/stores/linkStore'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useResizablePanel } from '@/components/layout/ResizablePanel'
import type { ExternalLink, ProjectFile } from '@/types/share'
import { LINK_TYPE_LABELS, FILE_TYPE_LABELS, FILE_TYPE_ICONS } from '@/lib/constants'
import { format } from '@/lib/format'
import { open } from '@tauri-apps/plugin-shell'
import { Plus, Link2, Trash2, ExternalLink as ExternalLinkIcon, Upload, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

function detectLinkType(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('github.com')) return 'github'
  if (u.includes('figma.com')) return 'figma'
  if (u.includes('canva.com')) return 'canva'
  if (u.includes('notion.so')) return 'notion'
  return 'web'
}

type TabType = 'links' | 'files'

export default function ExternalLinksPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const { links, currentLink, loading: linkLoading, fetchLinks, createLink, updateLink, deleteLink, setCurrentLink, syncLink } = useLinkStore()
  const { files, currentFile, loading: fileLoading, fetchFiles, importFile, deleteFile, updateFile, setCurrentFile, resolveFileUrl, getFilePath, reExtractText } = useFileStore()
  const panel = useResizablePanel()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<TabType>('links')
  const [isDragOver, setIsDragOver] = useState(false)

  // Link form state
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [linkDescription, setLinkDescription] = useState('')
  const [linkType, setLinkType] = useState('web')
  const [isNewLink, setIsNewLink] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExternalLink | null>(null)

  // File form state
  const [fileDescription, setFileDescription] = useState('')
  const [filePreviewUrl, setFilePreviewUrl] = useState('')
  const [deleteFileTarget, setDeleteFileTarget] = useState<ProjectFile | null>(null)

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchLinks(projectId)
      fetchFiles(projectId)
    }
  }, [projectId, fetchProject, fetchLinks, fetchFiles])

  // Tauri-native file drag-and-drop for files tab
  useEffect(() => {
    let mouseX = 0, mouseY = 0
    const onMouseMove = (e: MouseEvent) => { mouseX = e.clientX; mouseY = e.clientY }
    const promise = getCurrentWindow().onDragDropEvent(async (e) => {
      if (tab !== 'files') return
      if (e.payload.type === 'enter') {
        window.addEventListener('mousemove', onMouseMove)
        setIsDragOver(true)
      }
      if (e.payload.type === 'leave' || e.payload.type === 'drop') {
        window.removeEventListener('mousemove', onMouseMove)
        setIsDragOver(false)
      }
      if (e.payload.type !== 'drop') return
      for (const sourcePath of e.payload.paths) {
        try {
          await importFile(projectId!, sourcePath)
        } catch (err) {
          console.error('Import failed:', sourcePath, err)
        }
      }
    })
    return () => { promise.then((unlisten) => unlisten()) }
  }, [tab, projectId, importFile])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); panel.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel.toggle])

  // Populate link form when selecting a link
  useEffect(() => {
    if (currentLink && !isNewLink) {
      setTitle(currentLink.title)
      setUrl(currentLink.url)
      setLinkDescription(currentLink.description)
      setLinkType(currentLink.link_type)
    }
  }, [currentLink])

  // Load file preview when selecting a file
  useEffect(() => {
    if (currentFile && projectId) {
      setFileDescription(currentFile.description)
      if (currentFile.file_type === 'image') {
        resolveFileUrl(projectId, currentFile.file_name).then(setFilePreviewUrl)
      } else {
        setFilePreviewUrl('')
      }
    }
  }, [currentFile, projectId, resolveFileUrl])

  // --- Link handlers ---
  const handleNewLink = useCallback(() => {
    setCurrentLink(null)
    setCurrentFile(null)
    setIsNewLink(true)
    setTitle('')
    setUrl('')
    setLinkDescription('')
    setLinkType('web')
    setTab('links')
  }, [setCurrentLink, setCurrentFile])

  const handleSaveLink = useCallback(async () => {
    if (!projectId || !title.trim() || !url.trim()) return
    const detected = detectLinkType(url)
    const type = linkType === 'web' ? detected : linkType

    if (isNewLink) {
      const link = await createLink(projectId, { title: title.trim(), url: url.trim(), description: linkDescription, linkType: type })
      setCurrentLink(link)
      setIsNewLink(false)
    } else if (currentLink) {
      await updateLink(currentLink.id, { title: title.trim(), url: url.trim(), description: linkDescription, linkType: type })
    }
  }, [projectId, title, url, linkDescription, linkType, isNewLink, currentLink, createLink, updateLink, setCurrentLink])

  const handleOpenUrl = useCallback(async (linkUrl: string) => {
    try { await open(linkUrl) } catch { window.open(linkUrl, '_blank') }
  }, [])

  const confirmDelete = useCallback((link: ExternalLink) => setDeleteTarget(link), [])
  const handleDeleteLink = useCallback(async () => {
    if (!deleteTarget) return
    await deleteLink(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteLink])

  // --- File handlers ---
  const handleNewFile = useCallback(() => {
    setCurrentFile(null)
    setCurrentLink(null)
    setIsNewLink(false)
    setFileDescription('')
    setFilePreviewUrl('')
    setTab('files')
  }, [setCurrentFile, setCurrentLink])

  const processFiles = useCallback(async (paths: string[]) => {
    if (!projectId) return
    console.log('[file-import] processFiles:', paths)
    for (const path of paths) {
      try {
        await importFile(projectId, path)
        console.log('[file-import] imported:', path)
      } catch (e) {
        console.error('[file-import] Failed:', path, e)
      }
    }
  }, [projectId, importFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (tab === 'files') setIsDragOver(true)
  }, [tab])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const droppedFiles = e.dataTransfer?.files
    if (droppedFiles && droppedFiles.length > 0) {
      const paths: string[] = []
      for (let i = 0; i < droppedFiles.length; i++) {
        const f = droppedFiles[i]
        // Tauri may provide path via webkitGetAsEntry or the path attribute
        const path = (f as any).path
        if (path) {
          paths.push(path)
        }
      }
      if (paths.length > 0) {
        await processFiles(paths)
      }
    }
  }, [processFiles])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    console.log('[file-import] input change, files:', selectedFiles?.length)
    if (!selectedFiles || selectedFiles.length === 0 || !projectId) return

    const paths: string[] = []
    for (let i = 0; i < selectedFiles.length; i++) {
      const p = (selectedFiles[i] as any).path
      console.log('[file-import] file:', selectedFiles[i].name, 'path:', p)
      if (p) paths.push(p)
    }
    if (paths.length > 0) {
      await processFiles(paths)
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [projectId, processFiles])

  const handleSaveFile = useCallback(async () => {
    if (!currentFile) return
    await updateFile(currentFile.id, { description: fileDescription })
  }, [currentFile, fileDescription, updateFile])

  const handleOpenFile = useCallback(async () => {
    if (!projectId || !currentFile) return
    try {
      const path = await getFilePath(projectId, currentFile.file_name)
      await open(path)
    } catch (e) {
      console.error('Failed to open file:', e)
    }
  }, [projectId, currentFile, getFilePath])

  const confirmDeleteFile = useCallback((f: ProjectFile) => setDeleteFileTarget(f), [])
  const handleDeleteFile = useCallback(async () => {
    if (!deleteFileTarget) return
    await deleteFile(deleteFileTarget.id)
    setDeleteFileTarget(null)
  }, [deleteFileTarget, deleteFile])

  const selectFile = useCallback((f: ProjectFile) => {
    setCurrentFile(f)
    setCurrentLink(null)
    setIsNewLink(false)
  }, [setCurrentFile, setCurrentLink])

  const selectLink = useCallback((link: ExternalLink) => {
    setIsNewLink(false)
    setCurrentLink(link)
    setCurrentFile(null)
  }, [setCurrentLink, setCurrentFile])

  // --- Render helpers ---
  const isEmpty = (tab === 'links' && links.length === 0 && !linkLoading) || (tab === 'files' && files.length === 0 && !fileLoading)
  const hasSelection = (tab === 'links' && (currentLink || isNewLink)) || (tab === 'files' && currentFile)

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        {/* Left panel */}
        <div {...panel.panelProps}>
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => { setTab('links'); setCurrentFile(null) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
                tab === 'links' ? 'text-bindle-600 border-b-2 border-bindle-500' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <Link2 size={14} /> 链接
            </button>
            <button
              onClick={() => { setTab('files'); setCurrentLink(null); setIsNewLink(false) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
                tab === 'files' ? 'text-bindle-600 border-b-2 border-bindle-500' : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <FolderOpen size={14} /> 文件
            </button>
          </div>

          {/* Link list */}
          {tab === 'links' && (
            <>
              <div className="flex-1 overflow-auto py-1">
                {linkLoading ? (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
                ) : links.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无链接</p>
                ) : (
                  links.map((link) => (
                    <div
                      key={link.id}
                      className={cn(
                        'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
                        currentLink?.id === link.id && !isNewLink
                          ? 'bg-bindle-100 text-bindle-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      )}
                      onClick={() => selectLink(link)}
                    >
                      <Link2 size={14} className="shrink-0 text-gray-400" />
                      <span className="truncate flex-1">{link.title}</span>
                      {link.sync_status === 'synced' && link.link_type === 'file' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" title="已同步" />
                      )}
                      {link.sync_status === 'error' && link.link_type === 'file' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="同步失败" />
                      )}
                      <span className="text-[10px] text-gray-400 shrink-0">{LINK_TYPE_LABELS[link.link_type] || link.link_type}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                        <button onClick={(e) => { e.stopPropagation(); handleOpenUrl(link.url) }} className="p-0.5 rounded hover:bg-bindle-200" title="打开链接">
                          <ExternalLinkIcon size={13} className="text-gray-400 hover:text-bindle-600" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); confirmDelete(link) }} className="p-0.5 rounded hover:bg-red-100" title="删除">
                          <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-gray-100 shrink-0">
                <button onClick={handleNewLink} className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors">
                  <Plus size={14} /> 添加链接
                </button>
                <p className="text-xs text-gray-400 px-2.5 mt-1">{links.length} 个链接</p>
              </div>
            </>
          )}

          {/* File list */}
          {tab === 'files' && (
            <>
              <div
                className={cn(
                  'flex-1 overflow-auto py-1',
                  isDragOver && 'bg-bindle-50'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {fileLoading ? (
                  <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
                ) : files.length === 0 ? (
                  <div className={cn(
                    'flex flex-col items-center justify-center gap-3 py-8 text-center transition-colors',
                    isDragOver ? 'text-bindle-500' : 'text-gray-400'
                  )}>
                    <Upload size={32} strokeWidth={1} className={isDragOver ? 'text-bindle-400' : ''} />
                    <div>
                      <p className="text-sm">{isDragOver ? '松手以导入文件' : '拖入文件到此处'}</p>
                      <p className="text-xs mt-1">PDF / Word / PPT / 图片 / Markdown</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {isDragOver && (
                      <div className="flex items-center justify-center gap-2 py-3 text-sm text-bindle-500 bg-bindle-50 border-2 border-dashed border-bindle-300 mx-2 rounded-lg">
                        <Upload size={16} /> 松手以导入文件                      </div>
                    )}
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className={cn(
                          'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
                          currentFile?.id === f.id
                            ? 'bg-bindle-100 text-bindle-700'
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                        onClick={() => selectFile(f)}
                      >
                        <span className="shrink-0 text-xs">{FILE_TYPE_ICONS[f.file_type] || '馃摝'}</span>
                        <span className="truncate flex-1 text-xs">{f.original_name}</span>
                        <span className="text-[10px] text-gray-400 shrink-0">{format.fileSize(f.file_size)}</span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                          <button onClick={(e) => { e.stopPropagation(); confirmDeleteFile(f) }} className="p-0.5 rounded hover:bg-red-100" title="删除">
                            <Trash2 size={13} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              <div className="p-2 border-t border-gray-100 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
                >
                  <Plus size={14} /> 添加文件
                </button>
                <p className="text-xs text-gray-400 px-2.5 mt-1">{files.length} 个文件</p>
              </div>
            </>
          )}
        </div>

        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {isEmpty && !hasSelection ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                {tab === 'links' ? (
                  <>
                    <Link2 size={48} strokeWidth={1} className="mx-auto mb-3" />
                    <p className="text-lg">选择或添加一个外部链接</p>
                  </>
                ) : (
                  <>
                    <FolderOpen size={48} strokeWidth={1} className="mx-auto mb-3" />
                    <p className="text-lg">拖入文件或点击添加</p>
                    <p className="text-sm mt-1">支持 PDF / Word / PPT / 图片 / Markdown</p>
                  </>
                )}
              </div>
            </div>
          ) : tab === 'links' && (currentLink || isNewLink) ? (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-xl space-y-4">
                <h3 className="font-semibold text-gray-800">{isNewLink ? '添加外部链接' : '编辑链接'}</h3>
                <Input id="title" label="标题" placeholder="链接名称" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Input id="url" label="URL" placeholder="https://..." value={url}
                  onChange={(e) => { setUrl(e.target.value); setLinkType(detectLinkType(e.target.value)) }} />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">类型:</span>
                  <select value={linkType} onChange={(e) => setLinkType(e.target.value)}
                    className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400">
                    {Object.entries(LINK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <Textarea id="description" label="描述" placeholder="简要描述这个资源..." rows={3} value={linkDescription} onChange={(e) => setLinkDescription(e.target.value)} />

                {currentLink && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>同步状态:</span>
                    <span className={cn(
                      'font-medium',
                      currentLink.sync_status === 'synced' && 'text-green-600',
                      currentLink.sync_status === 'syncing' && 'text-amber-600',
                      currentLink.sync_status === 'error' && 'text-red-600',
                      currentLink.sync_status === 'idle' && 'text-gray-400',
                    )}>
                      {currentLink.sync_status === 'synced' ? '已同步' :
                       currentLink.sync_status === 'syncing' ? '同步中' :
                       currentLink.sync_status === 'error' ? '同步失败' :
                       '待同步'}
                    </span>
                    {currentLink.last_synced_at && (
                      <span>路 {format.relativeTime(currentLink.last_synced_at)}</span>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveLink} disabled={!title.trim() || !url.trim()}>
                    {isNewLink ? '添加' : '保存'}
                  </Button>
                  {currentLink && (
                    <>
                      <Button variant="outline" onClick={() => handleOpenUrl(currentLink.url)}>
                        <ExternalLinkIcon size={14} /> 打开链接
                      </Button>
                      {currentLink.link_type === 'file' && (
                        <Button variant="outline" onClick={() => syncLink(currentLink.id)}>
                          同步
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : tab === 'files' && currentFile ? (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-xl space-y-4">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <span>{FILE_TYPE_ICONS[currentFile.file_type] || '馃摝'}</span>
                  {currentFile.original_name}
                </h3>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3">
                  <div>
                    <span className="text-gray-400">类型</span>
                    <p className="text-gray-700">{FILE_TYPE_LABELS[currentFile.file_type] || currentFile.file_type}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">大小</span>
                    <p className="text-gray-700">{format.fileSize(currentFile.file_size)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">添加时间</span>
                    <p className="text-gray-700">{format.dateTime(currentFile.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">更新</span>
                    <p className="text-gray-700">{format.relativeTime(currentFile.updated_at)}</p>
                  </div>
                </div>

                {/* Image preview */}
                {currentFile.file_type === 'image' && filePreviewUrl && (
                  <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                    <img src={filePreviewUrl} alt={currentFile.original_name} className="max-w-full max-h-64 object-contain mx-auto" />
                  </div>
                )}

                {/* Extracted text preview */}
                {currentFile.extracted_text ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">提取的文本（AI 上下文）</label>
                    <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 max-h-48 overflow-auto whitespace-pre-wrap border border-gray-100">
                      {currentFile.extracted_text.slice(0, 2000)}
                      {currentFile.extracted_text.length > 2000 && (
                        <p className="text-gray-400 mt-1">...（共 {currentFile.extracted_text.length} 字符）</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-600 border border-amber-100">
                    <p>暂无可提取的文本。PDF / Word / PPT 文本提取将在后续版本支持。</p>
                  </div>
                )}

                {/* Description */}
                <Textarea id="fileDescription" label="描述" placeholder="简要描述这个文件..." rows={2} value={fileDescription} onChange={(e) => setFileDescription(e.target.value)} />

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveFile}>保存</Button>
                  <Button variant="outline" onClick={handleOpenFile}>
                    <ExternalLinkIcon size={14} /> 在系统中打开
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!currentFile) return
                      try {
                        const text = await reExtractText(currentFile.id)
                        if (!text) {
                          console.log('文本提取完成（无文本内容）')
                        }
                        await fetchFiles(projectId!)
                      } catch (err) {
                        console.error('重新提取失败:', err)
                      }
                    }}
                  >
                    重新提取
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Delete link dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="删除链接"
        description={`确定要删除「${deleteTarget?.title}」吗？`}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDeleteLink}>确认删除</Button>
        </div>
      </Dialog>

      {/* Delete file dialog */}
      <Dialog open={!!deleteFileTarget} onOpenChange={() => setDeleteFileTarget(null)} title="删除文件"
        description={`确定要删除「${deleteFileTarget?.original_name}」吗？文件将从磁盘上移除。`}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteFileTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDeleteFile}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}
