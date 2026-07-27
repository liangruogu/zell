import { useState, useEffect, useCallback } from 'react'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useWhiteboardStore } from '@/stores/whiteboardStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'
import type { PublishSettings } from '@/types/project'
import { cn } from '@/lib/utils'
import { Globe, ChevronRight, BookOpen, Presentation, Palette, Film } from 'lucide-react'

function getDefaultPublish(articleIds: string[]): PublishSettings {
  return { enabled: false, wiki: [...articleIds], ppt: [], ui: [], mood: [] }
}

export function PublishSettings() {
  const { currentProject, updateProject } = useProjectStore()
  const { articles, fetchArticles } = useKnowledgeStore()
  const { whiteboards, fetchWhiteboards } = useWhiteboardStore()
  const { connected, serverUrl } = useSyncStore()

  const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
  const [publish, setPublish] = useState<PublishSettings>(ps.publish || getDefaultPublish([]))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ wiki: true })

  useEffect(() => {
    if (currentProject) {
      fetchArticles(currentProject.id)
      fetchWhiteboards(currentProject.id)
    }
  }, [currentProject, fetchArticles, fetchWhiteboards])

  useEffect(() => {
    if (currentProject) {
      const cur = parseProjectSettings(currentProject.settings).publish
      const def = getDefaultPublish(articles.map(a => a.id))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPublish(cur || def)
    }
  }, [currentProject, articles])

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    if (!currentProject) return
    const next: PublishSettings = { ...publish, enabled }
    if (enabled && next.wiki.length === 0) {
      next.wiki = articles.map(a => a.id)
    }
    setPublish(next)
    const cur = parseProjectSettings(currentProject.settings)
    cur.publish = next
    await updateProject(currentProject.id, {
      name: currentProject.name, description: currentProject.description,
      background: currentProject.background, icon: currentProject.icon,
      settings: stringifyProjectSettings(cur),
    })
  }, [currentProject, publish, articles, updateProject])

  const toggleItem = useCallback(async (category: 'wiki' | 'ppt' | 'ui' | 'mood', id: string) => {
    if (!currentProject) return
    const list = publish[category]
    const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id]
    const nextPublish = { ...publish, [category]: next }
    setPublish(nextPublish)
    const cur = parseProjectSettings(currentProject.settings)
    cur.publish = nextPublish
    await updateProject(currentProject.id, {
      name: currentProject.name, description: currentProject.description,
      background: currentProject.background, icon: currentProject.icon,
      settings: stringifyProjectSettings(cur),
    })
  }, [currentProject, publish, updateProject])

  useEffect(() => {
    if (!currentProject || !serverUrl || !connected) return
    const cur = parseProjectSettings(currentProject.settings)
    if (!cur.publish) return
    const sync = async () => {
      await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: JSON.stringify(cur.publish),
          updated_at: new Date().toISOString(),
        }),
      })
      for (const aid of cur.publish.wiki) {
        const article = useKnowledgeStore.getState().articles.find(a => a.id === aid)
        if (!article) continue
        await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish/articles/${aid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: article.id,
            title: article.title,
            content_html: article.content,
            updated_at: new Date().toISOString(),
          }),
        })
      }
      for (const type of ['ppt', 'ui', 'mood'] as const) {
        for (const wid of cur.publish[type]) {
          const wb = useWhiteboardStore.getState().whiteboards.find(w => w.id === wid)
          if (!wb) continue
          await fetch(`${serverUrl}/api/v1/projects/${currentProject.id}/publish/whiteboards/${wid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: wb.id,
              name: wb.name,
              wb_type: wb.wb_type,
              snapshot: wb.snapshot || '{}',
              updated_at: new Date().toISOString(),
            }),
          })
        }
      }
    }
    sync()
  }, [currentProject, serverUrl, connected, publish.enabled])

  const toggleExpand = (key: string) => setExpanded(e => ({ ...e, [key]: !e[key] }))

  if (!connected) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Globe size={32} strokeWidth={1} className="mx-auto mb-3" />
        <p className="text-sm">发布功能需连接协作服务器</p>
        <p className="text-xs mt-1">请在设置中配置并连接到 Zell 协作服务器</p>
      </div>
    )
  }

  const wbByType = (type: string) => whiteboards.filter(w => w.wb_type === type)

  const categories = [
    { key: 'wiki' as const, label: '知识库', icon: BookOpen, items: articles.map(a => ({ id: a.id, name: a.title })) },
    { key: 'ppt' as const, label: 'PPT', icon: Presentation, items: wbByType('ppt').map(w => ({ id: w.id, name: w.name })) },
    { key: 'ui' as const, label: 'UI', icon: Palette, items: wbByType('ui').map(w => ({ id: w.id, name: w.name })) },
    { key: 'mood' as const, label: 'Mood', icon: Film, items: wbByType('mood').map(w => ({ id: w.id, name: w.name })) },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">网站部署</h3>
          <p className="text-xs text-gray-400 mt-0.5">开启后将选中内容发布为可公开访问的网页</p>
        </div>
        <button
          onClick={() => toggleEnabled(!publish.enabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
            publish.enabled ? 'bg-zell-500' : 'bg-gray-200'
          )}
        >
          <span className={cn(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            publish.enabled ? 'translate-x-4' : 'translate-x-0'
          )} />
        </button>
      </div>

      {publish.enabled && (
        <div className="space-y-1">
          {categories.map(cat => (
            <div key={cat.key}>
              <button
                onClick={() => toggleExpand(cat.key)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 text-sm text-gray-700"
              >
                <ChevronRight size={14} className={cn('text-gray-400 transition-transform', expanded[cat.key] && 'rotate-90')} />
                <cat.icon size={15} className="text-gray-400" />
                <span>{cat.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{publish[cat.key].length}/{cat.items.length}</span>
              </button>
              {expanded[cat.key] && (
                <div className="ml-6 space-y-0.5">
                  {cat.items.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-1">暂无内容</p>
                  ) : (
                    cat.items.map(item => (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={publish[cat.key].includes(item.id)}
                          onChange={() => toggleItem(cat.key, item.id)}
                          className="rounded border-gray-300 text-zell-500 focus:ring-zell-400"
                        />
                        <span className="text-gray-600 truncate">{item.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
