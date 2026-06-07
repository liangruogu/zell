import { useNavigate } from 'react-router-dom'
import type { Project } from '@/types/project'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { format } from '@/lib/format'
import { parseProjectSettings, PROJECT_STATUS } from '@/types/project'

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate()
  const ps = parseProjectSettings(project.settings)
  const statusInfo = PROJECT_STATUS.find((s) => s.value === (ps.status || 'seedling'))

  return (
    <Card onClick={() => navigate(`/project/${project.id}/knowledge`)} className="p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {project.icon && <span className="text-xl shrink-0">{project.icon}</span>}
          <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
        </div>
        <Badge variant="outline">{format.relativeTime(project.updated_at)}</Badge>
      </div>
      {project.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{project.description}</p>
      )}
      <div className="flex items-center gap-2 text-xs">
        {statusInfo && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        )}
        <span className="text-gray-400">创建于 {format.date(project.created_at)}</span>
      </div>
    </Card>
  )
}
