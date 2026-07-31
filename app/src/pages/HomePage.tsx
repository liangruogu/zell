import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectCard } from '@/components/project/ProjectCard'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { FolderOpen, Link2 } from 'lucide-react'
import { useState, useCallback, useRef } from 'react'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'
import { useKnowledgeStore } from '@/stores/knowledgeStore'

async function syncArticles(serverUrl: string, projectId: string, token: string) {
  try {
    const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/articles`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const articles = await res.json()
    const store = useKnowledgeStore.getState()
    for (const a of articles) {
      try {
        await store.createArticle(projectId, a.title || '', a.content || '', undefined, a.id, a.content_json)
      } catch { /* article might already exist */ }
    }
  } catch { /* server offline, skip */ }
}

export default function HomePage() {
  const { projects, loading, fetchProjects, createProject } = useProjectStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinServerUrl, setJoinServerUrl] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinStatus, setJoinStatus] = useState('')
  const joinPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchProjects()
    return () => clearPoll()
  }, [fetchProjects])

  const clearPoll = useCallback(() => {
    if (joinPollRef.current) {
      clearInterval(joinPollRef.current)
      joinPollRef.current = null
    }
  }, [])

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim() || !joinServerUrl.trim() || !joinDisplayName.trim()) return
    setJoining(true)
    setJoinStatus('连接中...')
    clearPoll()
    const clientId = localStorage.getItem('zell_join_client_id') || (() => { const id = crypto.randomUUID(); localStorage.setItem('zell_join_client_id', id); return id })()
    try {
      const res = await fetch(`${joinServerUrl}/api/v1/projects/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim(), client_id: clientId, display_name: joinDisplayName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '未知错误' }))
        alert('加入失败：' + (err.error || '邀请码无效'))
        setJoining(false)
        setJoinStatus('')
        return
      }
      const data = await res.json()
      if (data.status === 'rejected') {
        setJoinStatus('申请已被拒绝')
        setJoining(false)
        return
      }
      if (data.status === 'pending') {
        setJoinStatus('等待管理员审批...')
        joinPollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${joinServerUrl}/api/v1/projects/join`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: joinCode.trim(), client_id: clientId, display_name: joinDisplayName.trim() }),
            })
            if (!pollRes.ok) return
            const pollData = await pollRes.json()
            if (pollData.status === 'rejected') {
              clearPoll()
              setJoinStatus('申请已被拒绝')
              setJoining(false)
              return
            }
            if (pollData.status !== 'pending') {
              clearPoll()
              await createProject({
                id: pollData.project_id,
                name: `${pollData.project_name || pollData.project_id.slice(0, 8)} (协作)`,
                description: '',
                background: '',
                settings: JSON.stringify({
                  serverUrl: joinServerUrl,
                  token: pollData.token,
                  displayName: joinDisplayName.trim(),
                  role: 'member',
                }),
              })
              // Sync articles from server
              syncArticles(joinServerUrl, pollData.project_id, pollData.token)
              setShowJoin(false)
              setJoinCode('')
              setJoinServerUrl('')
              setJoinDisplayName('')
              setJoinStatus('')
            }
          } catch { /* server might be down, keep polling */ }
        }, 3000)
        return
      }
      // Already approved — create/sync local project with server's ID
      await createProject({
        id: data.project_id,
        name: `${data.project_name || data.project_id.slice(0, 8)} (协作)`,
        description: '',
        background: '',
        settings: JSON.stringify({
          serverUrl: joinServerUrl,
          token: data.token,
          displayName: joinDisplayName.trim(),
        }),
      })
      syncArticles(joinServerUrl, data.project_id, data.token)
      setShowJoin(false)
      setJoinCode('')
      setJoinServerUrl('')
      setJoinDisplayName('')
    } catch {
      alert('无法连接服务器')
    } finally {
      setJoining(false)
    }
  }, [joinCode, joinServerUrl, joinDisplayName, createProject])

  return (
    <AppShell>
      <Header
        title="我的项目"
        subtitle=""
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowJoin(true)}>
              <Link2 size={14} /> 加入项目
            </Button>
            <Button onClick={() => setShowCreate(true)} size="sm">
              新建项目
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            加载中...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <FolderOpen size={48} strokeWidth={1} />
            <p className="text-lg">还没有项目</p>
            <p className="text-sm">创建一个项目来开始整理你的资料和上下文</p>
            <Button onClick={() => setShowCreate(true)} className="mt-2">
              创建第一个项目
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} />

      <Dialog open={showJoin} onOpenChange={(open) => { setShowJoin(open); if (!open) { clearPoll(); setJoinStatus('') } }} title="加入项目" description="输入服务器地址和邀请码加入已有的协作项目">
        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">服务器地址</label>
            <Input
              value={joinServerUrl}
              onChange={(e) => setJoinServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:3000"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">邀请码</label>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="BNDL-xxx-xxxx"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">你的名称</label>
            <Input
              value={joinDisplayName}
              onChange={(e) => setJoinDisplayName(e.target.value)}
              placeholder="输入你的名字"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          <Button onClick={handleJoin} disabled={!joinCode.trim() || !joinServerUrl.trim() || !joinDisplayName.trim() || joining || !!joinStatus} className="w-full">
            {joining ? '加入中...' : joinStatus || '加入项目'}
          </Button>
          {joinStatus && (
            <p className="text-center text-sm text-zell-500">{joinStatus}</p>
          )}
        </div>
      </Dialog>
    </AppShell>
  )
}
