import { logger } from '@/lib/logger'

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
  appearance?: {
    theme?: string
  }
  sync?: {
    policy?: string
    intervalHours?: string
  }
  serverUrl?: string
  token?: string
  role?: 'owner' | 'member'
  collabEnabled?: boolean
  displayName?: string
  serverKey?: string
}

export interface ProjectConfig {
  appearance?: { theme?: string }
  sync?: { policy?: string; intervalHours?: string }
}

export function extractProjectConfig(ps: ProjectSettings): ProjectConfig {
  const cfg: ProjectConfig = {}
  if (ps.appearance) cfg.appearance = ps.appearance
  if (ps.sync) cfg.sync = ps.sync
  return cfg
}

export function applyProjectConfig(settings: string, config: ProjectConfig): string {
  const ps = parseProjectSettings(settings)
  if (config.appearance) ps.appearance = { ...ps.appearance, ...config.appearance }
  if (config.sync) ps.sync = { ...ps.sync, ...config.sync }
  return stringifyProjectSettings(ps)
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
  } catch (e) {
    logger.error('Failed to parse project settings', e)
    return {}
  }
}

export function stringifyProjectSettings(ps: ProjectSettings): string {
  return JSON.stringify(ps)
}
