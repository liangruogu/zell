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
import { Trash2, Edit3, Users, Copy, X, Check, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PublishSettings } from '@/components/project/PublishSettings'
import { parseProjectSettings, stringifyProjectSettings } from '@/types/project'

export default function ProjectPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { currentProject, fetchProject, updateProject, deleteProject, setCurrentProject } = useProjectStore()
    const [showEdit, setShowEdit] = useState(false)
    const [showDelete, setShowDelete] = useState(false)
    const [showExit, setShowExit] = useState(false)
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editBg, setEditBg] = useState('')

    // Server management
    const { serverUrl, setServerUrl, setConnected, connected } = useSyncStore()
    const [settingsTab, setSettingsTab] = useState<'overview' | 'publish'>('overview')

    const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
    const isMember = ps.role === 'member'
    const [sharingEnabled, setSharingEnabled] = useState(false)
    const [serverInputUrl, setServerInputUrl] = useState('http://localhost:3000')
    const [serverKey, setServerKey] = useState('')
    const [connecting, setConnecting] = useState(false)
    const [connectFailed, setConnectFailed] = useState(false)
    const [inviteCode, setInviteCode] = useState('')
    const [copied, setCopied] = useState(false)
    const [members, setMembers] = useState<{ client_id: string; display_name: string; online: boolean }[]>([])
    const [pending, setPending] = useState<{ client_id: string; display_name: string; created_at: string }[]>([])
    const [serverOnline, setServerOnline] = useState(false)
    const wasOnlineRef = useRef<boolean | null>(null)
    const [showDisconnected, setShowDisconnected] = useState(false)
    const [serverToast, setServerToast] = useState<string | null>(null)

    // Init from project settings
    useEffect(() => {
        if (currentProject) {
            const ps = parseProjectSettings(currentProject.settings)
            if (ps.serverUrl) setServerInputUrl(ps.serverUrl)
        }
    }, [currentProject])

    useEffect(() => {
        if (id) {
            fetchProject(id).then(() => {
                // Restore collab state after project loads
                const proj = useProjectStore.getState().currentProject
                if (!proj) return
                const ps = parseProjectSettings(proj.settings)
                if (ps.collabEnabled && ps.serverKey) {
                    setSharingEnabled(true)
                    setServerKey(ps.serverKey)
                    setServerUrl(ps.serverUrl || '')
                    setConnected(true)
                }
            })
        }
        return () => setCurrentProject(null)
    }, [id, fetchProject, setCurrentProject])

    useEffect(() => {
        if (currentProject) {
            setEditName(currentProject.name)
            setEditDesc(currentProject.description)
            setEditBg(currentProject.background)
        }
    }, [currentProject, showEdit])

    // Fetch collab data and health check
    const fetchCollabData = useCallback(async () => {
        if (!sharingEnabled || !serverUrl || !id || !serverKey) return
        try {
            // Health check first — always run, don't gate on connected (deadlock)
            const healthRes = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) })
            if (!healthRes.ok) throw new Error('unhealthy')
        } catch {
            setServerOnline(false)
            setConnected(false)
            useSyncStore.getState().setReadOnly(true)
            if (wasOnlineRef.current === true) {
                setServerToast('服务器连接已断开，编辑已锁定')
            }
            wasOnlineRef.current = false
            return
        }
        // Server is online
        const wasPrev = wasOnlineRef.current
        wasOnlineRef.current = true
        setServerOnline(true)
        setConnected(true)
        setShowDisconnected(false)
        useSyncStore.getState().setReadOnly(false)
        if (wasPrev === false) setServerToast('服务器已恢复连接')

        // Fetch collab data
        const h = { 'X-Server-Key': serverKey }
        const jwtH = { 'Authorization': `Bearer ${parseProjectSettings(useProjectStore.getState().currentProject?.settings || '{}').token || ''}` }
        try {
            const [invRes, memRes, penRes] = await Promise.all([
                fetch(`${serverUrl}/api/v1/projects/${id}/invite-code`, { headers: jwtH, signal: AbortSignal.timeout(3000) }),
                fetch(`${serverUrl}/api/v1/projects/${id}/members`, { headers: h, signal: AbortSignal.timeout(3000) }),
                fetch(`${serverUrl}/api/v1/projects/${id}/pending`, { headers: h, signal: AbortSignal.timeout(3000) }),
            ])
            if (invRes.ok) setInviteCode((await invRes.json()).invite_code || '')
            if (memRes.ok) setMembers((await memRes.json()) || [])
            if (penRes.ok) setPending((await penRes.json()) || [])
            useSyncStore.getState().setReadOnly(false)
        } catch { /* collab API might fail, but health passed */ }
    }, [sharingEnabled, serverUrl, id, serverKey, isMember, navigate])

    useEffect(() => { fetchCollabData(); const t = setInterval(fetchCollabData, 5000); return () => clearInterval(t) }, [fetchCollabData])

    // Toast auto-clear
    useEffect(() => {
        if (!serverToast) return
        const t = setTimeout(() => setServerToast(null), 3000)
        return () => clearTimeout(t)
    }, [serverToast])

    const handleToggleSharing = useCallback(async (enable: boolean) => {
        const key = serverKey.trim()
        if (enable) {
            const url = serverInputUrl.trim()
            if (!url || !id || !currentProject || !key) return
            setConnecting(true)
            setConnectFailed(false)
            try {
                await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
            } catch { alert('无法连接到服务器'); setConnecting(false); setSharingEnabled(false); setConnectFailed(true); return }

            const ownerToken = crypto.randomUUID()
            const res = await fetch(`${url}/api/v1/projects/${id}/collab`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Server-Key': key },
                body: JSON.stringify({ enabled: true, owner_token: ownerToken, name: currentProject.name }),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: '未知错误' }))
                alert('开启共享失败：' + (err.error || '服务器拒绝连接，请检查密钥'))
                setConnecting(false); setSharingEnabled(false); setConnectFailed(true); return
            }

            const collabData = await res.json()
            setServerUrl(url)
            setConnected(true)
            setConnecting(false)
            setConnectFailed(false)

            const ps = parseProjectSettings(currentProject.settings)
            ps.serverUrl = url
            ps.serverKey = key
            ps.token = collabData.token || ownerToken
            ps.collabEnabled = true
            await updateProject(currentProject.id, {
                name: currentProject.name, description: currentProject.description,
                background: currentProject.background,
                settings: stringifyProjectSettings(ps),
            })
            fetchCollabData()
        } else {
            if (serverUrl && id) {
                await fetch(`${serverUrl}/api/v1/projects/${id}/collab`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Server-Key': key },
                    body: JSON.stringify({ enabled: false }),
                }).catch(() => { })
            }
            setConnected(false)
            setMembers([])
            setPending([])
            setInviteCode('')
            setServerOnline(false)
            useSyncStore.getState().setReadOnly(false)
            const ps = parseProjectSettings(currentProject!.settings)
            ps.collabEnabled = false
            ps.token = undefined
            await updateProject(currentProject!.id, {
                name: currentProject!.name, description: currentProject!.description,
                background: currentProject!.background,
                settings: stringifyProjectSettings(ps),
            })
        }
    }, [serverInputUrl, id, currentProject, serverUrl, serverKey, setServerUrl, setConnected, updateProject, fetchCollabData])

    const handleApprove = useCallback(async (clientId: string) => {
        if (!serverUrl || !id) return
        await fetch(`${serverUrl}/api/v1/projects/${id}/pending/${clientId}/approve`, {
            method: 'POST', headers: { 'X-Server-Key': serverKey },
        })
        fetchCollabData()
    }, [serverUrl, id, serverKey, fetchCollabData])

    const handleReject = useCallback(async (clientId: string) => {
        if (!serverUrl || !id) return
        await fetch(`${serverUrl}/api/v1/projects/${id}/pending/${clientId}/reject`, {
            method: 'POST', headers: { 'X-Server-Key': serverKey },
        })
        fetchCollabData()
    }, [serverUrl, id, serverKey, fetchCollabData])

    const handleKick = useCallback(async (clientId: string) => {
        if (!serverUrl || !id) return
        await fetch(`${serverUrl}/api/v1/projects/${id}/members/${clientId}`, {
            method: 'DELETE', headers: { 'X-Server-Key': serverKey },
        })
        fetchCollabData()
    }, [serverUrl, id, serverKey, fetchCollabData])

    const handleCopyCode = () => {
        navigator.clipboard.writeText(inviteCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDelete = async () => {
        if (!currentProject) return
        // Notify server so members get kicked
        const ps = parseProjectSettings(currentProject.settings)
        if (ps.serverUrl && ps.serverKey) {
            fetch(`${ps.serverUrl}/api/v1/projects/${currentProject.id}/collab`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Server-Key': ps.serverKey },
                body: JSON.stringify({ enabled: false, deleted: true }),
            }).catch(() => { })
        }
        await deleteProject(currentProject.id)
        setShowDelete(false)
        navigate('/')
    }

    const handleExit = async () => {
        if (!currentProject) return
        await deleteProject(currentProject.id)
        setShowExit(false)
        navigate('/')
    }

    const handleSave = async () => {
        if (!currentProject) return
        const oldSettings = parseProjectSettings(currentProject.settings)
        await updateProject(currentProject.id, {
            name: editName, description: editDesc, background: editBg,
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

    return (
        <AppShell>
            <Header
                title="项目概览"
                backTo="/"
                actions={
                    <>
                        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}
                            disabled={isMember} title={isMember ? '协作者不能修改项目配置' : '编辑项目'}>
                            <Edit3 size={14} /> 编辑
                        </Button>
                        {isMember ? (
                            <Button variant="ghost" size="sm" onClick={() => setShowExit(true)}>
                                <LogOut size={14} className="text-orange-500" />
                            </Button>
                        ) : (
                            <Button variant="ghost" size="sm" onClick={() => setShowDelete(true)}>
                                <Trash2 size={14} className="text-red-500" />
                            </Button>
                        )}
                    </>
                }
            />
            <div className="flex-1 flex min-h-0">
                {/* Left: Settings tabs */}
                <div className="w-36 border-r border-gray-200 p-3 space-y-1 shrink-0">
                    <button onClick={() => setSettingsTab('overview')}
                        className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                            settingsTab === 'overview' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
                        概览
                    </button>
                    {(sharingEnabled && connected) && (
                    <button onClick={() => setSettingsTab('publish')}
                        className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                            settingsTab === 'publish' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
                        发布
                    </button>
                    )}
                    {!isMember && (
                    <button onClick={() => setSettingsTab('settings')}
                        className={cn('w-full text-left px-3 py-1.5 rounded text-sm transition-colors',
                            settingsTab === 'settings' ? 'bg-zell-50 text-zell-700 font-medium' : 'text-gray-500 hover:bg-gray-50')}>
                        设置
                    </button>
                    )}
                </div>

                {/* Right: Tab content */}
                <div className="flex-1 overflow-auto">
                    {settingsTab === 'overview' ? (
                        <div className="p-6 space-y-6">
                            <Card className="p-5">
                                <h3 className="font-semibold text-gray-800 mb-3">项目信息</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-400">名称</span>
                                        <p className="text-gray-700 mt-1 font-medium">{currentProject.name}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">描述</span>
                                        <p className="text-gray-700 mt-1">{currentProject.description || '无'}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">创建时间</span>
                                        <p className="text-gray-700 mt-1">{format.dateTime(currentProject.created_at)}</p>
                                    </div>
                                    <div>
                                        <span className="text-gray-400">最后更新</span>
                                        <p className="text-gray-700 mt-1">{format.dateTime(currentProject.updated_at)}</p>
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

                            {!isMember && (
                            <Card className="p-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                        <Users size={18} /> 项目服务器
                                        {connecting && (
                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-yellow-600 bg-yellow-50">
                                                连接中...
                                            </span>
                                        )}
                                        {!connecting && sharingEnabled && (
                                            <span className={cn(
                                                'text-xs px-2 py-0.5 rounded-full font-medium',
                                                serverOnline ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                                            )}>
                                                {serverOnline ? '已连接' : (connectFailed ? '连接失败' : '已断开')}
                                            </span>
                                        )}
                                    </h3>
                                    <button
                                        onClick={() => {
                                            if (!sharingEnabled) {
                                                const proj = useProjectStore.getState().currentProject
                                                const ps = proj ? parseProjectSettings(proj.settings) : {}
                                                if (ps.serverUrl && ps.serverKey) {
                                                    setServerInputUrl(ps.serverUrl)
                                                    setServerKey(ps.serverKey)
                                                    setSharingEnabled(true)
                                                    // Auto-connect since we have saved credentials
                                                    handleToggleSharing(true)
                                                    return
                                                }
                                                setSharingEnabled(true)
                                            } else {
                                                if (!confirm('确定关闭协作吗？所有成员将被移出项目。')) return
                                                handleToggleSharing(false)
                                                setSharingEnabled(false)
                                            }
                                        }}
                                        className={cn(
                                            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                                            sharingEnabled ? 'bg-green-500' : 'bg-gray-200'
                                        )}
                                    >
                                        <span className={cn(
                                            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                                            sharingEnabled ? 'translate-x-4' : 'translate-x-0'
                                        )} />
                                    </button>
                                </div>

                                {sharingEnabled && (
                                    <div className="mt-4 space-y-4 animate-slideDown overflow-hidden">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">服务器地址</label>
                                            <div className="flex gap-2">
                                                <input
                                                    value={serverInputUrl}
                                                    onChange={(e) => setServerInputUrl(e.target.value)}
                                                    placeholder="http://localhost:3000"
                                                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400"
                                                    disabled={!!inviteCode}
                                                />
                                                <Button size="sm" onClick={() => handleToggleSharing(true)} disabled={connecting || !serverInputUrl.trim() || !serverKey.trim()}>
                                                    {connecting ? '连接中...' : '连接'}
                                                </Button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">服务器密钥</label>
                                            <input
                                                value={serverKey}
                                                onChange={(e) => setServerKey(e.target.value.trim())}
                                                placeholder="启动 zell-server 时控制台输出的密钥"
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400"
                                                disabled={!!inviteCode}
                                            />
                                            <p className="text-xs text-gray-400 mt-1">启动 zell-server 时控制台输出的密钥</p>
                                        </div>

                                        {serverOnline && (
                                            <>
                                                <div className="flex items-center gap-2 text-sm">
                                                    <div className={cn('w-2.5 h-2.5 rounded-full',
                                                        connecting ? 'bg-yellow-400' : serverOnline ? 'bg-green-500' : 'bg-red-400')} />
                                                    <span className="text-gray-600">{serverUrl}</span>
                                                </div>

                                                {inviteCode ? (
                                                    <div className="p-3 bg-zell-50 rounded-lg border border-zell-100 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm font-medium text-gray-700">邀请码</span>
                                                            <span className="text-xs text-gray-400">每 30 分钟自动更新</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-sm bg-white px-3 py-1.5 rounded border border-gray-200 font-mono text-gray-700 flex-1">
                                                                {inviteCode}
                                                            </code>
                                                            <Button size="sm" variant="outline" onClick={handleCopyCode}>
                                                                <Copy size={14} className="mr-1" />
                                                                {copied ? '已复制' : '复制'}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                                                        <span className="text-sm text-yellow-700">正在获取邀请码...</span>
                                                    </div>
                                                )}

                                                {members.length > 0 && (
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-700 mb-2">成员 ({members.length})</p>
                                                        <div className="space-y-1">
                                                            {members.map(m => (
                                                                <div key={m.client_id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50 text-sm">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={m.online ? 'w-2 h-2 rounded-full bg-green-500' : 'w-2 h-2 rounded-full bg-gray-300'} />
                                                                        <span className="text-gray-700">{m.display_name}</span>
                                                                    </div>
                                                                    <button onClick={() => {
                                                                        if (!confirm(`确定将 ${m.display_name} 移出项目吗？对方将失去所有编辑权限。`)) return
                                                                        handleKick(m.client_id)
                                                                    }}
                                                                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="踢出">
                                                                        <X size={13} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {pending.length > 0 && (
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-700 mb-2">待审批 ({pending.length})</p>
                                                        <div className="space-y-1">
                                                            {pending.map(p => (
                                                                <div key={p.client_id} className="flex items-center justify-between py-1.5 px-2 rounded bg-amber-50 border border-amber-100 text-sm">
                                                                    <span className="text-gray-700">{p.display_name}</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <button onClick={() => {
                                                                            if (!confirm(`确定通过 ${p.display_name} 的加入申请吗？`)) return
                                                                            handleApprove(p.client_id)
                                                                        }}
                                                                            className="p-1 rounded hover:bg-green-200 text-gray-400 hover:text-green-600" title="通过">
                                                                            <Check size={13} />
                                                                        </button>
                                                                        <button onClick={() => {
                                                                            if (!confirm(`确定拒绝 ${p.display_name} 的加入申请吗？操作不可撤销。`)) return
                                                                            handleReject(p.client_id)
                                                                        }}
                                                                            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="拒绝">
                                                                            <X size={13} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </Card>
                            )}
                        </div>
                    ) : settingsTab === 'publish' ? (
                        <PublishSettings />
                    ) : (
                        <SettingsTab />
                    )}
                </div>
            </div>

            {/* Edit Dialog */}
            <Dialog open={showEdit} onOpenChange={setShowEdit} title="编辑项目">
                <div className="space-y-4">
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

            <Dialog open={showExit} onOpenChange={setShowExit} title="退出项目"
                description="退出后项目将从本地删除，不再接收协作更新。确定退出吗？">
                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setShowExit(false)}>取消</Button>
                    <Button variant="destructive" onClick={handleExit}>确认退出</Button>
                </div>
            </Dialog>

            {/* Server disconnect overlay — members only */}
            {showDisconnected && isMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-sm text-center space-y-4">
                        <p className="text-lg font-semibold text-gray-800">服务器连接已断开</p>
                        {isMember ? (
                            <>
                                <p className="text-sm text-gray-500">协作者无法离线编辑，5秒后返回首页</p>
                                <button onClick={() => navigate('/')}
                                    className="px-4 py-2 bg-zell-500 text-white rounded-lg text-sm hover:bg-zell-600">
                                    立即返回
                                </button>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500">检测到连接后将自动恢复</p>
                        )}
                    </div>
                </div>
            )}

            {/* Server toast */}
            {serverToast && (
                <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow text-sm bg-gray-800 text-white">
                    {serverToast}
                </div>
            )}
        </AppShell>
    )
}

function SettingsTab() {
    const currentProject = useProjectStore(s => s.currentProject)
    const updateProject = useProjectStore(s => s.updateProject)
    const ps = currentProject ? parseProjectSettings(currentProject.settings) : {}
    const app = (ps as any).appearance || {}
    const sync = (ps as any).sync || { policy: 'manual', intervalHours: '24' }
    const currentTheme = app.theme || 'zell'
    const [toast, setToast] = useState<string | null>(null)
    const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000) }, [])

    const save = useCallback(async (key: string, value: any) => {
        if (!currentProject) return
        const s = parseProjectSettings(currentProject.settings)
        if (key === 'theme') {
            (s as any).appearance = { ...app, [key]: value }
        } else {
            (s as any).sync = { ...sync, policy: key === 'scheduled' ? 'scheduled' : key, intervalHours: value === 'scheduled' ? sync.intervalHours : sync.intervalHours }
        }
        await updateProject(currentProject.id, {
            name: currentProject.name, description: currentProject.description,
            background: currentProject.background, settings: stringifyProjectSettings(s),
        })
        showToast('已保存')
    }, [currentProject, app, sync, updateProject, showToast])

    return (
        <div className="p-6 space-y-6 relative">
            {/* Appearance */}
            <div className="space-y-3">
                <h3 className="font-semibold text-gray-800">外观</h3>
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">Markdown 主题</label>
                    <div className="flex gap-2">
                        {['zell', 'github', 'report'].map(t => (
                            <button key={t} onClick={() => save('theme', t)}
                                className={cn(
                                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                                    currentTheme === t
                                        ? 'border-zell-400 bg-zell-50 text-zell-700 font-medium'
                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                )}>
                                {t === 'zell' ? 'Zell' : t === 'github' ? 'GitHub' : 'Report'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Sync */}
            <div className="space-y-3">
                <h3 className="font-semibold text-gray-800">外部链接同步</h3>
                <p className="text-xs text-gray-400">控制外部链接何时自动抓取网页内容。</p>
                {[
                    { value: 'manual', label: '手动同步', desc: '仅在点击"同步"按钮时更新' },
                    { value: 'on_open', label: '打开项目时', desc: '每次进入项目时自动同步' },
                    { value: 'scheduled', label: '定时同步', desc: '按固定间隔自动刷新' },
                ].map((opt) => (
                    <label key={opt.value} className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        sync.policy === opt.value ? 'border-zell-300 bg-zell-50' : 'border-gray-200 hover:bg-gray-50'
                    )}>
                        <input type="radio" name="syncPolicy" checked={sync.policy === opt.value}
                            onChange={() => save(opt.value, opt.value === 'scheduled' ? 'scheduled' : '')} className="mt-0.5 text-zell-500" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-700">{opt.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                        </div>
                    </label>
                ))}
            </div>

            {toast && <div className="absolute bottom-4 right-4 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{toast}</div>}
        </div>
    )
}
