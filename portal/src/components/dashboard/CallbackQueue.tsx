import { Link } from 'react-router-dom'
import { PhoneCallback, AlertCircle, Clock, ArrowRight, CheckCircle } from 'lucide-react'
import { cn, formatRelativeTime, formatPhone } from '@/lib/utils'
import type { Callback } from '@/types/database'

interface CallbackQueueProps {
  callbacks: Callback[]
  loading?: boolean
  onMarkComplete?: (id: string) => void
  isMarkingComplete?: boolean
}

const priorityStyles = {
  low: 'border-l-slate-400',
  normal: 'border-l-primary-500',
  high: 'border-l-warning-500',
  urgent: 'border-l-error-500',
}

const priorityLabels = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

const priorityBadgeStyles = {
  low: 'badge-neutral',
  normal: 'badge-info',
  high: 'badge-warning',
  urgent: 'badge-error',
}

export function CallbackQueue({
  callbacks,
  loading = false,
  onMarkComplete,
  isMarkingComplete = false,
}: CallbackQueueProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Callback Queue</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-48 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-24" />
                </div>
                <div className="h-8 bg-slate-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sort by priority (urgent first) then by creation time
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
  const sortedCallbacks = [...callbacks].sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const urgentCount = callbacks.filter(c => c.priority === 'urgent').length

  return (
    <div className="card">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Callback Queue</h2>
          {urgentCount > 0 && (
            <span className="badge-error flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {urgentCount} urgent
            </span>
          )}
        </div>
        <Link
          to="/callbacks"
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {sortedCallbacks.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-success-300 mx-auto mb-3" />
          <p className="text-slate-500">No pending callbacks</p>
          <p className="text-sm text-slate-400 mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {sortedCallbacks.slice(0, 5).map((callback) => (
            <div
              key={callback.id}
              className={cn(
                'p-4 border-l-4 hover:bg-slate-50 transition-colors',
                priorityStyles[callback.priority]
              )}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">
                      {callback.customer_name || formatPhone(callback.customer_phone)}
                    </span>
                    <span className={cn('badge', priorityBadgeStyles[callback.priority])}>
                      {priorityLabels[callback.priority]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mb-1 line-clamp-2">
                    {callback.reason}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Clock className="w-4 h-4" />
                    <span>{formatRelativeTime(callback.created_at)}</span>
                    {callback.attempts > 0 && (
                      <span className="text-slate-400">
                        · {callback.attempts} attempt{callback.attempts !== 1 && 's'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {onMarkComplete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        onMarkComplete(callback.id)
                      }}
                      disabled={isMarkingComplete}
                      className={cn(
                        'btn-secondary text-sm py-1.5 px-3',
                        isMarkingComplete && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      {isMarkingComplete ? 'Completing...' : 'Complete'}
                    </button>
                  )}
                  <Link
                    to={`/callbacks/${callback.id}`}
                    className="btn-ghost text-sm py-1.5 px-3"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {sortedCallbacks.length > 5 && (
        <div className="p-4 text-center border-t border-slate-200">
          <Link
            to="/callbacks"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View {sortedCallbacks.length - 5} more callbacks
          </Link>
        </div>
      )}
    </div>
  )
}
