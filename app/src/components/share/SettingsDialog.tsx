import { useEffect, useState, useCallback } from 'react'
import { X, Palette, Bot, FileText, Server, CheckCircle, Plus, Trash2, Loader2, Link2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSettingsStore } from '@/stores/settingsStore'
import { useForm } from 'react-hook-form'
import { cn } from '@/lib/utils'
import { testProviderConnection, type AIProvider } from '@/services/aiService'
import { ServerManager } from './ServerManager'

type SettingsCategory = 'appearance' | 'ai' | 'editor' | 'server' | 'sync'

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'ai', label: 'AI 服务', icon: <Bot size={16} /> },
  { key: 'editor', label: '编辑器', icon: <FileText size={16} /> },
  { key: 'server', label: '服务器', icon: <Server size={16} /> },
  { key: 'sync', label: '资源同步', icon: <Link2 size={16} /> },
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
          {category === 'server' && <ServerManager onSave={() => showToast('服务器设置已保存')} />}
          {category === 'sync' && <ResourceSyncSettings parsed={parsed} setSetting={setSetting} showToast={showToast} />}

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
    linkSyncPolicy: settings['link_sync_policy'] || 'manual',
    aiProviders: settings['ai_providers'] || '[]',
    activeProvider: settings['ai_active_provider'] || '',
    customCss: settings['custom_css'] || '',
  }
}

// ---- Appearance Settings ----
const THEME_OPTIONS = [
  { value: 'bindle', label: 'Bindle 默认', preview: 'bg-gradient-to-br from-blue-50 to-indigo-100 text-bindle-600' },
  { value: 'github', label: 'GitHub', preview: 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700' },
  { value: 'notion', label: 'Notion', preview: 'bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700' },
  { value: 'minimal', label: '极简', preview: 'bg-gradient-to-br from-white to-gray-50 text-gray-500' },
]

function AppearanceSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const showToolbarVal = parsed.appearance.showToolbar !== false
  const currentTheme = String(parsed.appearance.theme || 'bindle')
  const [customCss, setCustomCss] = useState('')
  const [cssExpanded, setCssExpanded] = useState(false)
  const [cssRefExpanded, setCssRefExpanded] = useState(false)

  useEffect(() => {
    const raw = parsed as Record<string, unknown>
    setCustomCss(String((raw as Record<string, string>).customCss || ''))
  }, [parsed])

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
    await setSetting('appearance', JSON.stringify({
      ...parsed.appearance,
      fontSize: data.fontSize,
      showToolbar: data.showToolbar,
      theme: currentTheme,
    }))
    if (customCss !== undefined) {
      await setSetting('custom_css', customCss)
    }
    showToast('外观设置已保存')
  }, [setSetting, showToast, parsed.appearance, currentTheme, customCss])

  const handleThemeChange = useCallback(async (theme: string) => {
    const updated = { ...parsed.appearance, theme }
    await setSetting('appearance', JSON.stringify(updated))
    document.documentElement.setAttribute('data-bindle-theme', theme)
    showToast('主题已切换')
  }, [parsed.appearance, setSetting, showToast])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <h3 className="font-semibold text-gray-800">外观设置</h3>

      {/* Theme selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Markdown 主题</label>
        <div className="grid grid-cols-4 gap-2">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleThemeChange(t.value)}
              className={cn(
                'flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all',
                currentTheme === t.value
                  ? 'border-bindle-400 bg-bindle-50 text-bindle-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              )}
            >
              <span className={cn('w-10 h-6 rounded', t.preview)} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font size + toolbar */}
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

      {/* Custom CSS */}
      <div className="space-y-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setCssExpanded(!cssExpanded)}
          className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          {cssExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          自定义 CSS
        </button>
        {cssExpanded && (
          <div className="space-y-2">
            <textarea
              value={customCss}
              onChange={(e) => setCustomCss(e.target.value)}
              placeholder={`/* 在此编写自定义 CSS */\n.bindle-prose h1 {\n  color: #your-color;\n}`}
              spellCheck={false}
              className="w-full h-32 px-3 py-2 text-xs font-mono bg-gray-900 text-gray-100 border border-gray-700 rounded-md focus:outline-none focus:ring-1 focus:ring-bindle-400 resize-y"
            />
            <button
              type="button"
              onClick={() => setCssRefExpanded(!cssRefExpanded)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {cssRefExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              可修改的元素参考
            </button>
            {cssRefExpanded && (
              <pre className="text-[11px] text-gray-500 bg-gray-50 rounded p-3 border border-gray-100 overflow-x-auto select-all">
{`/* 修改 H1 标题颜色 */
.bindle-prose h1 { color: #your-color; }

/* 修改正文字体和大小 */
.bindle-prose { font-family: 'your-font', sans-serif; font-size: 16px; }

/* 修改代码块背景色 */
.bindle-prose pre { background: #1e1e1e; }

/* 修改链接颜色 */
.bindle-prose a { color: #your-color; }

/* 修改表格边框 */
.bindle-prose table { border-color: #your-color; }

/* 修改引用块样式 */
.bindle-prose blockquote { border-left-color: #your-color; }`}
              </pre>
            )}
          </div>
        )}
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

// ---- Resource Sync Settings ----
function ResourceSyncSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const [policy, setPolicy] = useState('manual')
  const [intervalHours, setIntervalHours] = useState('24')

  useEffect(() => {
    const raw = parsed.linkSyncPolicy
    if (raw.startsWith('scheduled:')) {
      setPolicy('scheduled')
      setIntervalHours(raw.split(':')[1] || '24')
    } else {
      setPolicy(raw || 'manual')
    }
  }, [parsed.linkSyncPolicy])

  const handleSave = useCallback(async () => {
    const value = policy === 'scheduled' ? `scheduled:${intervalHours}` : policy
    await setSetting('link_sync_policy', value)
    showToast('同步策略已保存')
  }, [policy, intervalHours, setSetting, showToast])

  return (
    <div className="space-y-5">
      <h3 className="font-semibold text-gray-800">外部链接同步策略</h3>
      <p className="text-xs text-gray-400">控制外部链接何时自动抓取网页内容并生成 Markdown 快照。</p>

      <div className="space-y-3">
        {[
          { value: 'manual', label: '手动同步', desc: '仅在点击"同步"按钮时更新链接内容' },
          { value: 'on_open', label: '打开项目时', desc: '每次进入项目时自动同步所有链接' },
          { value: 'scheduled', label: '定时同步', desc: '按固定间隔自动刷新所有链接' },
        ].map((opt) => (
          <label key={opt.value} className={cn(
            'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
            policy === opt.value ? 'border-bindle-300 bg-bindle-50' : 'border-gray-200 hover:bg-gray-50'
          )}>
            <input
              type="radio"
              name="syncPolicy"
              checked={policy === opt.value}
              onChange={() => setPolicy(opt.value)}
              className="mt-0.5 text-bindle-500"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{opt.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
              {opt.value === 'scheduled' && policy === 'scheduled' && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">间隔:</span>
                  <input
                    value={intervalHours}
                    onChange={(e) => setIntervalHours(e.target.value.replace(/\D/g, '').slice(0, 5))}
                    className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-bindle-400"
                  />
                  <span className="text-xs text-gray-500">小时</span>
                </div>
              )}
            </div>
          </label>
        ))}
      </div>

      <Button size="sm" onClick={handleSave}>保存设置</Button>
    </div>
  )
}
