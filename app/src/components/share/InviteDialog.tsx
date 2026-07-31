import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useProjectStore } from '@/stores/projectStore'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'
import { Copy, Trash2, Plus, Users } from 'lucide-react'

function getJoinClientId(): string {
  const key = 'zell_join_client_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function getJoinState(inviteCode: string): { pending: boolean; projectId: string } | null {
  const key = `zell_join_${inviteCode}`
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function setJoinState(inviteCode: string, state: { pending: boolean; projectId: string }) {
  localStorage.setItem(`zell_join_${inviteCode}`, JSON.stringify(state))
}

function clearJoinState(inviteCode: string) {
  localStorage.removeItem(`zell_join_${inviteCode}`)
}

interface InviteCode {
  id: string
  project_id: string
  code: string
  display_name: string
  role: string
  created_at: string
  expires_at: string | null
}

interface InviteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

export function InviteDialog({ open, onOpenChange, projectId }: InviteDialogProps) {
  const currentProject = useProjectStore((s) => s.currentProject)
  const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
  const serverUrl = ps.serverUrl || ''
  const token = ps.token || ''
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinVisible, setJoinVisible] = useState(false)
  const [joinStatus, setJoinStatus] = useState<'idle' | 'pending' | 'approved'>('idle')
  const [joinMessage, setJoinMessage] = useState('')
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joinNameError, setJoinNameError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check for existing pending join state on dialog open
  useEffect(() => {
    if (!open) {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      return
    }
    const saved = getJoinState(joinCode)
    if (saved?.pending) {
      setJoinStatus('pending')
      setJoinMessage(`申请已提交，等待管理员审批...`)
      startPolling(saved.projectId)
    }
  }, [open])

  const fetchInvites = useCallback(async () => {
    if (!serverUrl || !token || !projectId) return
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/invites`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setInvites(await res.json())
      }
    } catch { /* server not reachable */ }
  }, [serverUrl, token, projectId])

  useEffect(() => {
    if (open) fetchInvites()
  }, [open, fetchInvites])

  const handleCreate = useCallback(async () => {
    if (!displayName.trim()) return
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: displayName.trim(), role: 'editor' }),
      })
      if (res.ok) {
        setDisplayName('')
        setShowCreate(false)
        fetchInvites()
      }
    } catch { /* */ }
  }, [displayName, serverUrl, token, projectId, fetchInvites])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`${serverUrl}/api/v1/projects/${projectId}/invites/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchInvites()
    } catch { /* */ }
  }, [serverUrl, token, projectId, fetchInvites])

  const startPolling = (pid: string) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    pollTimerRef.current = setInterval(async () => {
      const clientId = getJoinClientId()
      try {
        const res = await fetch(`${serverUrl}/api/v1/projects/${pid}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: joinCode.trim(), client_id: clientId, display_name: joinDisplayName.trim(), poll: true }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'rejected') {
          if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
          clearJoinState(joinCode)
          setJoinStatus('idle')
          setJoinMessage('申请已被拒绝')
          return
        }
        if (data.status !== 'pending') {
          if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
          clearJoinState(joinCode)
          setJoinStatus('approved')
          const proj = useProjectStore.getState().currentProject
          if (proj && data.token) {
            const ps = parseProjectSettings(proj.settings)
            ps.token = data.token
            ps.displayName = data.display_name
            ps.role = 'member'
            useProjectStore.getState().updateProject(proj.id, {
              name: proj.name,
              description: proj.description,
              background: proj.background,
              settings: stringifyProjectSettings(ps),
            })
          }
          setJoinVisible(false)
          setJoinCode('')
        }
      } catch { /* keep polling */ }
    }, 3000)
  }

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim()) return
    const clientId = getJoinClientId()
    const name = joinDisplayName.trim()
    if (!name) {
      setJoinNameError('请输入你的显示名称')
      return
    }
    setJoinNameError('')
    try {
      const pid = projectId || '0'
      const res = await fetch(`${serverUrl}/api/v1/projects/${pid}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim(), client_id: clientId, display_name: name }),
      })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'pending') {
            setJoinStatus('pending')
            setJoinMessage('申请已提交，等待管理员审批...')
            setJoinState(joinCode, { pending: true, projectId: data.project_id })
            startPolling(data.project_id)
            return
          }
        if (data.status === 'rejected' || data.status === 'expired') {
            setJoinStatus('idle')
            setJoinMessage('申请已被拒绝')
            return
          }
        clearJoinState(joinCode)
        const proj = useProjectStore.getState().currentProject
        if (proj && data.token) {
          const ps = parseProjectSettings(proj.settings)
          ps.token = data.token
          ps.displayName = data.display_name
          ps.role = 'member'
          useProjectStore.getState().updateProject(proj.id, {
            name: proj.name,
            description: proj.description,
            background: proj.background,
            settings: stringifyProjectSettings(ps),
          })
        }
        setJoinVisible(false)
        setJoinCode('')
      } else if (res.status === 409) {
        const err = await res.json().catch(() => ({ error: '' }))
        setJoinNameError(err.error || '此名称已被占用，请换一个')
      } else {
        alert('邀请码无效或已过期')
      }
    } catch { alert('无法连接服务器') }
  }, [joinCode, joinDisplayName, serverUrl, projectId])

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="团队协作" description="管理邀请码，邀请团队成员加入协作">
      <div className="space-y-4 mt-2">
        {/* Join section */}
        <div className="p-3 bg-zell-50 rounded-lg border border-zell-100">
          <button
            onClick={() => setJoinVisible(!joinVisible)}
            className="flex items-center gap-2 text-sm font-medium text-zell-700"
          >
            <Users size={16} />
            加入已有项目
          </button>
          {joinVisible && (
            <div className="mt-2 space-y-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="输入邀请码 BNDL-xxxx..."
              />
              <Input
                value={joinDisplayName}
                onChange={(e) => { setJoinDisplayName(e.target.value); setJoinNameError('') }}
                placeholder="你的显示名称"
              />
              {joinNameError && (
                <p className="text-xs text-red-500">{joinNameError}</p>
              )}
              <Button size="sm" onClick={handleJoin} disabled={!joinCode.trim()}>
                加入
              </Button>
            </div>
          )}
          {joinStatus === 'pending' && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-700">
              {joinMessage}
            </div>
          )}
        </div>

        {/* Invite list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">邀请码</h4>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}>
              <Plus size={14} className="mr-1" />生成
            </Button>
          </div>

          {showCreate && (
            <div className="flex gap-2 mb-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="协作者名称"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Button size="sm" onClick={handleCreate} disabled={!displayName.trim()}>
                确定
              </Button>
            </div>
          )}

          {invites.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">暂无邀请码</p>
          ) : (
            <div className="space-y-1">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between py-2 px-2 rounded bg-gray-50 text-sm">
                  <div>
                    <span className="text-gray-700">{inv.display_name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      ({inv.role === 'editor' ? '编辑' : '查看'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(inv.code)}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      title="复制邀请码"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
                      title="撤销"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {copied && (
            <p className="text-xs text-green-600 mt-1">已复制邀请码 "{copied}"</p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
