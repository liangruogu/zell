import { useEffect, useRef, useState, useCallback } from 'react'
import { useKnowledgeStore } from '@/stores/knowledgeStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { parseProjectSettings, stringifyProjectSettings, applyProjectConfig } from '@/types/project'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '@/lib/logger'

interface UseServerSyncOptions {
    projectId: string | undefined
    isCollab: boolean
    deleteProject: (id: string) => Promise<void>
}

interface UseServerSyncReturn {
    serverOnline: boolean
    collabReady: boolean
    setCollabReady: (v: boolean) => void
}

function getSettings() {
    const cur = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}')
    return { serverUrl: cur.serverUrl, token: cur.token, serverKey: cur.serverKey }
}

export function useServerSync({ projectId, isCollab, deleteProject }: UseServerSyncOptions): UseServerSyncReturn {
    const [serverOnline, setServerOnline] = useState(true)
    const [collabReady, setCollabReady] = useState(!isCollab)
    const syncDoneRef = useRef(false)

  useEffect(() => {
    if (!projectId) return
    if (!isCollab) {
      setServerOnline(true)
      useSyncStore.getState().setReadOnly(false)
      return
    }

        let ws: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let stopped = false
        let projectSubscribed = false
        let syncing = false

        const syncArticlesFromServer = async () => {
            if (syncing) return
            syncing = true
            const { serverUrl, token, serverKey } = getSettings()
            if (!serverUrl || (!token && !serverKey)) { syncing = false; return }
            try {
                const headers: Record<string, string> = {}
                if (token) headers['Authorization'] = `Bearer ${token}`
                else if (serverKey) headers['X-Server-Key'] = serverKey

                const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/articles`, { headers })
                if (res.status === 410) { alert('项目已被管理员删除，即将返回首页'); deleteProject(projectId!); window.location.href = '/'; return }
                if (res.status === 403) {
                    try {
                        const body = await res.json()
                        alert(body.code === 'COLLAB_DISABLED' ? '协作已被管理员关闭，即将返回首页'
                            : body.code === 'MEMBER_REMOVED' ? '你已被移出项目，即将返回首页' : '访问被拒绝，即将返回首页')
                    } catch { alert('访问被拒绝，即将返回首页') }
                    const proj = useProjectStore.getState().currentProject
                    if (proj) {
                        const settings = parseProjectSettings(proj.settings)
                        settings.collabEnabled = false
                        useProjectStore.getState().updateProject(proj.id, {
                            name: proj.name, description: proj.description,
                            background: proj.background,
                            settings: stringifyProjectSettings(settings),
                        }).catch(() => {})
                    }
                    deleteProject(projectId!); window.location.href = '/'; return
                }
                if (!res.ok) { setServerOnline(false); useSyncStore.getState().setReadOnly(true); return }
                setServerOnline(true)
                useSyncStore.getState().setReadOnly(false)

                const serverArticles: any[] = await res.json()
                const store = useKnowledgeStore.getState()
                const localIds = new Set(store.articles.map(a => a.id))
                const serverIds = new Set<string>()

                for (const srv of serverArticles) {
                    serverIds.add(srv.id)
                    await invoke('create_knowledge_article', {
                        projectId,
                        title: srv.title || '',
                        content: srv.content || '',
                        contentJson: srv.content_json || '{}',
                        parentId: srv.parent_id || null,
                        id: srv.id,
                    })
                }

                for (const lid of localIds) {
                    if (!serverIds.has(lid)) {
                        try { await store.deleteArticle(lid) } catch (e) { logger.error('Failed to delete non-server article', e) }
                    }
                }

                await store.fetchArticles(projectId)

                const cur = useKnowledgeStore.getState().currentArticle
                if (cur && !serverArticles.some((a: any) => a.id === cur.id)) {
                    useKnowledgeStore.getState().setCurrentArticle(null)
                } else if (cur) {
                    const updated = useKnowledgeStore.getState().articles.find(a => a.id === cur.id)
                    if (updated) useKnowledgeStore.getState().setCurrentArticle(updated)
                }

                if (!syncDoneRef.current) { syncDoneRef.current = true; setCollabReady(true) }
            } catch (e) { logger.error('Failed to sync articles from server', e); setServerOnline(false) }
            finally { syncing = false }
        }

        const syncProjectInfoFromServer = async () => {
            const { serverUrl, token, serverKey } = getSettings()
            if (!serverUrl || (!token && !serverKey)) return
            try {
                const headers: Record<string, string> = {}
                if (token) headers['Authorization'] = `Bearer ${token}`
                else if (serverKey) headers['X-Server-Key'] = serverKey
                const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/info`, { headers })
                if (!res.ok) return
                const data = await res.json()
                if (!data?.name) return
                const proj = useProjectStore.getState().currentProject
                if (!proj) return
                let newSettings = proj.settings || '{}'
                if (data.config) {
                    try { newSettings = applyProjectConfig(newSettings, JSON.parse(data.config)) } catch (e) { logger.error('Failed to parse project config', e) }
                }
                if (newSettings === proj.settings && data.name === proj.name && (data.description || '') === (proj.description || '')) return
                useProjectStore.getState().updateProject(proj.id, {
                    name: data.name, description: data.description || '', background: proj.background || '', settings: newSettings,
                })
            } catch (e) { logger.error('Failed to sync project info from server', e) }
        }

    function connect() {
      if (stopped) return
      const { serverUrl, token } = getSettings()
      if (!serverUrl) return
            const wsBase = serverUrl.replace(/^http/, 'ws')
            const wsUrl = `${wsBase}/ws/${projectId}/__notifications__${token ? '?token=' + encodeURIComponent(token) : ''}`
            ws = new WebSocket(wsUrl)
            ws.onopen = () => {
                console.log('[sync] WS connected')
                setServerOnline(true)
                syncArticlesFromServer()
                if (token && serverUrl && projectId) {
                    useSyncStore.getState().pullNotifications(projectId, token, serverUrl).then(() => {
                        const notifs = useSyncStore.getState().notifications
                        if (notifs) {
                            for (const n of notifs) {
                                if (n.type === 'removed' || n.type === 'collab_disabled' || n.type === 'project_deleted') {
                                    const msg = n.type === 'project_deleted' ? '项目已被管理员删除' : n.type === 'collab_disabled' ? '协作已被管理员关闭' : '你已被移出项目'
                                    alert(msg + '，即将返回首页'); deleteProject(projectId!); window.location.href = '/'; return
                                }
                            }
                        }
                    })
                }
            }
            ws.onerror = () => { }
            ws.onclose = (e) => {
                console.log('[sync] WS closed, code=' + e.code + ', stopped=' + stopped)
                setServerOnline(false); useSyncStore.getState().setReadOnly(true)
                if (!stopped) reconnectTimer = setTimeout(connect, 3000)
            }
            ws.onmessage = async (event) => {
                try {
                    const msg = JSON.parse(event.data)
                    if (msg.type === 'project_deleted' || msg.type === 'collab_disabled' || msg.type === 'member_removed') {
                        alert(msg.type === 'project_deleted' ? '项目已被管理员删除，即将返回首页'
                            : msg.type === 'collab_disabled' ? '协作已被管理员关闭，即将返回首页' : '你已被管理员移出项目，即将返回首页')
                        deleteProject(projectId!); window.location.href = '/'; return
                    }
                    if (msg.type && msg.type.startsWith('article_')) {
                        if (msg.type === 'article_updated' && msg.data?.id && msg.data.id === useKnowledgeStore.getState().currentArticle?.id) return
                        syncArticlesFromServer()
                    }
                    if (msg.type === 'project_updated') {
                        const proj = useProjectStore.getState().currentProject
                        if (proj && msg.data) {
                            let newSettings = proj.settings || '{}'
                            if (msg.data.config) { try { newSettings = applyProjectConfig(newSettings, JSON.parse(msg.data.config)) } catch (e) { logger.error('Failed to parse project_updated config', e) } }
                            useProjectStore.getState().setCurrentProject({ ...proj, name: msg.data.name || proj.name, description: msg.data.description || proj.description, settings: newSettings })
                            useProjectStore.getState().updateProject(proj.id, { name: msg.data.name || proj.name, description: msg.data.description || '', background: proj.background || '', settings: newSettings })
                        }
                    }
                } catch (e) { /* not JSON */ }
            }
        }

    function trySetup() {
      const { serverUrl } = getSettings()
      if (!serverUrl) return
            projectSubscribed = true
            syncProjectInfoFromServer()
            syncArticlesFromServer()
            connect()
        }

        trySetup()

        let unsub: (() => void) | null = null
        if (!projectSubscribed) {
            unsub = useProjectStore.subscribe(() => {
                if (projectSubscribed || stopped) return
                trySetup()
                if (projectSubscribed && unsub) { unsub(); unsub = null }
            })
        }

        return () => {
            stopped = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            if (ws) ws.close()
            if (unsub) unsub()
        }
    }, [projectId, isCollab])

    return { serverOnline, collabReady, setCollabReady }
}
