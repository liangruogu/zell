import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white border border-gray-200 rounded-lg shadow-sm',
        onClick && 'cursor-pointer hover:border-zell-300 hover:shadow-md transition-all',
        className
      )}
    >
      {children}
    </div>
  )
}
