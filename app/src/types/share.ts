export interface ExternalLink {
  id: string
  project_id: string
  title: string
  url: string
  description: string
  link_type: string
  favicon: string
  ai_skill: string
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface InviteCode {
  id: string
  project_id: string
  code: string
  display_name: string
  role: string
  created_at: string
  expires_at: string | null
}
