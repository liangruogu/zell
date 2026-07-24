export interface Whiteboard {
  id: string
  project_id: string
  name: string
  snapshot: string | null
  update_log: number[] | null
  wb_type: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
