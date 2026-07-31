import { logger } from '@/lib/logger'
import { useEffect, useState, useCallback } from 'react'
import { X, CheckCircle, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSettingsStore } from '@/stores/settingsStore'
import { testProviderConnection, type AIProvider } from '@/services/aiService'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type TabKey = 'ai' | 'appearance'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ai', label: 'AI 服务' },
  { key: 'appearance', label: '外观' },
]

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, loadSettings, setSetting } = useSettingsStore()
  const [toast, setToast] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('ai')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => { if (open) loadSettings() }, [open, loadSettings])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onOpenChange(false) }
    if (open) document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  const parsed = {
    aiProviders: settings['ai_providers'] || '[]',
    activeProvider: settings['ai_active_provider'] || '',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false) }}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-[600px] h-[520px] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Tabs */}
        <div className="flex shrink-0 px-6 pt-4 gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="px-4 py-1.5 text-sm rounded-md transition-colors cursor-pointer border-none"
              style={{
                background: tab === t.key ? '#eef2ff' : 'transparent',
                color: tab === t.key ? '#4338ca' : '#6b7280',
                fontWeight: tab === t.key ? 600 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 relative">
          {tab === 'ai' && (
            <AISettings parsed={parsed} setSetting={setSetting} showToast={showToast} />
          )}
          {tab === 'appearance' && (
            <AppearanceSettings settings={settings} setSetting={setSetting} />
          )}
          {toast && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow text-sm">
              <CheckCircle size={14} />{toast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AppearanceSettings({ settings, setSetting }: {
  settings: Record<string, string>
  setSetting: (k: string, v: string) => Promise<void>
}) {
  const [typewriter, setTypewriter] = useState(settings['editor_typewriter'] === 'true')
  const [showToolbar, setShowToolbar] = useState(settings['show_toolbar'] !== 'false')

  useEffect(() => {
    setTypewriter(settings['editor_typewriter'] === 'true')
    setShowToolbar(settings['show_toolbar'] !== 'false')
  }, [settings])

  const toggleTypewriter = useCallback(async () => {
    const next = !typewriter
    setTypewriter(next)
    await setSetting('editor_typewriter', String(next))
  }, [typewriter, setSetting])

  const toggleToolbar = useCallback(async () => {
    const next = !showToolbar
    setShowToolbar(next)
    await setSetting('show_toolbar', String(next))
  }, [showToolbar, setSetting])

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-zell-500"
          checked={showToolbar}
          onChange={toggleToolbar}
        />
        <span className="text-sm text-gray-700">显示编辑器工具栏</span>
      </label>
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="w-4 h-4 accent-zell-500"
          checked={typewriter}
          onChange={toggleTypewriter}
        />
        <span className="text-sm text-gray-700">打字机模式 (光标始终居中)</span>
      </label>
    </div>
  )
}

function AISettings({ parsed, setSetting, showToast }: {
  parsed: { aiProviders: string; activeProvider: string }
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [activeId, setActiveId] = useState('')
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    try {
      const list = typeof parsed.aiProviders === 'string' ? JSON.parse(parsed.aiProviders) : (parsed.aiProviders || [])
      setProviders(list)
    } catch (e) { logger.error('SettingsDialog: failed to parse AI providers', e); setProviders([]) }
  }, [parsed.aiProviders])

  useEffect(() => { setActiveId(parsed.activeProvider || '') }, [parsed.activeProvider])

  const save = useCallback(async (list: AIProvider[], active: string) => {
    await setSetting('ai_providers', JSON.stringify(list))
    await setSetting('ai_active_provider', active)
    showToast('AI 配置已保存')
  }, [setSetting, showToast])

  const addProvider = useCallback(() => {
    const p: AIProvider = { id: crypto.randomUUID(), name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '' }
    const list = [...providers, p]
    setProviders(list)
    save(list, activeId || p.id)
  }, [providers, activeId, save])

  const removeProvider = useCallback((id: string) => {
    const list = providers.filter(p => p.id !== id)
    setProviders(list)
    const nextActive = activeId === id ? (list[0]?.id || '') : activeId
    setActiveId(nextActive)
    save(list, nextActive)
  }, [providers, activeId, save])

  const updateProvider = useCallback((id: string, field: keyof AIProvider, value: string) => {
    setProviders(providers.map(p => p.id === id ? { ...p, [field]: value } : p))
  }, [providers])

  const handleTest = useCallback(async (provider: AIProvider) => {
    setTesting(provider.id)
    showToast((await testProviderConnection(provider)).ok ? '连接成功' : '连接失败')
    setTesting(null)
  }, [showToast])

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">支持任意兼容 OpenAI API 的服务（DeepSeek、Ollama、Groq 等），填写 Base URL 和 API Key 即可。</p>
      {providers.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">暂无 AI 服务，点击添加</p>}
      {providers.map((p) => (
        <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input type="radio" name="activeProvider" checked={activeId === p.id || (providers.length === 1 && !activeId)}
              onChange={() => { setActiveId(p.id); save(providers, p.id) }} className="text-zell-500" />
            <input value={p.name} onChange={(e) => updateProvider(p.id, 'name', e.target.value)}
              placeholder="Provider 名称" className="flex-1 text-sm font-medium bg-transparent border-none outline-none" />
            <button onClick={() => removeProvider(p.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Base URL</label>
              <input value={p.baseUrl} onChange={(e) => updateProvider(p.id, 'baseUrl', e.target.value)}
                placeholder="https://api.deepseek.com"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">API Key</label>
                <input type="password" value={p.apiKey} onChange={(e) => updateProvider(p.id, 'apiKey', e.target.value)}
                  placeholder="sk-..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">模型</label>
                <input value={p.model} onChange={(e) => updateProvider(p.id, 'model', e.target.value)}
                  placeholder="deepseek-chat" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400" />
              </div>
            </div>
            <button onClick={() => handleTest(p)} disabled={testing === p.id || !p.baseUrl}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50">
              {testing === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}测试连接
            </button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={addProvider}><Plus size={14} className="mr-1" />添加 Provider</Button>
        <Button size="sm" onClick={() => save(providers, activeId)}>保存配置</Button>
      </div>
    </div>
  )
}
