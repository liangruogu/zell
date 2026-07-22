import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'

interface KnowledgeArticle { id: string; project_id: string; title: string; content: string; content_json: string; parent_id: string | null; sort_order: number; created_at: string; updated_at: string; deleted_at: string | null }

export const getArticle = tool({
  description: '获取指定知识库文章的完整 Markdown 内容。需要提供文章 ID（从 list_articles 或 search_knowledge 获取）。',
  parameters: z.object({ id: z.string().describe('文章ID') }),
  execute: async ({ id }) => {
    const article = await invoke<KnowledgeArticle>('get_knowledge_article', { id })
    return JSON.stringify({
      title: article.title,
      content: article.content,
      updated_at: article.updated_at,
    })
  },
})
