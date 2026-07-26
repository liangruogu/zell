import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Textarea'
import { format } from '@/lib/format'
import { Trash2, Edit3, Users, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmojiPicker } from '@/components/project/EmojiPicker'
import { PROJECT_STATUS, parseProjectSettings, stringifyProjectSettings, type ProjectStatus } from '@/types/project'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentProject, fetchProject, updateProject, deleteProject, setCurrentProject } = useProjectStore()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editBg, setEditBg] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectStatus>('seedling')

  // Collab state
  const { connected, serverUrl } = useSyncStore()
  const [collabEnabled, setCollabEnabled] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [copied, setCopied] = useState(false)
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    if (id) fetchProject(id)
    return () => setCurrentProject(null)
  }, [id, fetchProject, setCurrentProject])

  useEffect(() => {
    if (currentProject) {
      const ps = parseProjectSettings(currentProject.settings)
      setEditName(currentProject.name)
      setEditDesc(currentProject.description)
      setEditBg(currentProject.background)
      setEditIcon(currentProject.icon)
      setEditStatus(ps.status || 'seedling')
    }
  }, [currentProject, showEdit])

  // Fetch collab status
  const fetchCollabStatus = useCallback(async () => {
    if (!connected || !serverUrl || !id) return
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${id}/invite`)
      if (res.ok) {
        const data = await res.json()
        setCollabEnabled(true)
        setInviteCode(data.invite_code)
      } else {
        setCollabEnabled(false)
        setInviteCode('')
      }
    } catch {
      setCollabEnabled(false)
    }
  }, [connected, serverUrl, id])

  useEffect(() => { fetchCollabStatus() }, [fetchCollabStatus])

  const handleToggleCollab = async (enable: boolean) => {
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${id}/collab`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      })
      if (res.ok) {
        const data = await res.json()
        setCollabEnabled(enable)
        setInviteCode(data.invite_code || '')
        if (enable) {
          startRotateTimer()
        } else {
          stopRotateTimer()
        }
      }
    } catch { /* */ }
  }

  const rotateInvite = useCallback(async () => {
    if (!collabEnabled) return
    try {
      const res = await fetch(`${serverUrl}/api/v1/projects/${id}/invite/rotate`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setInviteCode(data.invite_code)
      }
    } catch { /* */ }
  }, [collabEnabled, serverUrl, id])

  const startRotateTimer = () => {
    stopRotateTimer()
    rotateTimerRef.current = setInterval(rotateInvite, 30 * 60 * 1000)
  }

  const stopRotateTimer = () => {
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current)
      rotateTimerRef.current = undefined
    }
  }

  useEffect(() => {
    if (collabEnabled) startRotateTimer()
    return () => stopRotateTimer()
  }, [collabEnabled])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (!currentProject) return
    await deleteProject(currentProject.id)
    setShowDelete(false)
    navigate('/')
  }

  const handleSave = async () => {
    if (!currentProject) return
    const oldSettings = parseProjectSettings(currentProject.settings)
    oldSettings.status = editStatus
    await updateProject(currentProject.id, {
      name: editName, description: editDesc, background: editBg, icon: editIcon,
      settings: stringifyProjectSettings(oldSettings),
    })
    setShowEdit(false)
  }

  if (!currentProject) {
    return (
      <AppShell>
        <Header title="加载中..." backTo="/" />
        <div className="flex-1 flex items-center justify-center text-gray-400">加载中...</div>
      </AppShell>
    )
  }

  const ps = parseProjectSettings(currentProject.settings)
  const statusInfo = PROJECT_STATUS.find((s) => s.value === (ps.status || 'seedling'))

  return (
    <AppShell>
      <Header
        title="项目概览"
        backTo="/"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Edit3 size={14} /> 编辑
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowDelete(true)}>
              <Trash2 size={14} className="text-red-500" />
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Card className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3">项目信息</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">名称</span>
              <p className="text-gray-700 mt-1 font-medium">{currentProject.name}</p>
            </div>
            <div>
              <span className="text-gray-400">图标</span>
              <p className="text-2xl mt-1">{currentProject.icon || '📁'}</p>
            </div>
            <div>
              <span className="text-gray-400">状态</span>
              <p className="mt-1">
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', statusInfo?.color)}>
                  {statusInfo?.label}
                </span>
              </p>
            </div>
            <div>
              <span className="text-gray-400">描述</span>
              <p className="text-gray-700 mt-1">{currentProject.description || '无'}</p>
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-400">创建时间</span>
                <p className="text-gray-700 mt-1">{format.dateTime(currentProject.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-400">最后更新</span>
                <p className="text-gray-700 mt-1">{format.dateTime(currentProject.updated_at)}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3">项目背景</h3>
          {currentProject.background ? (
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{currentProject.background}</p>
          ) : (
            <p className="text-sm text-gray-400 italic">暂无背景信息，点击「编辑」添加</p>
          )}
        </Card>

        {/* Team Collaboration */}
        {connected && (
          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Users size={18} /> 团队协作
              {collabEnabled && (
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-medium">已开启</span>
              )}
            </h3>

            {collabEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <code className="text-sm bg-gray-100 px-3 py-1.5 rounded border border-gray-200 font-mono text-gray-700">
                    {inviteCode}
                  </code>
                  <Button size="sm" variant="outline" onClick={handleCopyCode}>
                    <Copy size={14} className="mr-1" />
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
                <p className="text-xs text-gray-400">每 30 分钟自动更新，已连接的用户不受影响</p>
                <Button size="sm" variant="destructive" onClick={() => handleToggleCollab(false)}>
                  关闭协作
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-400">开启后将自动生成邀请码，其他人可凭码加入。</p>
                <Button size="sm" onClick={() => handleToggleCollab(true)}>
                  开启团队协作
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit} title="编辑项目">
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">图标 (Emoji)</label>
            <EmojiPicker value={editIcon} onChange={setEditIcon} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">项目状态</label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_STATUS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setEditStatus(s.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    editStatus === s.value ? s.color + ' ring-1 ring-offset-1' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">项目名称 *</label>
            <input className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400"
              value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">项目描述</label>
            <Textarea rows={3} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">项目背景</label>
            <Textarea rows={5} value={editBg} onChange={(e) => setEditBg(e.target.value)}
              placeholder="详细描述项目背景信息，将作为 AI 上下文自动注入" />
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={!editName.trim()}>保存修改</Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={showDelete} onOpenChange={setShowDelete} title="删除项目"
        description="确定要删除这个项目吗？此操作不可撤销，所有关联的数据都将被软删除。">
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setShowDelete(false)}>取消</Button>
          <Button variant="destructive" onClick={handleDelete}>确认删除</Button>
        </div>
      </Dialog>
    </AppShell>
  )
}
