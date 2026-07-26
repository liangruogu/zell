import { useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useSettingsStore } from '@/stores/settingsStore'
import { useForm } from 'react-hook-form'

interface SettingsFormData {
  textProvider: string
  textModel: string
  textApiKey: string
  imageProvider: string
  imageModel: string
  ollamaUrl: string
  ollamaModel: string
  serverUrl: string
  editorFontSize: string
  editorDefaultMode: string
}

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

export default function SettingsPage() {
  const { settings, loadSettings, setSetting } = useSettingsStore()

  const { register, handleSubmit, reset } = useForm<SettingsFormData>()

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    const aiConfig = settings['ai_config']
    const serverUrl = settings['server_url']
    const editorPrefs = settings['editor_prefs']
    let editorData = { editorFontSize: '16', editorDefaultMode: 'wysiwyg' }
    try {
      if (editorPrefs) {
        const parsed = JSON.parse(editorPrefs)
        editorData = {
          editorFontSize: parsed.fontSize || '16',
          editorDefaultMode: parsed.defaultMode || 'wysiwyg',
        }
      }
    } catch { /* ignore */ }
    try {
      const ai = aiConfig ? JSON.parse(aiConfig) : {}
      reset({
        textProvider: ai?.text_provider || 'openai',
        textModel: ai?.text_model || 'gpt-4o',
        textApiKey: ai?.text_api_key || '',
        imageProvider: ai?.image_provider || 'openai',
        imageModel: ai?.image_model || 'dall-e-3',
        ollamaUrl: ai?.local_ollama_url || 'http://localhost:11434',
        ollamaModel: ai?.local_ollama_model || 'llama3:8b',
        serverUrl: serverUrl || '',
        ...editorData,
      })
    } catch {
      // ignore parse errors
    }
  }, [settings, reset])

  const onSubmit = async (data: SettingsFormData) => {
    const aiConfig = {
      text_provider: data.textProvider,
      text_model: data.textModel,
      text_api_key: data.textApiKey,
      image_provider: data.imageProvider,
      image_model: data.imageModel,
      local_ollama_url: data.ollamaUrl,
      local_ollama_model: data.ollamaModel,
      fallback_to_local: true,
    }
    const editorPrefs = {
      fontSize: data.editorFontSize,
      defaultMode: data.editorDefaultMode,
    }
    await setSetting('ai_config', JSON.stringify(aiConfig))
    await setSetting('server_url', data.serverUrl)
    await setSetting('editor_prefs', JSON.stringify(editorPrefs))
    alert('设置已保存')
  }

  return (
    <AppShell>
      <Header title="设置" backTo="/" />
      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4">AI 服务配置</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="textProvider"
                label="文本生成服务商"
                {...register('textProvider')}
              />
              <Input
                id="textModel"
                label="文本模型"
                placeholder="gpt-4o"
                {...register('textModel')}
              />
              <div className="col-span-2">
                <Input
                  id="textApiKey"
                  label="API Key"
                  type="password"
                  placeholder="sk-..."
                  {...register('textApiKey')}
                />
              </div>
              <Input
                id="imageProvider"
                label="图片生成服务商"
                {...register('imageProvider')}
              />
              <Input
                id="imageModel"
                label="图片模型"
                placeholder="dall-e-3"
                {...register('imageModel')}
              />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4">本地模型 (Ollama)</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="ollamaUrl"
                label="Ollama 地址"
                placeholder="http://localhost:11434"
                {...register('ollamaUrl')}
              />
              <Input
                id="ollamaModel"
                label="本地模型名"
                placeholder="llama3:8b"
                {...register('ollamaModel')}
              />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4">团队服务器</h3>
            <Input
              id="serverUrl"
              label="服务器地址"
              placeholder="https://zell.example.com"
              {...register('serverUrl')}
            />
            <p className="text-xs text-gray-400 mt-1">
              留空使用本地模式；填写后连接自托管后端实现团队协作
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-4">编辑器偏好</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">默认字号</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-zell-400"
                  {...register('editorFontSize')}
                >
                  {FONT_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">默认编辑模式</label>
                <select
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-zell-400"
                  {...register('editorDefaultMode')}
                >
                  {EDITOR_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">保存设置</Button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
