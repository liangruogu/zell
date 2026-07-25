import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useSyncStore } from '@/stores/syncStore'
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
  const { serverUrl, token } = useSyncStore()
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinVisible, setJoinVisible] = useState(false)
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
        useSyncStore.getState().setToken(data.token)
        useSyncStore.getState().setDisplayName(data.display_name)
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
        <div className="p-3 bg-bindle-50 rounded-lg border border-bindle-100">
          <button
            onClick={() => setJoinVisible(!joinVisible)}
            className="flex items-center gap-2 text-sm font-medium text-bindle-700"
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
