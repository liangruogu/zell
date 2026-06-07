import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
        variant === 'default' && 'bg-bindle-100 text-bindle-700',
        variant === 'outline' && 'border border-gray-300 text-gray-600',
        className
      )}
    >
      {children}
    </span>
  )
}
