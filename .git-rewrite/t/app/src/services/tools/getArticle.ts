import { tool } from 'ai'
import { invoke } from '@tauri-apps/api/core'

interface KnowledgeArticle { id: string; project_id: string; title: string; content: string; created_at: string; updated_at: string }

export const getArticle = tool({
  description: '获取指定知识库文章的完整 Markdown 内容。需要提供文章 ID（从 list_articles 或 search_knowledge 获取）。',
  parameters: {
    type: 'object' as const,
    properties: { id: { type: 'string', description: '文章ID' } },
    required: ['id'],
    additionalProperties: false,
  },
  execute: async ({ id }: { id: string }) => {
    const article = await invoke<KnowledgeArticle>('get_knowledge_article', { id })
    return JSON.stringify({
      title: article.title,
      content: article.content,
      updated_at: article.updated_at,
    })
  },
})
