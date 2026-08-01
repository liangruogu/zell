// @ts-nocheck
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { AgentConfig } from '@/services/core/agentRunner'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from '@/stores/projectStore'
import { logger } from '@/lib/logger'

interface ArticleSummary { id: string; title: string; preview: string; updated_at: string }
interface SearchResult { title: string; snippet: string; source_type: string; source_id: string; rank: number }

const getProjectContext = tool(
  async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    let status = '未设置'
    try { const s = JSON.parse(project.settings || '{}'); if (s.status) status = s.status } catch (e) { logger.error('Failed to parse project settings', e) }
    return JSON.stringify({ name: project.name, description: project.description, background: project.background, status })
  },
  { name: 'get_project_context', description: '获取当前项目的基本信息和背景' }
)

const listArticles = tool(
  async () => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const list = await invoke<ArticleSummary[]>('get_article_summaries', { projectId: project.id })
    if (list.length === 0) return '知识库中还没有任何文章。'
    return JSON.stringify(list.map(s => ({ id: s.id, title: s.title, preview: s.preview })))
  },
  { name: 'list_articles', description: '列出知识库中所有文章的标题和内容预览' }
)

const searchKnowledge = tool(
  async ({ query }: { query: string }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_knowledge', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的知识库文章。'
    return JSON.stringify(results.map(r => ({ id: r.source_id, title: r.title, snippet: r.snippet.replace(/<\/?b>/g, '') })))
  },
  { name: 'search_knowledge', description: '全文搜索知识库文章内容', schema: z.object({ query: z.string().describe('搜索关键词') }) }
)

const searchResources = tool(
  async ({ query }: { query: string }) => {
    const project = useProjectStore.getState().currentProject
    if (!project) return '当前没有打开的项目。'
    const results = await invoke<SearchResult[]>('search_resources', { projectId: project.id, query, limit: 5 })
    if (results.length === 0) return '未找到匹配的外部资源。'
    return JSON.stringify(results.map(r => ({ id: r.source_id, name: r.title, type: r.source_type, snippet: r.snippet.replace(/<\/?b>/g, '') })))
  },
  { name: 'search_resources', description: '搜索外部资源（PDF、Word文档、PPT、网页提取文本）', schema: z.object({ query: z.string().describe('搜索关键词') }) }
)

interface KnowledgeArticle { id: string; title: string; content: string; updated_at: string }
const getArticle = tool(
  async ({ id }: { id: string }) => {
    const article = await invoke<KnowledgeArticle>('get_knowledge_article', { id })
    return JSON.stringify({ title: article.title, content: article.content })
  },
  { name: 'get_article', description: '获取指定知识库文章的完整内容', schema: z.object({ id: z.string().describe('文章ID') }) }
)

interface ResourceContent { id: string; name: string; text: string; resource_type: string; url: string | null }
const getResource = tool(
  async ({ type, id }: { type: string; id: string }) => {
    const resource = await invoke<ResourceContent>('get_resource_content', { resourceType: type, id })
    return JSON.stringify({ name: resource.name, text: resource.text || '(无提取文本)', type: resource.resource_type, url: resource.url })
  },
  { name: 'get_resource', description: '获取外部资源的完整提取文本', schema: z.object({ type: z.enum(['file', 'link']).describe('资源类型'), id: z.string().describe('资源ID') }) }
)

export const KNOWLEDGE_SYSTEM_PROMPT = `你是一个项目知识库助手，运行在 Zell 应用中。你有以下能力：
- 获取项目背景信息（get_project_context）
- 浏览所有文章列表（list_articles）：返回标题和内容预览
- 搜索知识库文章（search_knowledge）：关键词全文搜索
- 搜索外部资源（search_resources）：搜索 PDF、Word、PPT、网页等文件的提取文本
- 读取完整文章内容（get_article）：需要提供文章 ID
- 获取外部资源详细内容（get_resource）：需要提供资源类型和 ID

使用原则：
1. 项目信息已预注入到系统提示中，先查看已有上下文，无需调用 get_project_context 和 list_articles
2. 需要查找具体内容时，使用 search_knowledge 或 search_resources
3. 拿到搜索结果后，根据片段判断是否需要 get_article 或 get_resource 获取完整内容
4. 回答时引用具体来源（文章标题、资源名称）
5. 用中文回答，简洁准确
6. 如果找不到相关信息，诚实告知并建议用户补充资料`

export function createKnowledgeAgentConfig(modelId?: string): AgentConfig {
  return {
    systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
    tools: [getProjectContext, listArticles, searchKnowledge, searchResources, getArticle, getResource],
    modelId: modelId || '',
  }
}
