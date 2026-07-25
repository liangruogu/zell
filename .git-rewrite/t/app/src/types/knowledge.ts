export interface KnowledgeArticle {
  id: string
  project_id: string
  title: string
  content: string
  content_json: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}
