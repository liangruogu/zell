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
  sync_status: string
  last_synced_at: string | null
  last_snapshot: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ProjectFile {
  id: string
  project_id: string
  file_name: string
  original_name: string
  file_type: string
  file_size: number
  extracted_text: string
  description: string
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
