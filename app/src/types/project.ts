export interface Project {
  id: string
  name: string
  description: string
  background: string
  icon: string
  settings: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type ProjectStatus = 'seedling' | 'sprint' | 'polish' | 'alert'

export const PROJECT_STATUS: { value: ProjectStatus; label: string; color: string; desc: string }[] = [
  { value: 'seedling', label: '萌芽', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', desc: '项目起步，初步发展中' },
  { value: 'sprint',   label: '冲刺', color: 'bg-blue-100 text-blue-700 border-blue-200',       desc: '快速推进中' },
  { value: 'polish',   label: '打磨', color: 'bg-violet-100 text-violet-700 border-violet-200',  desc: '临近结束，细微修改' },
  { value: 'alert',    label: '预警', color: 'bg-amber-100 text-amber-700 border-amber-200',     desc: '推进过慢，需加速' },
]

export function getProjectStatus(status?: string): typeof PROJECT_STATUS[number] | undefined {
  return PROJECT_STATUS.find((s) => s.value === status)
}

export interface ProjectSettings {
  status?: ProjectStatus
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
