import { useEffect, useState, useCallback } from 'react'
import { X, Palette, Bot, FileText, Server, CheckCircle, Plus, Trash2, Loader2, Link2, ChevronDown, ChevronRight, Pencil, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSettingsStore } from '@/stores/settingsStore'
import { useForm } from 'react-hook-form'
import { cn } from '@/lib/utils'
import { testProviderConnection, type AIProvider } from '@/services/aiService'
import { ServerManager } from './ServerManager'
import { invoke } from '@tauri-apps/api/core'
import { appDataDir, join } from '@tauri-apps/api/path'
import { readTextFile, writeTextFile, remove, readDir, rename, mkdir, exists } from '@tauri-apps/plugin-fs'

type SettingsCategory = 'appearance' | 'ai' | 'editor' | 'server' | 'sync'

const CATEGORIES: { key: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
  { key: 'ai', label: 'AI 服务', icon: <Bot size={16} /> },
  { key: 'editor', label: '编辑器', icon: <FileText size={16} /> },
  { key: 'server', label: '服务器', icon: <Server size={16} /> },
  { key: 'sync', label: '资源同步', icon: <Link2 size={16} /> },
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
                  ? 'bg-white text-zell-700 font-medium border-r-2 border-zell-500 -mr-px'
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
const DEFAULT_THEMES = [
  { value: 'zell', label: 'Zell' },
  { value: 'github', label: 'GitHub' },
  { value: 'report', label: 'Report' },
]
const DEFAULT_THEME_KEYS = new Set(DEFAULT_THEMES.map(t => t.value))

interface CustomTheme { name: string; label: string }

function AppearanceSettings({ parsed, setSetting, showToast }: {
  parsed: ReturnType<typeof parseSettings>
  setSetting: (k: string, v: string) => Promise<void>
  showToast: (msg: string) => void
}) {
  const showToolbarVal = parsed.appearance.showToolbar !== false
  const currentTheme = String(parsed.appearance.theme || 'zell')
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const [newName, setNewName] = useState('')
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const themesDir = useCallback(async () => {
    const dir = await appDataDir()
    return join(dir, 'themes')
  }, [])

  const ensureThemesDir = useCallback(async () => {
    const dir = await themesDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
  }, [themesDir])

  const loadCustomThemes = useCallback(async () => {
    try {
      await ensureThemesDir()
      const dir = await themesDir()
      const entries = await readDir(dir)
      const themes: CustomTheme[] = []
      for (const entry of entries) {
        if (entry.name && entry.name.endsWith('.css')) {
          const name = entry.name.replace(/\.css$/, '')
          if (!DEFAULT_THEME_KEYS.has(name)) {
            themes.push({ name, label: name })
          }
        }
      }
      setCustomThemes(themes)
    } catch { setCustomThemes([]) }
  }, [themesDir])

  useEffect(() => { loadCustomThemes() }, [loadCustomThemes])

  const createTheme = useCallback(async () => {
    const name = newName.trim()
    if (!name) { showToast('请输入主题名称'); return }
    if (DEFAULT_THEME_KEYS.has(name)) { showToast('不能使用默认主题名称'); return }
    if (customThemes.some(t => t.name === name)) { showToast('主题名称已存在'); return }
    try {
      await ensureThemesDir()
      const dir = await themesDir()
      const filePath = await join(dir, `${name}.css`)
      await writeTextFile(filePath, `/* ${name} 自定义主题 */\n.zell-prose {\n  \n}\n`)
      await invoke('open_in_system', { filePath })
      setNewName('')
      await loadCustomThemes()
      showToast(`已创建主题 "${name}"`)
    } catch (e) { showToast(`创建失败: ${e}`) }
  }, [newName, customThemes, themesDir, showToast, loadCustomThemes])

  const editTheme = useCallback(async (name: string) => {
    try {
      const dir = await themesDir()
      const filePath = await join(dir, `${name}.css`)
      await invoke('open_in_system', { filePath })
    } catch (e) { showToast(`打开失败: ${e}`) }
  }, [themesDir, showToast])

  const deleteTheme = useCallback(async (name: string) => {
    if (DEFAULT_THEME_KEYS.has(name)) return
    try {
      const dir = await themesDir()
      const filePath = await join(dir, `${name}.css`)
      await remove(filePath)
      if (currentTheme === name) {
        await setSetting('appearance', JSON.stringify({ ...parsed.appearance, theme: 'zell' }))
        document.documentElement.removeAttribute('data-zell-custom-theme')
        document.documentElement.setAttribute('data-zell-theme', 'zell')
      }
      await loadCustomThemes()
      showToast('主题已删除')
    } catch (e) { showToast(`删除失败: ${e}`) }
  }, [themesDir, currentTheme, parsed.appearance, setSetting, showToast, loadCustomThemes])

  const renameTheme = useCallback(async (oldName: string) => {
    const newNameVal = renameValue.trim()
    if (!newNameVal || newNameVal === oldName) { setRenameTarget(null); return }
    if (DEFAULT_THEME_KEYS.has(newNameVal)) { showToast('不能使用默认主题名称'); return }
    try {
      const dir = await themesDir()
      await rename(await join(dir, `${oldName}.css`), await join(dir, `${newNameVal}.css`))
      if (currentTheme === oldName) {
        await setSetting('appearance', JSON.stringify({ ...parsed.appearance, theme: newNameVal }))
      }
      setRenameTarget(null)
      await loadCustomThemes()
      showToast(`已重命名为 "${newNameVal}"`)
    } catch (e) { showToast(`重命名失败: ${e}`) }
  }, [renameValue, themesDir, currentTheme, parsed.appearance, setSetting, showToast, loadCustomThemes])

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      showToolbar: showToolbarVal,
    },
  })

  useEffect(() => {
    reset({
      showToolbar: parsed.appearance.showToolbar !== false,
    })
  }, [parsed.appearance.showToolbar, reset])

  const onSubmit = useCallback(async (data: { showToolbar: boolean }) => {
    await setSetting('appearance', JSON.stringify({
      ...parsed.appearance,
      showToolbar: data.showToolbar,
      theme: currentTheme,
    }))
    showToast('外观设置已保存')
  }, [setSetting, showToast, parsed.appearance, currentTheme])

  const handleThemeChange = useCallback(async (theme: string) => {
    const updated = { ...parsed.appearance, theme }
    await setSetting('appearance', JSON.stringify(updated))
    if (DEFAULT_THEME_KEYS.has(theme)) {
      document.documentElement.removeAttribute('data-zell-custom-theme')
      document.documentElement.setAttribute('data-zell-theme', theme)
    } else {
      document.documentElement.removeAttribute('data-zell-theme')
      try {
        const dir = await themesDir()
        const filePath = await join(dir, `${theme}.css`)
        const css = await readTextFile(filePath)
        document.documentElement.setAttribute('data-zell-custom-theme', theme)
        let styleEl = document.getElementById('zell-custom-theme') as HTMLStyleElement | null
        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.id = 'zell-custom-theme'
          document.head.appendChild(styleEl)
        }
        styleEl.textContent = css
      } catch {
        document.documentElement.removeAttribute('data-zell-custom-theme')
      }
    }
    showToast('主题已切换')
  }, [parsed.appearance, setSetting, showToast, themesDir])

  const allThemes = [...DEFAULT_THEMES, ...customThemes]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <h3 className="font-semibold text-gray-800">外观设置</h3>

      {/* Theme selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Markdown 主题</label>
        <div className="flex items-center gap-2">
          <select
            value={currentTheme}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-zell-400 appearance-none cursor-pointer"
          >
            <optgroup label="默认主题">
              {DEFAULT_THEMES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            {customThemes.length > 0 && (
              <optgroup label="自定义主题">
                {customThemes.map(t => (
                  <option key={t.name} value={t.name}>{t.label}</option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            type="button"
            onClick={() => setNewName(newName ? '' : '_')}
            className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-zell-700 bg-zell-50 hover:bg-zell-100 border border-zell-200 rounded-md transition-colors shrink-0"
          >
            <Plus size={14} />
            新建
          </button>
        </div>

        {/* New theme input */}
        {newName !== '' && (
          <div className="flex items-center gap-2 pt-1">
            <input
              value={newName === '_' ? '' : newName}
              onChange={(e) => setNewName(e.target.value || '_')}
              onKeyDown={(e) => { if (e.key === 'Enter') createTheme(); if (e.key === 'Escape') setNewName('') }}
              placeholder="主题名称"
              className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400"
              autoFocus
            />
            <button
              type="button"
              onClick={createTheme}
              className="px-3 py-1.5 text-xs font-medium text-white bg-zell-500 hover:bg-zell-600 rounded-md transition-colors shrink-0"
            >
              创建
            </button>
          </div>
        )}

        {/* Custom theme management */}
        {customThemes.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {customThemes.map(t => (
              <div key={t.name} className="flex items-center gap-1.5 pl-1">
                {renameTarget === t.name ? (
                  <>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renameTheme(t.name); if (e.key === 'Escape') setRenameTarget(null) }}
                      className="flex-1 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-zell-400"
                      autoFocus
                      placeholder="新名称"
                    />
                    <button type="button" onClick={() => renameTheme(t.name)} className="px-2 py-0.5 text-xs text-zell-600 hover:bg-zell-50 rounded">确定</button>
                    <button type="button" onClick={() => setRenameTarget(null)} className="px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-50 rounded">取消</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-xs text-gray-500 truncate">{t.label}</span>
                    <button type="button" onClick={() => editTheme(t.name)} className="p-0.5 text-gray-400 hover:text-zell-600 rounded" title="编辑CSS">
                      <ExternalLink size={13} />
                    </button>
                    <button type="button" onClick={() => { setRenameTarget(t.name); setRenameValue(t.name) }} className="p-0.5 text-gray-400 hover:text-zell-600 rounded" title="重命名">
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => deleteTheme(t.name)} className="p-0.5 text-gray-400 hover:text-red-500 rounded" title="删除">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar toggle */}
      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-zell-500" {...register('showToolbar')} />
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
              className="text-zell-500"
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
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400"
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
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">模型</label>
                <input
                  value={p.model}
                  onChange={(e) => updateProvider(p.id, 'model', e.target.value)}
                  placeholder="deepseek-chat"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-zell-400"
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
      typewriterMode: String(parsed.editorPrefs.typewriterMode || 'off'),
    },
  })

  useEffect(() => {
    reset({
      defaultMode: String(parsed.editorPrefs.defaultMode || 'wysiwyg'),
      imageStorage: String(parsed.editorPrefs.imageStorage || 'base64'),
      typewriterMode: String(parsed.editorPrefs.typewriterMode || 'off'),
    })
  }, [parsed.editorPrefs.defaultMode, parsed.editorPrefs.imageStorage, parsed.editorPrefs.typewriterMode, reset])

  const onSubmit = useCallback(async (data: { defaultMode: string; imageStorage: string; typewriterMode: string }) => {
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
        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400" {...register('defaultMode')}>
          {EDITOR_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">图片存储方式</label>
        <select className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400" {...register('imageStorage')}>
          {IMAGE_STORAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">Base64 模式：图片直接嵌入 Markdown<br />文件模式：图片保存为独立文件，Markdown 仅存引用</p>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="typewriterMode" className="w-4 h-4 accent-zell-500" {...register('typewriterMode')} />
        <label htmlFor="typewriterMode" className="text-sm text-gray-700 cursor-pointer">打字机模式（光标始终居中）</label>
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
            policy === opt.value ? 'border-zell-300 bg-zell-50' : 'border-gray-200 hover:bg-gray-50'
          )}>
            <input
              type="radio"
              name="syncPolicy"
              checked={policy === opt.value}
              onChange={() => setPolicy(opt.value)}
              className="mt-0.5 text-zell-500"
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
                    className="w-16 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-zell-400"
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
