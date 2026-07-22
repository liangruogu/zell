import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface SearchResult { title: string; snippet: string; source_type: string; source_id: string; project_id: string; rank: number }

export const searchResources = tool({
  description: '搜索外部资源（PDF、Word文档、PPT、网页提取文本）的内容。用于查找项目文件中的信息。',
  parameters: z.object({ query: z.string().describe('搜索关键词') }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_resources', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的外部资源。'
    return JSON.stringify(results.map(r => ({
      id: r.source_id,
      name: r.title,
      type: r.source_type,
      snippet: r.snippet.replace(/<\/?b>/g, ''),
    })))
  },
})
