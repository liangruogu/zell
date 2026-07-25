import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface SearchResult { title: string; snippet: string; source_type: string; source_id: string; project_id: string; rank: number }

export const searchKnowledge = tool({
  description: '全文搜索知识库文章内容。根据关键词返回匹配的文章标题和内容片段。适合查找特定主题或概念。',
  parameters: z.object({ query: z.string().describe('搜索关键词') }),
  execute: async ({ query }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_knowledge', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的知识库文章。可以尝试 search_resources 搜索外部资源。'
    return JSON.stringify(results.map(r => ({
      id: r.source_id,
      title: r.title,
      snippet: r.snippet.replace(/<\/?b>/g, ''),
    })))
  },
})
