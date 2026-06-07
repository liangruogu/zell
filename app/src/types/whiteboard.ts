export interface Whiteboard {
  id: string
  project_id: string
  name: string
  snapshot: number[] | null
  update_log: number[] | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}
