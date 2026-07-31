export interface Project {
  id: string
  name: string
  description: string
  background: string
  settings: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectSettings {
  ai?: {
    text_provider?: string
    text_model?: string
    text_api_key?: string
    image_provider?: string
    image_model?: string
    local_ollama_url?: string
    local_ollama_model?: string
    fallback_to_local?: boolean
  }
  publish?: PublishSettings
  serverUrl?: string
  token?: string
  role?: 'owner' | 'member'
  collabEnabled?: boolean
  displayName?: string
  serverKey?: string
}

export interface PublishSettings {
  enabled: boolean
  wiki: string[]
  ppt: string[]
  ui: string[]
  mood: string[]
}

export function parseProjectSettings(settings: string): ProjectSettings {
  try {
    return JSON.parse(settings)
  } catch {
    return {}
  }
}

export function stringifyProjectSettings(ps: ProjectSettings): string {
  return JSON.stringify(ps)
}
