import { useEffect, useState, useCallback } from 'react'
import { X, Palette, Bot, FileText, Server, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSettingsStore } from '@/stores/settingsStore'
import { useForm } from 'react-hook-form'
import { cn } from '@/lib/utils'

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
  let ai: Record<string, unknown> = {}
  let editorPrefs: Record<string, unknown> = {}
  let appearance: Record<string, unknown> = {}
  try { if (settings['ai_config']) ai = JSON.parse(settings['ai_config']) } catch {}
  try { if (settings['editor_prefs']) editorPrefs = JSON.parse(settings['editor_prefs']) } catch {}
  try { if (settings['appearance']) appearance = JSON.parse(settings['appearance']) } catch {}
  return { ai, editorPrefs, appearance, serverUrl: settings['server_url'] || '' }
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
function AISettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      textProvider: String(parsed.ai.text_provider || 'openai'),
      textModel: String(parsed.ai.text_model || 'gpt-4o'),
      textApiKey: String(parsed.ai.text_api_key || ''),
      imageProvider: String(parsed.ai.image_provider || 'openai'),
      imageModel: String(parsed.ai.image_model || 'dall-e-3'),
      ollamaUrl: String(parsed.ai.local_ollama_url || 'http://localhost:11434'),
      ollamaModel: String(parsed.ai.local_ollama_model || 'llama3:8b'),
    },
  })

  useEffect(() => {
    reset({
      textProvider: String(parsed.ai.text_provider || 'openai'),
      textModel: String(parsed.ai.text_model || 'gpt-4o'),
      textApiKey: String(parsed.ai.text_api_key || ''),
      imageProvider: String(parsed.ai.image_provider || 'openai'),
      imageModel: String(parsed.ai.image_model || 'dall-e-3'),
      ollamaUrl: String(parsed.ai.local_ollama_url || 'http://localhost:11434'),
      ollamaModel: String(parsed.ai.local_ollama_model || 'llama3:8b'),
    })
  }, [parsed.ai.text_provider, parsed.ai.text_model, parsed.ai.text_api_key,
      parsed.ai.image_provider, parsed.ai.image_model,
      parsed.ai.local_ollama_url, parsed.ai.local_ollama_model, reset])

  const onSubmit = useCallback(async (data: Record<string, string>) => {
    await setSetting('ai_config', JSON.stringify({
      text_provider: data.textProvider, text_model: data.textModel,
      text_api_key: data.textApiKey, image_provider: data.imageProvider,
      image_model: data.imageModel, local_ollama_url: data.ollamaUrl,
      local_ollama_model: data.ollamaModel, fallback_to_local: true,
    }))
    showToast('AI 配置已保存')
  }, [setSetting, showToast])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h3 className="font-semibold text-gray-800">AI 服务配置</h3>
      <div className="grid grid-cols-2 gap-4">
        <Input id="textProvider" label="文本生成服务商" {...register('textProvider')} />
        <Input id="textModel" label="文本模型" placeholder="gpt-4o" {...register('textModel')} />
        <div className="col-span-2">
          <Input id="textApiKey" label="API Key" type="password" placeholder="sk-..." {...register('textApiKey')} />
        </div>
        <Input id="imageProvider" label="图片生成服务商" {...register('imageProvider')} />
        <Input id="imageModel" label="图片模型" placeholder="dall-e-3" {...register('imageModel')} />
      </div>

      <h3 className="font-semibold text-gray-800 pt-2">本地模型 (Ollama)</h3>
      <div className="grid grid-cols-2 gap-4">
        <Input id="ollamaUrl" label="Ollama 地址" placeholder="http://localhost:11434" {...register('ollamaUrl')} />
        <Input id="ollamaModel" label="本地模型名" placeholder="llama3:8b" {...register('ollamaModel')} />
      </div>

      <Button type="submit" size="sm">保存 AI 配置</Button>
    </form>
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
    },
  })

  useEffect(() => {
    reset({ defaultMode: String(parsed.editorPrefs.defaultMode || 'wysiwyg') })
  }, [parsed.editorPrefs.defaultMode, reset])

  const onSubmit = useCallback(async (data: { defaultMode: string }) => {
    await setSetting('editor_prefs', JSON.stringify(data))
    showToast('编辑器设置已保存')
  }, [setSetting, showToast])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h3 className="font-semibold text-gray-800">编辑器偏好</h3>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">默认编辑模式</label>
        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-bindle-400" {...register('defaultMode')}>
          {EDITOR_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
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
