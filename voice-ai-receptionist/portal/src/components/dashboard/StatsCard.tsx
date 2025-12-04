import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  loading?: boolean
}

export function StatsCard({
  title,
  value,
  change,
  changeLabel = 'vs last period',
  icon,
  trend,
  loading = false,
}: StatsCardProps) {
  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4" />
    return <Minus className="w-4 h-4" />
  }

  const getTrendColor = () => {
    if (trend === 'up') return 'text-success-600 bg-success-50'
    if (trend === 'down') return 'text-error-600 bg-error-50'
    return 'text-slate-600 bg-slate-50'
  }

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-slate-200 rounded w-24" />
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
        </div>
        <div className="mt-4">
          <div className="h-8 bg-slate-200 rounded w-20" />
        </div>
        <div className="mt-2">
          <div className="h-4 bg-slate-200 rounded w-32" />
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6 card-hover">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        {icon && (
          <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4">
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
      </div>

      {change !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              getTrendColor()
            )}
          >
            {getTrendIcon()}
            {Math.abs(change)}%
          </span>
          <span className="text-sm text-slate-500">{changeLabel}</span>
        </div>
      )}
    </div>
  )
}
