import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import type { Project } from '@/types/project'

const projectSchema = z.object({
  name: z.string().min(1, '项目名称不能为空').max(200),
  description: z.string().max(500).optional(),
  background: z.string().max(5000).optional(),
  icon: z.string().max(10).optional(),
})

type ProjectFormData = z.infer<typeof projectSchema>

interface ProjectFormProps {
  defaultValues?: Partial<Project>
  onSubmit: (data: ProjectFormData) => Promise<void>
  submitLabel?: string
}

export function ProjectForm({ defaultValues, onSubmit, submitLabel = '保存' }: ProjectFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      description: defaultValues?.description || '',
      background: defaultValues?.background || '',
      icon: defaultValues?.icon || '',
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        id="name"
        label="项目名称 *"
        placeholder="输入项目名称"
        error={errors.name?.message}
        {...register('name')}
      />
      <Input
        id="icon"
        label="图标"
        placeholder="项目图标"
        error={errors.icon?.message}
        {...register('icon')}
      />
      <Textarea
        id="description"
        label="项目描述"
        placeholder="简要描述项目内容"
        error={errors.description?.message}
        rows={3}
        {...register('description')}
      />
      <Textarea
        id="background"
        label="项目背景"
        placeholder="详细描述项目背景信息，将作为 AI 上下文自动注入"
        error={errors.background?.message}
        rows={5}
        {...register('background')}
      />
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
