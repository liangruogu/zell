import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectCard } from '@/components/project/ProjectCard'
import { AppShell } from '@/components/layout/AppShell'
import { Header } from '@/components/layout/Header'
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'
import { Button } from '@/components/ui/Button'

export default function HomePage() {
  const { projects, loading, fetchProjects } = useProjectStore()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  return (
    <AppShell>
      <Header
        title="我的项目"
        subtitle={`共 ${projects.length} 个项目`}
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm">
            新建项目
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            加载中...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <FolderOpen size={48} strokeWidth={1} />
            <p className="text-lg">还没有项目</p>
            <p className="text-sm">创建一个项目来开始整理你的资料和上下文</p>
            <Button onClick={() => setShowCreate(true)} className="mt-2">
              创建第一个项目
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} />
    </AppShell>
  )
}
