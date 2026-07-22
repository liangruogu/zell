import { tool } from 'ai'
import { z } from 'zod'
import { invoke } from '@tauri-apps/api/core'

interface ResourceContent { id: string; name: string; text: string; resource_type: string; url: string | null }

export const getResource = tool({
  description: '获取外部资源的完整提取文本。Type 为"file"（项目文件）或"link"（外部链接），id 从 search_resources 结果获取。',
  parameters: z.object({
    type: z.enum(['file', 'link']).describe('资源类型'),
    id: z.string().describe('资源ID'),
  }),
  execute: async ({ type, id }) => {
    const resource = await invoke<ResourceContent>('get_resource_content', { resourceType: type, id })
    return JSON.stringify({
      name: resource.name,
      text: resource.text || '(无提取文本)',
      type: resource.resource_type,
      url: resource.url,
    })
  },
})
