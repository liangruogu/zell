import { useNavigate } from 'react-router-dom'
import type { Project } from '@/types/project'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { format } from '@/lib/format'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate()

  return (
    <Card onClick={() => navigate(`/project/${project.id}`)} className="p-5 space-y-3">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
        <Badge variant="outline">{format.relativeTime(project.updated_at)}</Badge>
      </div>
      {project.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>
      )}
      <p className="text-xs text-gray-400">创建于 {format.date(project.created_at)}</p>
    </Card>
  )
}
