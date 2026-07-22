import { tool } from 'ai'
import { useProjectStore } from '@/stores/projectStore'

export const getProjectContext = tool({
  description: '获取当前项目的基本信息和背景。返回项目名称、背景描述和状态。',
  parameters: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    let status = '未设置'
    try {
      const s = JSON.parse(project.settings || '{}')
      if (s.status) status = s.status
    } catch { /* ignore */ }
    return JSON.stringify({
      name: project.name,
      description: project.description,
      background: project.background,
      status,
    })
  },
})
