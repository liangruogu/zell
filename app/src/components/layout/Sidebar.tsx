import { NavLink, useLocation } from 'react-router-dom'
import {
  FolderOpen,
  BookOpen,
  PenTool,
  Link2,
  Settings,
  Plus,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { SettingsDialog } from '@/components/share/SettingsDialog'
import { CreateProjectDialog } from '@/components/project/CreateProjectDialog'

const navItems = [
  { to: '/', icon: FolderOpen, label: '项目', end: true },
]

export function Sidebar() {
  const location = useLocation()
  const { currentProject } = useProjectStore()
  const { collapsed, toggle } = useSidebarStore()
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const projectId = location.pathname.match(/\/project\/([^/]+)/)?.[1]

  const projectNavItems = projectId
    ? [
        { to: `/project/${projectId}`, icon: LayoutDashboard, label: '概览', end: true },
        { to: `/project/${projectId}/knowledge`, icon: BookOpen, label: '知识库' },
        { to: `/project/${projectId}/whiteboard`, icon: PenTool, label: '设计画布', disabled: true },
        { to: `/project/${projectId}/links`, icon: Link2, label: '外部资源', disabled: true },
      ]
    : []

  return (
    <>
      <aside
        className={cn(
          'bg-zell-50 border-r border-zell-100 flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-14' : 'w-56'
        )}
      >
        <div className="h-14 flex items-center px-3 border-b border-zell-100">
          <button
            onClick={toggle}
            className="p-1.5 rounded hover:bg-zell-200 transition-colors text-zell-500 shrink-0"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="flex-1 py-2 px-1.5 space-y-1.5 overflow-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors whitespace-nowrap overflow-hidden',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-zell-200 text-zell-800 font-medium'
                    : 'text-gray-600 hover:bg-zell-100'
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} />
              {!collapsed && item.label}
            </NavLink>
          ))}

          {currentProject && projectNavItems.length > 0 && (
            <>
              {!collapsed && (
                <div className="pt-3 pb-1 px-3 overflow-hidden">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">
                    {currentProject.name}
                  </p>
                </div>
              )}
              {collapsed && <div className="pt-2" />}
              {projectNavItems.map((item) => (
                item.disabled ? (
                  <span key={item.to}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-md text-sm whitespace-nowrap overflow-hidden',
                      collapsed && 'justify-center px-0',
                      'text-gray-300 cursor-not-allowed'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} />
                    {!collapsed && item.label}
                  </span>
                ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-2.5 py-2 rounded-md text-sm transition-colors whitespace-nowrap overflow-hidden',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-zell-200 text-zell-800 font-medium'
                        : 'text-gray-600 hover:bg-zell-100'
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={18} />
                  {!collapsed && item.label}
                </NavLink>
                )
              ))}
            </>
          )}
        </nav>

        <div className="p-2 border-t border-zell-100 space-y-1">
          <button
            onClick={() => setShowCreate(true)}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-2 text-sm font-medium text-white bg-zell-600 hover:bg-zell-700 rounded-md transition-colors whitespace-nowrap overflow-hidden',
              collapsed && 'justify-center px-0'
            )}
            title="新建项目"
          >
            <Plus size={16} className="shrink-0" />
            {!collapsed && <span className="truncate">新建项目</span>}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className={cn(
              'flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors whitespace-nowrap overflow-hidden',
              collapsed && 'justify-center px-0',
              'text-gray-500 hover:bg-zell-100'
            )}
            title="设置"
          >
            <Settings size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">设置</span>}
          </button>
        </div>
      </aside>

      <CreateProjectDialog open={showCreate} onOpenChange={setShowCreate} />
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  )
}
