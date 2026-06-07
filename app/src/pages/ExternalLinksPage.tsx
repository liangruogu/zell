import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Dialog } from '@/components/ui/Dialog'
import { useLinkStore } from '@/stores/linkStore'
import { useProjectStore } from '@/stores/projectStore'
import { useResizablePanel } from '@/components/layout/ResizablePanel'
import type { ExternalLink } from '@/types/share'
import { LINK_TYPE_LABELS } from '@/lib/constants'
import { open } from '@tauri-apps/plugin-shell'
import { Plus, Link2, Trash2, ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

function detectLinkType(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('github.com')) return 'github'
  if (u.includes('figma.com')) return 'figma'
  if (u.includes('canva.com')) return 'canva'
  if (u.includes('notion.so')) return 'notion'
  return 'web'
}

export default function ExternalLinksPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const { fetchProject } = useProjectStore()
  const { links, currentLink, loading, fetchLinks, createLink, updateLink, deleteLink, setCurrentLink   } = useLinkStore()
  const panel = useResizablePanel()

  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [linkType, setLinkType] = useState('web')
  const [aiSkill, setAiSkill] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExternalLink | null>(null)

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId)
      fetchLinks(projectId)
    }
  }, [projectId, fetchProject, fetchLinks])

  // Keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); panel.toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel.toggle])

  // When selecting a link, populate form
  useEffect(() => {
    if (currentLink && !isNew) {
      setTitle(currentLink.title)
      setUrl(currentLink.url)
      setDescription(currentLink.description)
      setLinkType(currentLink.link_type)
      setAiSkill(currentLink.ai_skill)
    }
  }, [currentLink])

  const handleNew = useCallback(() => {
    setCurrentLink(null)
    setIsNew(true)
    setTitle('')
    setUrl('')
    setDescription('')
    setLinkType('web')
    setAiSkill('')
  }, [setCurrentLink])

  const handleSave = useCallback(async () => {
    if (!projectId || !title.trim() || !url.trim()) return
    const detected = detectLinkType(url)
    const type = linkType === 'web' ? detected : linkType

    if (isNew) {
      const link = await createLink(projectId, { title: title.trim(), url: url.trim(), description, linkType: type, aiSkill })
      setCurrentLink(link)
      setIsNew(false)
    } else if (currentLink) {
      await updateLink(currentLink.id, { title: title.trim(), url: url.trim(), description, linkType: type, aiSkill })
    }
  }, [projectId, title, url, description, linkType, aiSkill, isNew, currentLink, createLink, updateLink, setCurrentLink])

  const handleOpenUrl = useCallback(async (linkUrl: string) => {
    try { await open(linkUrl) } catch { window.open(linkUrl, '_blank') }
  }, [])

  const confirmDelete = useCallback((link: ExternalLink) => setDeleteTarget(link), [])
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteLink(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteLink])

  return (
    <AppShell>
      <div className="flex-1 flex min-h-0">
        {/* Left: link list */}
        <div {...panel.panelProps}>
          <div className="flex-1 overflow-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">加载中...</p>
            ) : links.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">暂无链接</p>
            ) : (
              links.map((link) => (
                <div
                  key={link.id}
                  className={cn(
                    'group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-sm transition-colors select-none',
                    currentLink?.id === link.id && !isNew
                      ? 'bg-bindle-100 text-bindle-700'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                  onClick={() => { setIsNew(false); setCurrentLink(link) }}
                >
                  <Link2 size={14} className="shrink-0 text-gray-400" />
                  <span className="truncate flex-1">{link.title}</span>
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
            <button
              onClick={handleNew}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded transition-colors"
            >
              <Plus size={14} /> 添加链接
            </button>
            <p className="text-xs text-gray-400 px-2.5 mt-1">{links.length} 个链接</p>
          </div>
        </div>

        {panel.handleProps && <div {...panel.handleProps} />}

        {/* Right: form */}
        <div className="flex-1 flex flex-col min-w-0">
          {currentLink || isNew ? (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-xl space-y-4">
                <h3 className="font-semibold text-gray-800">{isNew ? '添加外部链接' : '编辑链接'}</h3>
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
                <Textarea id="description" label="描述" placeholder="简要描述这个资源..." rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                <Textarea id="aiSkill" label="AI Skill" placeholder="给 AI 的附加说明，例如：这个 PPT 包含了项目的设计方案" rows={3} value={aiSkill} onChange={(e) => setAiSkill(e.target.value)} />

                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave} disabled={!title.trim() || !url.trim()}>
                    {isNew ? '添加' : '保存'}
                  </Button>
                  {currentLink && (
                    <Button variant="outline" onClick={() => handleOpenUrl(currentLink.url)}>
                      <ExternalLinkIcon size={14} /> 打开链接
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Link2 size={48} strokeWidth={1} className="mx-auto mb-3" />
                <p className="text-lg">选择或添加一个外部链接</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title="删除链接"
        description={`确定要删除「${deleteTarget?.title}」吗？`}>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}
