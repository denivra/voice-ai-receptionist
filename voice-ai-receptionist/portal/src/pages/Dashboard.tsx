import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Phone,
  Calendar,
  PhoneCallback,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
  PhoneIncoming,
  PhoneOutgoing,
} from 'lucide-react'
import { StatsCard, RecentCalls, TodayBookings, CallbackQueue } from '@/components/dashboard'
import { useDashboardData } from '@/hooks/useCalls'
import { useDashboardRealtime } from '@/hooks/useRealtime'
import { cn, formatDuration, formatPhone, formatDateTime } from '@/lib/utils'
import type { CallLog } from '@/types/database'

// System status indicator component
function SystemStatusIndicator({ status }: { status: 'healthy' | 'degraded' | 'error' }) {
  const statusConfig = {
    healthy: {
      color: 'bg-success-500',
      label: 'All Systems Operational',
      icon: CheckCircle,
    },
    degraded: {
      color: 'bg-warning-500',
      label: 'Degraded Performance',
      icon: AlertTriangle,
    },
    error: {
      color: 'bg-error-500',
      label: 'System Issues Detected',
      icon: XCircle,
    },
  }

  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-2.5 h-2.5 rounded-full animate-pulse', config.color)} />
      <Icon className={cn(
        'w-4 h-4',
        status === 'healthy' && 'text-success-600',
        status === 'degraded' && 'text-warning-600',
        status === 'error' && 'text-error-600'
      )} />
      <span className="text-sm text-slate-600">{config.label}</span>
    </div>
  )
}

// Live clock component
function LiveClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="text-right">
      <p className="text-sm text-slate-500">{format(time, 'EEEE, MMMM d, yyyy')}</p>
      <p className="text-lg font-semibold text-slate-900">{format(time, 'h:mm:ss a')}</p>
    </div>
  )
}

// Call detail modal component
function CallDetailModal({
  call,
  onClose,
}: {
  call: CallLog
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              call.direction === 'inbound'
                ? 'bg-primary-50 text-primary-600'
                : 'bg-slate-100 text-slate-600'
            )}>
              {call.direction === 'inbound' ? (
                <PhoneIncoming className="w-5 h-5" />
              ) : (
                <PhoneOutgoing className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Call Details</h3>
              <p className="text-sm text-slate-500">{formatPhone(call.phone_number)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Direction</p>
              <p className="font-medium text-slate-900 capitalize">{call.direction}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Outcome</p>
              <p className={cn(
                'font-medium capitalize',
                call.outcome === 'completed' && 'text-success-600',
                call.outcome === 'transferred' && 'text-primary-600',
                call.outcome === 'failed' && 'text-error-600',
                call.outcome === 'missed' && 'text-warning-600'
              )}>
                {call.outcome}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Started At</p>
              <p className="font-medium text-slate-900">{formatDateTime(call.started_at)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Duration</p>
              <p className="font-medium text-slate-900">
                {call.duration_seconds ? formatDuration(call.duration_seconds) : 'N/A'}
              </p>
            </div>
          </div>

          {call.vapi_call_id && (
            <div>
              <p className="text-sm text-slate-500">VAPI Call ID</p>
              <p className="font-mono text-sm text-slate-700 bg-slate-50 px-2 py-1 rounded">
                {call.vapi_call_id}
              </p>
            </div>
          )}

          {call.transfer_reason && (
            <div>
              <p className="text-sm text-slate-500">Transfer Reason</p>
              <p className="text-slate-900">{call.transfer_reason}</p>
            </div>
          )}

          {call.summary && (
            <div>
              <p className="text-sm text-slate-500 mb-1">Call Summary</p>
              <p className="text-slate-700 bg-slate-50 p-3 rounded-lg text-sm">
                {call.summary}
              </p>
            </div>
          )}

          {call.transcript && (
            <div>
              <p className="text-sm text-slate-500 mb-1">Transcript</p>
              <div className="bg-slate-50 p-3 rounded-lg max-h-60 overflow-y-auto">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                  {call.transcript}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Loading skeleton for header
function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between animate-pulse">
      <div>
        <div className="h-8 bg-slate-200 rounded w-48 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-32" />
      </div>
      <div className="flex items-center gap-8">
        <div className="h-6 bg-slate-200 rounded w-40" />
        <div className="text-right">
          <div className="h-4 bg-slate-200 rounded w-32 mb-1" />
          <div className="h-6 bg-slate-200 rounded w-24" />
        </div>
      </div>
    </div>
  )
}

export function Dashboard() {
  const {
    stats,
    recentCalls,
    todayBookings,
    pendingCallbacks,
    restaurant,
    isLoading,
    markCallbackComplete,
    isMarkingComplete,
  } = useDashboardData()

  // Subscribe to realtime updates
  useDashboardRealtime()

  // State for call detail modal
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null)

  // Format average duration as mm:ss
  const formatAvgDuration = (seconds: number): string => {
    if (!seconds) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="card p-6">
        {isLoading ? (
          <HeaderSkeleton />
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {restaurant?.name || 'Dashboard'}
              </h1>
              <p className="text-slate-500">
                Welcome back! Here's what's happening today.
              </p>
            </div>
            <div className="flex items-center gap-8">
              <SystemStatusIndicator status={stats?.systemStatus || 'healthy'} />
              <LiveClock />
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Today's Calls"
          value={stats?.totalCalls ?? 0}
          change={stats?.callsChange}
          changeLabel="vs yesterday"
          trend={
            stats?.callsChange && stats.callsChange > 0
              ? 'up'
              : stats?.callsChange && stats.callsChange < 0
                ? 'down'
                : 'neutral'
          }
          icon={<Phone className="w-5 h-5" />}
          loading={isLoading}
        />
        <StatsCard
          title="Bookings Made"
          value={stats?.totalBookings ?? 0}
          change={stats?.bookingsChange}
          changeLabel="vs yesterday"
          trend={
            stats?.bookingsChange && stats.bookingsChange > 0
              ? 'up'
              : stats?.bookingsChange && stats.bookingsChange < 0
                ? 'down'
                : 'neutral'
          }
          icon={<Calendar className="w-5 h-5" />}
          loading={isLoading}
        />
        <StatsCard
          title="Callbacks Pending"
          value={stats?.pendingCallbacks ?? 0}
          icon={<PhoneCallback className="w-5 h-5" />}
          loading={isLoading}
        />
        <StatsCard
          title="Avg Call Duration"
          value={formatAvgDuration(stats?.avgDuration ?? 0)}
          change={stats?.avgDurationChange}
          changeLabel="vs yesterday"
          trend={
            stats?.avgDurationChange && stats.avgDurationChange > 0
              ? 'up'
              : stats?.avgDurationChange && stats.avgDurationChange < 0
                ? 'down'
                : 'neutral'
          }
          icon={<Clock className="w-5 h-5" />}
          loading={isLoading}
        />
      </div>

      {/* Two-Column Layout: Recent Calls (60%) + Bookings/Callbacks (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - 60% (3/5) */}
        <div className="lg:col-span-3">
          <RecentCalls
            calls={recentCalls ?? []}
            loading={isLoading}
            onCallClick={setSelectedCall}
          />
        </div>

        {/* Right Column - 40% (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Today's Bookings Timeline */}
          <TodayBookings
            bookings={todayBookings ?? []}
            loading={isLoading}
          />

          {/* Pending Callbacks Queue */}
          <CallbackQueue
            callbacks={pendingCallbacks ?? []}
            loading={isLoading}
            onMarkComplete={(id) => markCallbackComplete(id)}
            isMarkingComplete={isMarkingComplete}
          />
        </div>
      </div>

      {/* Call Detail Modal */}
      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
        />
      )}
    </div>
  )
}
