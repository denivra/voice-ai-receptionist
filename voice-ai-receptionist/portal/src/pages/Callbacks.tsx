import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  PhoneCallback,
  Search,
  Clock,
  AlertCircle,
  CheckCircle,
  Phone,
  MessageSquare,
  Calendar,
  PlayCircle,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  BarChart3,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { cn, formatPhone, formatDuration } from '@/lib/utils'
import {
  useCallbacks,
  useCallbackMetrics,
  useCallbackCallSummary,
  useCreateBooking,
  type CallbackResolution,
  type ResolutionType,
} from '@/hooks/useBookings'
import { useCallbacksRealtime } from '@/hooks/useRealtime'
import type { Callback, ReservationInsert } from '@/types/database'

// Priority styles
const priorityStyles = {
  low: 'border-l-slate-400',
  normal: 'border-l-primary-500',
  high: 'border-l-warning-500',
  urgent: 'border-l-error-500',
}

const priorityBgStyles = {
  low: 'bg-slate-50',
  normal: 'bg-primary-50/50',
  high: 'bg-warning-50/50',
  urgent: 'bg-error-50/50',
}

const priorityBadgeStyles = {
  low: 'badge-neutral',
  normal: 'badge-info',
  high: 'badge-warning',
  urgent: 'badge-error',
}

const priorityLabels = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

// Status styles
const statusBadgeStyles = {
  pending: 'badge-warning',
  in_progress: 'badge-info',
  completed: 'badge-success',
  failed: 'badge-error',
  cancelled: 'badge-neutral',
}

const statusLabels = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

// Tab types
type TabType = 'all' | 'urgent' | 'normal' | 'completed'

const tabs: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All Open' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'normal', label: 'Normal' },
  { id: 'completed', label: 'Completed Today' },
]

// Resolution types
const resolutionTypes: { value: ResolutionType; label: string; description: string }[] = [
  { value: 'booked', label: 'Booked', description: 'Created a reservation for the customer' },
  { value: 'no_answer', label: 'No Answer', description: 'Customer did not answer the call' },
  { value: 'declined', label: 'Declined', description: 'Customer declined or not interested' },
  { value: 'resolved', label: 'Resolved', description: 'Issue resolved without booking' },
  { value: 'invalid', label: 'Invalid', description: 'Invalid phone number or spam' },
  { value: 'other', label: 'Other', description: 'Other resolution' },
]

// Metrics bar component
function MetricsBar() {
  const { metrics, isLoading } = useCallbackMetrics()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-20 mb-2" />
            <div className="h-6 bg-slate-200 rounded w-12" />
          </div>
        ))}
      </div>
    )
  }

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Open Callbacks */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <PhoneCallback className="w-4 h-4" />
          Open Callbacks
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {metrics?.pendingCount ?? 0}
          {(metrics?.urgentCount ?? 0) > 0 && (
            <span className="text-sm font-normal text-error-600 ml-2">
              ({metrics?.urgentCount} urgent)
            </span>
          )}
        </div>
      </div>

      {/* Avg Resolution Time */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <Timer className="w-4 h-4" />
          Avg Resolution
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {metrics?.avgResolutionTime ? formatMinutes(metrics.avgResolutionTime) : '--'}
        </div>
      </div>

      {/* Oldest Pending */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <Clock className="w-4 h-4" />
          Oldest Pending
        </div>
        <div className={cn(
          'text-2xl font-bold',
          (metrics?.oldestPendingMinutes ?? 0) > 60 ? 'text-warning-600' : 'text-slate-900',
          (metrics?.oldestPendingMinutes ?? 0) > 120 ? 'text-error-600' : ''
        )}>
          {metrics?.oldestPendingMinutes ? formatMinutes(metrics.oldestPendingMinutes) : '--'}
        </div>
      </div>

      {/* Top Reason */}
      <div className="card p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
          <BarChart3 className="w-4 h-4" />
          Top Reason
        </div>
        <div className="text-lg font-medium text-slate-900 truncate">
          {metrics?.reasonBreakdown && Object.keys(metrics.reasonBreakdown).length > 0
            ? Object.entries(metrics.reasonBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0]
            : '--'}
        </div>
      </div>
    </div>
  )
}

// Call summary display component
function CallSummaryDisplay({ callLogId }: { callLogId: string | null }) {
  const { callSummary, isLoading } = useCallbackCallSummary(callLogId)

  if (!callLogId) return null

  if (isLoading) {
    return (
      <div className="mt-3 p-3 bg-slate-100 rounded-lg animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-1/2" />
      </div>
    )
  }

  if (!callSummary?.summary) return null

  return (
    <div className="mt-3 p-3 bg-slate-100 rounded-lg">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <MessageSquare className="w-3 h-3" />
        Original Call Summary
      </div>
      <p className="text-sm text-slate-700">{callSummary.summary}</p>
    </div>
  )
}

// Resolution modal component
function ResolutionModal({
  callback,
  onClose,
  onComplete,
  isLoading,
}: {
  callback: Callback
  onClose: () => void
  onComplete: (resolution: CallbackResolution) => void
  isLoading: boolean
}) {
  const [resolutionType, setResolutionType] = useState<ResolutionType>('resolved')
  const [notes, setNotes] = useState('')
  const [showBookingForm, setShowBookingForm] = useState(false)

  const handleSubmit = () => {
    onComplete({
      resolutionType,
      notes,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Complete Callback</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {callback.customer_name || formatPhone(callback.customer_phone)}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Resolution Type */}
          <div>
            <label className="label">Resolution Type</label>
            <div className="grid grid-cols-2 gap-2">
              {resolutionTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setResolutionType(type.value)
                    setShowBookingForm(type.value === 'booked')
                  }}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    resolutionType === type.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <p className="font-medium text-slate-900">{type.label}</p>
                  <p className="text-xs text-slate-500">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Show create booking option if booked */}
          {resolutionType === 'booked' && (
            <div className="bg-success-50 border border-success-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-success-800 mb-2">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">Create Booking</span>
              </div>
              <p className="text-sm text-success-700 mb-3">
                Go to the Bookings page to create a new reservation for this customer.
              </p>
              <Link
                to={`/bookings?create=true&phone=${encodeURIComponent(callback.customer_phone)}&name=${encodeURIComponent(callback.customer_name || '')}`}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Create Booking
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label">Resolution Notes</label>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about the resolution..."
              required
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !notes.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" />
            Complete Callback
          </button>
        </div>
      </div>
    </div>
  )
}

// Cancel confirmation modal
function CancelModal({
  callback,
  onClose,
  onConfirm,
  isLoading,
}: {
  callback: Callback
  onClose: () => void
  onConfirm: (reason: string) => void
  isLoading: boolean
}) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Cancel Callback</h3>
        <p className="text-slate-600 mb-4">
          Mark this callback as invalid or cancelled?
        </p>
        <div className="mb-4">
          <label className="label">Reason (optional)</label>
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being cancelled?"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary" disabled={isLoading}>
            Back
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isLoading}
            className="bg-error-600 hover:bg-error-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Cancel Callback
          </button>
        </div>
      </div>
    </div>
  )
}

// Callback card component
function CallbackCard({
  callback,
  onMarkInProgress,
  onMarkComplete,
  onCancel,
  isUpdating,
}: {
  callback: Callback
  onMarkInProgress: () => void
  onMarkComplete: () => void
  onCancel: () => void
  isUpdating: boolean
}) {
  const timeSinceCreated = formatDistanceToNow(new Date(callback.created_at), { addSuffix: true })

  return (
    <div
      className={cn(
        'card border-l-4 overflow-hidden transition-all',
        priorityStyles[callback.priority],
        priorityBgStyles[callback.priority]
      )}
    >
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          {/* Callback info */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-slate-900">
                {callback.customer_name || 'Unknown Customer'}
              </h3>
              <span className={cn('badge', priorityBadgeStyles[callback.priority])}>
                {priorityLabels[callback.priority]}
              </span>
              <span className={cn('badge', statusBadgeStyles[callback.status])}>
                {statusLabels[callback.status]}
              </span>
            </div>

            {/* Reason */}
            <p className="text-slate-700 mb-3">{callback.reason}</p>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
              <a
                href={`tel:${callback.customer_phone}`}
                className="flex items-center gap-1 hover:text-primary-600 transition-colors"
              >
                <Phone className="w-4 h-4" />
                {formatPhone(callback.customer_phone)}
              </a>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {timeSinceCreated}
              </span>
              {callback.attempts > 0 && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  {callback.attempts} attempt{callback.attempts !== 1 && 's'}
                </span>
              )}
            </div>

            {/* Call summary */}
            <CallSummaryDisplay callLogId={callback.call_log_id} />

            {/* Notes */}
            {callback.notes && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <MessageSquare className="w-3 h-3" />
                  Notes
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{callback.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {(callback.status === 'pending' || callback.status === 'in_progress') && (
            <div className="flex flex-row lg:flex-col gap-2">
              {/* Call Now */}
              <a
                href={`tel:${callback.customer_phone}`}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4" />
                Call Now
              </a>

              {/* Mark In Progress (only if pending) */}
              {callback.status === 'pending' && (
                <button
                  onClick={onMarkInProgress}
                  disabled={isUpdating}
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <PlayCircle className="w-4 h-4" />
                  Start
                </button>
              )}

              {/* Mark Complete */}
              <button
                onClick={onMarkComplete}
                disabled={isUpdating}
                className="btn-secondary flex items-center justify-center gap-2 text-success-600 hover:bg-success-50"
              >
                <CheckCircle className="w-4 h-4" />
                Complete
              </button>

              {/* Create Booking Link */}
              <Link
                to={`/bookings?create=true&phone=${encodeURIComponent(callback.customer_phone)}&name=${encodeURIComponent(callback.customer_name || '')}&callback=${callback.id}`}
                className="btn-ghost flex items-center justify-center gap-2 text-primary-600 hover:bg-primary-50"
              >
                <Calendar className="w-4 h-4" />
                Book
              </Link>

              {/* Cancel */}
              <button
                onClick={onCancel}
                disabled={isUpdating}
                className="btn-ghost flex items-center justify-center gap-2 text-error-600 hover:bg-error-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          )}

          {/* Completed status */}
          {callback.status === 'completed' && callback.completed_at && (
            <div className="text-sm text-success-600 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Completed {formatDistanceToNow(new Date(callback.completed_at), { addSuffix: true })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Main Callbacks component
export function Callbacks() {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [resolutionCallback, setResolutionCallback] = useState<Callback | null>(null)
  const [cancelCallback, setCancelCallback] = useState<Callback | null>(null)

  // Subscribe to realtime updates
  useCallbacksRealtime()

  // Determine filter params based on tab
  const getFilterParams = () => {
    const base = { search: searchQuery || undefined }

    switch (activeTab) {
      case 'urgent':
        return { ...base, priority: 'urgent', status: undefined }
      case 'normal':
        return { ...base, priority: undefined, status: 'pending' }
      case 'completed':
        return { ...base, status: 'completed', includeCompletedToday: true }
      default:
        return { ...base, status: undefined }
    }
  }

  const {
    callbacks,
    isLoading,
    markInProgress,
    markComplete,
    markFailed,
    isUpdating,
  } = useCallbacks(getFilterParams())

  // Filter and sort callbacks
  const filteredCallbacks = callbacks?.filter((c) => {
    if (activeTab === 'all') {
      return c.status === 'pending' || c.status === 'in_progress'
    }
    if (activeTab === 'urgent') {
      return (c.status === 'pending' || c.status === 'in_progress') && c.priority === 'urgent'
    }
    if (activeTab === 'normal') {
      return (c.status === 'pending' || c.status === 'in_progress') && c.priority !== 'urgent'
    }
    return true
  }) ?? []

  // Sort by priority (urgent first) then by creation time
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
  const sortedCallbacks = [...filteredCallbacks].sort((a, b) => {
    if (activeTab === 'completed') {
      // Sort completed by completion time (newest first)
      return new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
    }
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  // Count urgent callbacks for alert
  const urgentCount = callbacks?.filter(
    (c) => c.priority === 'urgent' && (c.status === 'pending' || c.status === 'in_progress')
  ).length ?? 0

  // Handle resolution
  const handleComplete = (resolution: CallbackResolution) => {
    if (!resolutionCallback) return
    markComplete(
      { callbackId: resolutionCallback.id, resolution },
      { onSuccess: () => setResolutionCallback(null) }
    )
  }

  // Handle cancel
  const handleCancel = (reason: string) => {
    if (!cancelCallback) return
    markFailed(
      { callbackId: cancelCallback.id, reason },
      { onSuccess: () => setCancelCallback(null) }
    )
  }

  return (
    <div className="space-y-6">
      {/* Urgent alert */}
      {urgentCount > 0 && activeTab !== 'completed' && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-error-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-error-800 font-medium">
              {urgentCount} urgent callback{urgentCount !== 1 && 's'} require immediate attention
            </p>
          </div>
          {activeTab !== 'urgent' && (
            <button
              onClick={() => setActiveTab('urgent')}
              className="text-error-600 hover:text-error-700 font-medium text-sm"
            >
              View Urgent
            </button>
          )}
        </div>
      )}

      {/* Metrics Bar */}
      <MetricsBar />

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {tab.label}
              {tab.id === 'urgent' && urgentCount > 0 && (
                <span className="ml-1.5 bg-error-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {urgentCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 w-full sm:w-64"
          />
        </div>
      </div>

      {/* Callbacks list */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="h-5 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-4 bg-slate-200 rounded w-64 mb-3" />
                  <div className="h-4 bg-slate-200 rounded w-40" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="h-10 bg-slate-200 rounded w-24" />
                  <div className="h-10 bg-slate-200 rounded w-24" />
                </div>
              </div>
            </div>
          ))
        ) : sortedCallbacks.length === 0 ? (
          <div className="card p-12 text-center">
            {activeTab === 'completed' ? (
              <>
                <CheckCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No completed callbacks today</h3>
                <p className="text-slate-500">
                  Completed callbacks from today will appear here
                </p>
              </>
            ) : (
              <>
                <CheckCircle className="w-16 h-16 text-success-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">All caught up!</h3>
                <p className="text-slate-500">
                  {activeTab === 'urgent'
                    ? 'No urgent callbacks at the moment'
                    : 'No pending callbacks at the moment'}
                </p>
              </>
            )}
          </div>
        ) : (
          sortedCallbacks.map((callback) => (
            <CallbackCard
              key={callback.id}
              callback={callback}
              onMarkInProgress={() => markInProgress(callback.id)}
              onMarkComplete={() => setResolutionCallback(callback)}
              onCancel={() => setCancelCallback(callback)}
              isUpdating={isUpdating}
            />
          ))
        )}
      </div>

      {/* Resolution Modal */}
      {resolutionCallback && (
        <ResolutionModal
          callback={resolutionCallback}
          onClose={() => setResolutionCallback(null)}
          onComplete={handleComplete}
          isLoading={isUpdating}
        />
      )}

      {/* Cancel Modal */}
      {cancelCallback && (
        <CancelModal
          callback={cancelCallback}
          onClose={() => setCancelCallback(null)}
          onConfirm={handleCancel}
          isLoading={isUpdating}
        />
      )}
    </div>
  )
}
