import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { EmojiPicker } from '@/components/project/EmojiPicker'
import { useProjectStore } from '@/stores/projectStore'
import { useNavigate } from 'react-router-dom'
import { PROJECT_STATUS, stringifyProjectSettings, type ProjectStatus } from '@/types/project'
import { cn } from '@/lib/utils'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const createProject = useProjectStore((s) => s.createProject)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [background, setBackground] = useState('')
  const [icon, setIcon] = useState('📁')
  const [status, setStatus] = useState<ProjectStatus>('seedling')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    const settings = stringifyProjectSettings({ status })
    const project = await createProject({ name: name.trim(), description, background, icon, settings })
    setName(''); setDescription(''); setBackground(''); setIcon('📁'); setStatus('seedling')
    onOpenChange(false)
    navigate(`/project/${project.id}/knowledge`)
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="新建项目"
      description="创建一个新项目，填写基本信息后将自动建立AI 上下文索引。">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">图标</label>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">项目状态</label>
          <div className="flex gap-2 flex-wrap">
            {PROJECT_STATUS.map((s) => (
              <button key={s.value} type="button"
                onClick={() => setStatus(s.value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  status === s.value ? s.color + ' ring-1 ring-offset-1' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                )}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">项目名称 *</label>
          <input className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zell-400"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="输入项目名称" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">项目描述</label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简要描述项目内容" />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">项目背景</label>
          <Textarea rows={5} value={background} onChange={(e) => setBackground(e.target.value)}
            placeholder="详细描述项目背景信息，将作为 AI 上下文自动注入" />
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} disabled={!name.trim() || submitting}>
            {submitting ? '创建中...' : '创建项目'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
