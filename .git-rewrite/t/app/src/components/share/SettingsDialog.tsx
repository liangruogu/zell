import { useEffect, useState, useCallback } from 'react'
import { X, Palette, Bot, FileText, Server, CheckCircle, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSettingsStore } from '@/stores/settingsStore'
import { useForm } from 'react-hook-form'
import { cn } from '@/lib/utils'
import { testProviderConnection, type AIProvider } from '@/services/aiService'

type SettingsCategory = 'appearance' | 'ai' | 'editor' | 'server'

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'ai', label: 'AI 服务', icon: <Bot size={16} /> },
  { key: 'editor', label: '编辑器', icon: <FileText size={16} /> },
  { key: 'server', label: '服务器', icon: <Server size={16} /> },
]

const FONT_SIZE_OPTIONS = [
  { value: '14', label: '14px (较小)' },
  { value: '15', label: '15px (中等)' },
  { value: '16', label: '16px (默认)' },
  { value: '18', label: '18px (较大)' },
]

const EDITOR_MODE_OPTIONS = [
  { value: 'wysiwyg', label: '所见即所得' },
  { value: 'split', label: '分屏模式' },
]

const IMAGE_STORAGE_OPTIONS = [
  { value: 'base64', label: 'Base64 内嵌（Markdown 源码较长）' },
  { value: 'file', label: '文件路径（保存在项目目录，简洁可读）' },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, loadSettings, setSetting } = useSettingsStore()
  const [category, setCategory] = useState<SettingsCategory>('appearance')
  const [toast, setToast] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  useEffect(() => {
    if (open) loadSettings()
  }, [open, loadSettings])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    if (open) document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  const parsed = parseSettings(settings)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false) }}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 flex w-[800px] h-[560px] bg-white rounded-xl shadow-2xl overflow-hidden">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-3 right-3 z-20 p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X size={18} className="text-gray-400" />
        </button>

        <nav className="w-44 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0 py-4">
          <h2 className="px-4 mb-3 font-semibold text-gray-800 text-sm">设置</h2>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors',
                category === cat.key
                  ? 'bg-white text-bindle-700 font-medium border-r-2 border-bindle-500 -mr-px'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-auto p-6 relative">
          {category === 'appearance' && <AppearanceSettings parsed={parsed} setSetting={setSetting} showToast={showToast} />}
          {category === 'ai' && <AISettings parsed={parsed} setSetting={setSetting} showToast={showToast} />}
          {category === 'editor' && <EditorSettings parsed={parsed} setSetting={setSetting} showToast={showToast} />}
          {category === 'server' && <ServerSettings parsed={parsed} setSetting={setSetting} showToast={showToast} />}

          {/* Toast notification */}
          {toast && (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg shadow text-sm animate-[fadeIn_0.2s_ease-out]">
              <CheckCircle size={14} />
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Parse stored settings ----
function parseSettings(settings: Record<string, string>) {
  let editorPrefs: Record<string, unknown> = {}
  let appearance: Record<string, unknown> = {}
  try { if (settings['editor_prefs']) editorPrefs = JSON.parse(settings['editor_prefs']) } catch {}
  try { if (settings['appearance']) appearance = JSON.parse(settings['appearance']) } catch {}
  return {
    editorPrefs,
    appearance,
    serverUrl: settings['server_url'] || '',
    aiProviders: settings['ai_providers'] || '[]',
    activeProvider: settings['ai_active_provider'] || '',
  }
}

// ---- Appearance Settings ----
function AppearanceSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const showToolbarVal = parsed.appearance.showToolbar !== false

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      fontSize: String(parsed.appearance.fontSize || '16'),
      showToolbar: showToolbarVal,
    },
  })

  useEffect(() => {
    reset({
      fontSize: String(parsed.appearance.fontSize || '16'),
      showToolbar: parsed.appearance.showToolbar !== false,
    })
  }, [parsed.appearance.fontSize, parsed.appearance.showToolbar, reset])

  const onSubmit = useCallback(async (data: { fontSize: string; showToolbar: boolean }) => {
    await setSetting('appearance', JSON.stringify(data))
    showToast('外观设置已保存')
  }, [setSetting, showToast])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h3 className="font-semibold text-gray-800">外观设置</h3>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">编辑器字号</label>
          <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bindle-400" {...register('fontSize')}>
            {FONT_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-bindle-500" {...register('showToolbar')} />
          <span className="text-sm text-gray-700">显示编辑器工具栏</span>
        </label>
      </div>
      <Button type="submit" size="sm">保存外观</Button>
    </form>
  )
}

// ---- AI Settings ----
// ---- AI Settings (multi-provider) ----
function AISettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [activeId, setActiveId] = useState('')
  const [testing, setTesting] = useState<string | null>(null)

  useEffect(() => {
    const raw = parsed.aiProviders
    try {
      const list = typeof raw === 'string' ? JSON.parse(raw) : (raw || [])
      setProviders(list)
    } catch { setProviders([]) }
  }, [parsed.aiProviders])

  useEffect(() => {
    setActiveId(parsed.activeProvider || '')
  }, [parsed.activeProvider])

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
    const list = providers.map(p => p.id === id ? { ...p, [field]: value } : p)
    setProviders(list)
  }, [providers])

  const handleSave = useCallback(() => {
    save(providers, activeId)
  }, [providers, activeId, save])

  const handleTest = useCallback(async (provider: AIProvider) => {
    setTesting(provider.id)
    const result = await testProviderConnection(provider)
    setTesting(null)
    showToast(result.ok ? '连接成功' : result.message)
  }, [showToast])

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800">AI 服务</h3>
      <p className="text-xs text-gray-400">支持任意兼容 OpenAI API 的服务（DeepSeek、Ollama、Groq 等），填写 Base URL 和 API Key 即可。</p>

      {providers.length === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">暂无 AI 服务，点击添加</p>
      )}

      {providers.map((p) => (
        <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              name="activeProvider"
              checked={activeId === p.id || (providers.length === 1 && !activeId)}
              onChange={() => { setActiveId(p.id); save(providers, p.id) }}
              className="text-bindle-500"
            />
            <input
              value={p.name}
              onChange={(e) => updateProvider(p.id, 'name', e.target.value)}
              placeholder="Provider 名称（如 DeepSeek）"
              className="flex-1 text-sm font-medium bg-transparent border-none outline-none"
            />
            <button onClick={() => removeProvider(p.id)} className="p-1 text-gray-400 hover:text-red-500" title="删除">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Base URL</label>
              <input
                value={p.baseUrl}
                onChange={(e) => updateProvider(p.id, 'baseUrl', e.target.value)}
                placeholder="https://api.deepseek.com"
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-bindle-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">API Key</label>
                <input
                  type="password"
                  value={p.apiKey}
                  onChange={(e) => updateProvider(p.id, 'apiKey', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-bindle-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">模型</label>
                <input
                  value={p.model}
                  onChange={(e) => updateProvider(p.id, 'model', e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-bindle-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleTest(p)}
                disabled={testing === p.id || !p.baseUrl}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                {testing === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                测试连接
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={addProvider}>
          <Plus size={14} className="mr-1" />添加 Provider
        </Button>
        <Button size="sm" onClick={handleSave}>保存配置</Button>
      </div>
    </div>
  )
}

// ---- Editor Settings ----
function EditorSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      defaultMode: String(parsed.editorPrefs.defaultMode || 'wysiwyg'),
      imageStorage: String(parsed.editorPrefs.imageStorage || 'base64'),
    },
  })

  useEffect(() => {
    reset({
      defaultMode: String(parsed.editorPrefs.defaultMode || 'wysiwyg'),
      imageStorage: String(parsed.editorPrefs.imageStorage || 'base64'),
    })
  }, [parsed.editorPrefs.defaultMode, parsed.editorPrefs.imageStorage, reset])

  const onSubmit = useCallback(async (data: { defaultMode: string; imageStorage: string }) => {
    await setSetting('editor_prefs', JSON.stringify({
      ...parsed.editorPrefs,
      ...data,
    }))
    showToast('编辑器设置已保存')
  }, [setSetting, showToast, parsed.editorPrefs])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h3 className="font-semibold text-gray-800">编辑器偏好</h3>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">默认编辑模式</label>
        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bindle-400" {...register('defaultMode')}>
          {EDITOR_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">图片存储方式</label>
        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bindle-400" {...register('imageStorage')}>
          {IMAGE_STORAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">Base64 模式：图片直接嵌入 Markdown<br />文件模式：图片保存为独立文件，Markdown 仅存引用</p>
      </div>
      <Button type="submit" size="sm">保存偏好</Button>
    </form>
  )
}

// ---- Server Settings ----
function ServerSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { serverUrl: parsed.serverUrl },
  })

  useEffect(() => { reset({ serverUrl: parsed.serverUrl }) }, [parsed.serverUrl, reset])

  const onSubmit = useCallback(async (data: { serverUrl: string }) => {
    await setSetting('server_url', data.serverUrl)
    showToast('服务器设置已保存')
  }, [setSetting, showToast])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h3 className="font-semibold text-gray-800">团队服务器</h3>
      <Input id="serverUrl" label="服务器地址" placeholder="https://bindle.example.com" {...register('serverUrl')} />
      <p className="text-xs text-gray-400">留空使用本地模式；填写后连接自托管后端实现团队协作</p>
      <Button type="submit" size="sm">保存</Button>
    </form>
  )
}
