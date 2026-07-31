import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useProjectStore } from '@/stores/projectStore'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'
import { Copy, Trash2, Plus, Users } from 'lucide-react'

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
  const [copied, setCopied] = useState<string | null>(null)

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

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim()) return
    const clientId = crypto.randomUUID()
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim(), client_id: clientId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'pending') {
          setJoinStatus('pending')
          setJoinMessage(`申请已提交，等待管理员 "${data.project_id ? data.project_id.slice(0, 8) : '项目'}" 审批...`)
          return
        }
        const proj = useProjectStore.getState().currentProject
        if (proj) {
          const ps = parseProjectSettings(proj.settings)
          ps.token = data.token
          ps.displayName = data.display_name
          ps.role = 'owner'
          useProjectStore.getState().updateProject(proj.id, {
            name: proj.name,
            description: proj.description,
            background: proj.background,
            settings: stringifyProjectSettings(ps),
          })
        }
        setJoinVisible(false)
        setJoinCode('')
      } else {
        alert('邀请码无效或已过期')
      }
    } catch { alert('无法连接服务器') }
  }, [joinCode, serverUrl, projectId])

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
