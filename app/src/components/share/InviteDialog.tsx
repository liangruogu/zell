import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useProjectStore } from '@/stores/projectStore'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'
import { Copy, Users } from 'lucide-react'

function getJoinClientId(): string {
  const key = 'zell_join_client_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
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
  const [joinCode, setJoinCode] = useState('')
  const [joinVisible, setJoinVisible] = useState(false)
  const [joinDisplayName, setJoinDisplayName] = useState('')
  const [joinNameError, setJoinNameError] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinMessage, setJoinMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const handleJoin = useCallback(async () => {
    if (!joinCode.trim() || !joinDisplayName.trim()) return
    setJoining(true)
    setJoinNameError('')
    setJoinMessage('')
    const clientId = getJoinClientId()
    if (!serverUrl) { setJoinMessage('请先配置服务器地址'); setJoining(false); return }
    if (!/^https?:\/\//i.test(serverUrl)) { setJoinMessage('服务器地址格式错误'); setJoining(false); return }
    try {
      try { await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) }) }
      catch { setJoinMessage('无法连接到服务器'); setJoining(false); return }
      const res = await fetch(`${serverUrl}/api/v1/projects/${projectId || '0'}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.trim(), client_id: clientId, display_name: joinDisplayName.trim() }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'approved') {
          // Ensure project is loaded
          let proj = useProjectStore.getState().currentProject
          if (!proj) {
            await useProjectStore.getState().fetchProject(projectId!)
            proj = useProjectStore.getState().currentProject
          }
          if (proj) {
            const ps = parseProjectSettings(proj.settings)
            ps.token = data.token
            ps.displayName = data.display_name
            ps.serverUrl = serverUrl
            useProjectStore.getState().setCurrentProject({ ...proj, settings: stringifyProjectSettings(ps) })
            useProjectStore.getState().updateProject(proj.id, {
              name: proj.name,
              description: proj.description,
              background: proj.background,
              settings: stringifyProjectSettings(ps),
            })
          }
          setJoinMessage('已加入项目')
          setTimeout(() => {
            setJoinVisible(false)
            setJoinCode('')
            setJoinDisplayName('')
            setJoinMessage('')
          }, 1500)
        } else if (data.status === 'already_member') {
          setJoinMessage('你已是该项目成员，无需重复加入')
        }
      } else if (res.status === 409) {
        setJoinNameError('此名称已被占用，请换一个')
      } else if (res.status === 401) {
        setJoinMessage('邀请码无效或已过期')
      } else {
        setJoinMessage('加入失败')
      }
    } catch { setJoinMessage('无法连接服务器') }
    setJoining(false)
  }, [joinCode, joinDisplayName, serverUrl, projectId])

  const handleCopy = useCallback(() => {
    const inviteCode = parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}').inviteCode
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  const inviteCode = currentProject ? parseProjectSettings(currentProject.settings).inviteCode : ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="团队协作" description="分享邀请码，团队成员可直接加入">
      <div className="space-y-4 mt-2">
        {inviteCode && (
          <div className="p-3 bg-zell-50 rounded-lg border border-zell-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">邀请码</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-white px-3 py-1.5 rounded border border-gray-200 font-mono text-gray-700 flex-1">
                {inviteCode}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy size={14} className="mr-1" />
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          </div>
        )}

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
              {joinMessage && (
                <p className={joinMessage.includes('失败') || joinMessage.includes('无效') || joinNameError ? 'text-xs text-red-500' : 'text-xs text-green-500'}>
                  {joinMessage}
                </p>
              )}
              <Button size="sm" onClick={handleJoin} disabled={joining || !joinCode.trim() || !joinDisplayName.trim()}>
                加入
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
