import { tool } from 'ai'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'

interface ArticleSummary { id: string; title: string; preview: string; updated_at: string }

export const listArticles = tool({
  description: '列出知识库中所有文章的标题和内容预览。用于快速了解有哪些文档，判断需要深入阅读哪篇。',
  parameters: { type: 'object' as const, properties: {}, required: [], additionalProperties: false },
  execute: async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const summaries = await invoke<ArticleSummary[]>('get_article_summaries', { projectId: project.id })
    if (summaries.length === 0) return '知识库中还没有任何文章。'
    return JSON.stringify(summaries.map(s => ({
      id: s.id,
      title: s.title,
      preview: s.preview,
      updated_at: s.updated_at,
    })))
  },
})
