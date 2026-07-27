import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSyncStore } from '@/stores/syncStore'
import { cn } from '@/lib/utils'
import { Play, Square } from 'lucide-react'

interface ServerManagerProps {
  onSave?: () => void
}

export function ServerManager({ onSave }: ServerManagerProps) {
  const { serverUrl, connected, setServerUrl, setConnected, setServerRunning } = useSyncStore()
  const [localUrl, setLocalUrl] = useState(serverUrl)
  const [status, setStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle')
  const [localRunning, setLocalRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [localIp, setLocalIp] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    setLocalUrl(serverUrl)
  }, [serverUrl])

  // Get local IP
  useEffect(() => {
    invoke<string>('get_local_ip').then(setLocalIp).catch(() => setLocalIp('未知'))
  }, [])

  // Poll server status from Rust backend
  useEffect(() => {
    const poll = async () => {
      try {
        const s = await invoke<{ running: boolean; pid: number | null }>('get_server_status')
        setLocalRunning(s.running)
        setServerRunning(s.running)
      } catch { /* ignore */ }
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [setServerRunning])

  const checkHealth = useCallback(async (url: string) => {
    if (!url) return
    setStatus('checking')
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        setStatus('online')
        setConnected(true)
      } else {
        setStatus('offline')
        setConnected(false)
      }
    } catch {
      setStatus('offline')
      setConnected(false)
    }
  }, [setConnected])

  useEffect(() => {
    if (serverUrl) {
      checkHealth(serverUrl)
      const interval = setInterval(() => checkHealth(serverUrl), 10000)
      return () => clearInterval(interval)
    } else {
      setStatus('idle')
    }
  }, [serverUrl, checkHealth])

  // Also check health when localRunning changes to true
  useEffect(() => {
    if (localRunning && !serverUrl) {
      const url = 'http://localhost:3000'
      setServerUrl(url)
      setLocalUrl(url)
      checkHealth(url)
    }
  }, [localRunning])

  const handleSave = useCallback(async () => {
    let url = localUrl.trim()
    if (url && !url.startsWith('http')) {
      url = 'http://' + url
    }
    setServerUrl(url)
    await checkHealth(url)
    onSave?.()
  }, [localUrl, setServerUrl, checkHealth, onSave])

  const handleStartLocal = useCallback(async () => {
    setStarting(true)
    try {
      const result = await invoke<string>('start_server', { path: null })
      console.log('[server]', result)
      setTimeout(() => {
        const url = 'http://localhost:3000'
        setServerUrl(url)
        setLocalUrl(url)
        checkHealth(url)
      }, 1500)
    } catch (err) {
      console.error('[server] start failed:', err)
      alert(String(err))
    } finally {
      setStarting(false)
    }
  }, [setServerUrl, checkHealth])

  const handleStopLocal = useCallback(async () => {
    setStopping(true)
    try {
      const result = await invoke<string>('stop_server')
      console.log('[server]', result)
      setLocalRunning(false)
      setConnected(false)
      setServerRunning(false)
      setStatus('idle')
    } catch (err) {
      console.error('[server] stop failed:', err)
    } finally {
      setStopping(false)
    }
  }, [setConnected, setServerRunning])

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">团队服务器</h3>
      <p className="text-xs text-gray-400">
        启动内置服务器后，局域网内其他人即可连接协作。
      </p>

      {/* Local server management */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
        <p className="text-sm font-medium text-gray-700">本地服务器</p>
        {localIp && (
          <p className="text-xs text-gray-500">
            本机 IP：<code className="bg-gray-200 px-1 rounded">{localIp}</code>，局域网内其他人可连接
            <code className="bg-gray-200 px-1 rounded ml-1">http://{localIp}:3000</code>
          </p>
        )}
        <div className="flex items-center gap-2">
          {localRunning ? (
            <Button size="sm" variant="destructive" onClick={handleStopLocal} disabled={stopping}>
              <Square size={14} className="mr-1" />
              {stopping ? '停止中...' : '停止服务器'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleStartLocal} disabled={starting}>
              <Play size={14} className="mr-1" />
              {starting ? '启动中...' : '启动本地服务器'}
            </Button>
          )}
          {localRunning && (
            <span className="text-xs text-green-600 font-medium">运行中</span>
          )}
        </div>
      </div>

      {/* Remote server connection */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">服务器地址</label>
          <div className="flex gap-2">
            <Input
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder={localIp ? `http://${localIp}:3000` : 'http://192.168.1.100:3000'}
              className="flex-1"
            />
            <Button size="sm" onClick={handleSave}>连接</Button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            本地默认 http://localhost:3000，局域网其他设备填入此电脑的 IP
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            'w-2.5 h-2.5 rounded-full',
            status === 'online' ? 'bg-green-500' :
            status === 'offline' ? 'bg-red-400' :
            status === 'checking' ? 'bg-amber-400 animate-pulse' :
            'bg-gray-300'
          )} />
          <span className="text-sm text-gray-600">
            {status === 'online' ? '已连接' :
             status === 'offline' ? '无法连接' :
             status === 'checking' ? '检测中...' :
             '未配置'}
          </span>
        </div>
      </div>
    </div>
  )
}
