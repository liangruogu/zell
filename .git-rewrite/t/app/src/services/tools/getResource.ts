import { tool } from 'ai'
import { invoke } from '@tauri-apps/api/core'

interface ResourceContent { id: string; name: string; text: string; resource_type: string; url: string | null }

export const getResource = tool({
  description: '获取外部资源的完整提取文本。type 为 "file"（项目文件）或 "link"（外部链接），id 从 search_resources 结果获取。',
  parameters: {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['file', 'link'], description: '资源类型' },
      id: { type: 'string', description: '资源ID' },
    },
    required: ['type', 'id'],
    additionalProperties: false,
  },
  execute: async ({ type, id }: { type: string; id: string }) => {
    const resource = await invoke<ResourceContent>('get_resource_content', { resourceType: type, id })
    return JSON.stringify({
      name: resource.name,
      text: resource.text || '(无提取文本)',
      type: resource.resource_type,
      url: resource.url,
    })
  },
})
