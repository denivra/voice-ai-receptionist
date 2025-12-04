import { Link } from 'react-router-dom'
import { Phone, PhoneOutgoing, PhoneIncoming, ArrowRight } from 'lucide-react'
import { cn, formatRelativeTime, formatPhone, formatDuration } from '@/lib/utils'
import type { CallLog } from '@/types/database'

interface RecentCallsProps {
  calls: CallLog[]
  loading?: boolean
  onCallClick?: (call: CallLog) => void
}

const outcomeStyles = {
  completed: 'badge-success',
  transferred: 'badge-info',
  failed: 'badge-error',
  missed: 'badge-warning',
}

const outcomeLabels = {
  completed: 'Completed',
  transferred: 'Transferred',
  failed: 'Failed',
  missed: 'Missed',
}

export function RecentCalls({ calls, loading = false, onCallClick }: RecentCallsProps) {
  if (loading) {
    return (
      <div className="card">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Recent Calls</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-200 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-24" />
                </div>
                <div className="h-6 bg-slate-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Recent Calls</h2>
        <Link
          to="/calls"
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {calls.length === 0 ? (
        <div className="p-8 text-center">
          <Phone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No recent calls</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {calls.map((call) => {
            const content = (
              <>
                {/* Direction icon */}
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    call.direction === 'inbound'
                      ? 'bg-primary-50 text-primary-600'
                      : 'bg-slate-100 text-slate-600'
                  )}
                >
                  {call.direction === 'inbound' ? (
                    <PhoneIncoming className="w-5 h-5" />
                  ) : (
                    <PhoneOutgoing className="w-5 h-5" />
                  )}
                </div>

                {/* Call details */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {formatPhone(call.phone_number)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatRelativeTime(call.started_at)}
                    {call.duration_seconds && (
                      <> · {formatDuration(call.duration_seconds)}</>
                    )}
                  </p>
                </div>

                {/* Outcome badge */}
                <span className={cn('badge', outcomeStyles[call.outcome])}>
                  {outcomeLabels[call.outcome]}
                </span>
              </>
            )

            // If onCallClick is provided, use a button/div for the modal
            if (onCallClick) {
              return (
                <button
                  key={call.id}
                  onClick={() => onCallClick(call)}
                  className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors w-full text-left"
                >
                  {content}
                </button>
              )
            }

            // Otherwise, use Link for navigation
            return (
              <Link
                key={call.id}
                to={`/calls/${call.id}`}
                className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors"
              >
                {content}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
