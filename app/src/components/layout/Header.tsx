import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  subtitle?: string
  backTo?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, backTo, actions }: HeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-gray-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            title="返回"
          >
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
        )}
        <div>
          <h2 className="font-semibold text-gray-800">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}
