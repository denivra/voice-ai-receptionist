/**
 * System Health Component
 *
 * Displays current system health status with KPI monitoring.
 * Shows green/yellow/red indicator based on threshold evaluation.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Phone,
  Calendar,
  PhoneCallback,
  Zap,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/hooks/useSupabase'

// ============================================================================
// Types
// ============================================================================

interface HealthMetrics {
  calls: {
    total: number
    completed: number
    failed: number
    errorRate: number
    completionRate: number
    avgDuration: number
  }
  callbacks: {
    pending: number
    urgent: number
    oldestMinutes: number
  }
  latency: {
    avgMs: number
    p95Ms: number
  }
  bookings: {
    total: number
    successRate: number
  }
}

interface HealthAlert {
  severity: 'critical' | 'high' | 'medium' | 'low'
  metric: string
  value: string
  threshold: string
  message: string
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical'
  metrics: HealthMetrics
  alerts: HealthAlert[]
  lastChecked: Date
}

// KPI Thresholds from Section 6.1
const THRESHOLDS = {
  errorRate: { warning: 5, critical: 20 },
  completionRate: { warning: 90, critical: 85 },
  latencyP95: { warning: 2000, critical: 4000 },
  pendingCallbacks: { warning: 5, critical: 10 },
  callbackAgeMinutes: { warning: 30, critical: 60 },
  avgHandleTime: { warning: 240, critical: 300 }, // seconds
}

// ============================================================================
// Health Check Hook
// ============================================================================

function useSystemHealth() {
  const { restaurantId } = useRestaurant()

  return useQuery({
    queryKey: ['system-health', restaurantId],
    queryFn: async (): Promise<HealthStatus> => {
      if (!restaurantId) {
        return {
          status: 'healthy',
          metrics: {
            calls: { total: 0, completed: 0, failed: 0, errorRate: 0, completionRate: 100, avgDuration: 0 },
            callbacks: { pending: 0, urgent: 0, oldestMinutes: 0 },
            latency: { avgMs: 0, p95Ms: 0 },
            bookings: { total: 0, successRate: 100 },
          },
          alerts: [],
          lastChecked: new Date(),
        }
      }

      // Fetch call metrics (last 10 minutes)
      const { data: callData } = await supabase
        .from('call_logs')
        .select('status, duration_seconds, outcome')
        .eq('restaurant_id', restaurantId)
        .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

      const calls = callData || []
      const totalCalls = calls.length
      const completedCalls = calls.filter(c => c.status === 'completed').length
      const failedCalls = calls.filter(c => c.status === 'failed').length
      const errorRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0
      const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 100
      const avgDuration = totalCalls > 0
        ? calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / totalCalls
        : 0

      // Fetch callback metrics
      const { data: callbackData } = await supabase
        .from('callbacks')
        .select('priority, created_at')
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'in_progress'])

      const callbacks = callbackData || []
      const pendingCallbacks = callbacks.length
      const urgentCallbacks = callbacks.filter(c => c.priority === 'urgent').length
      const oldestCallback = callbacks.length > 0
        ? Math.min(...callbacks.map(c => new Date(c.created_at).getTime()))
        : Date.now()
      const oldestMinutes = (Date.now() - oldestCallback) / 60000

      // Fetch booking metrics (today)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: bookingData } = await supabase
        .from('reservations')
        .select('status')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', todayStart.toISOString())

      const bookings = bookingData || []
      const totalBookings = bookings.length
      const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length
      const bookingSuccessRate = totalBookings > 0 ? (confirmedBookings / totalBookings) * 100 : 100

      // Build metrics
      const metrics: HealthMetrics = {
        calls: {
          total: totalCalls,
          completed: completedCalls,
          failed: failedCalls,
          errorRate: Math.round(errorRate * 10) / 10,
          completionRate: Math.round(completionRate * 10) / 10,
          avgDuration: Math.round(avgDuration),
        },
        callbacks: {
          pending: pendingCallbacks,
          urgent: urgentCallbacks,
          oldestMinutes: Math.round(oldestMinutes),
        },
        latency: {
          avgMs: 0, // Would need webhook_latency_ms column
          p95Ms: 0,
        },
        bookings: {
          total: totalBookings,
          successRate: Math.round(bookingSuccessRate * 10) / 10,
        },
      }

      // Evaluate alerts
      const alerts: HealthAlert[] = []
      let status: 'healthy' | 'degraded' | 'critical' = 'healthy'

      // Check error rate
      if (errorRate >= THRESHOLDS.errorRate.critical) {
        alerts.push({
          severity: 'critical',
          metric: 'Error Rate',
          value: `${metrics.calls.errorRate}%`,
          threshold: `>${THRESHOLDS.errorRate.critical}%`,
          message: `Critical error rate: ${metrics.calls.errorRate}% of calls failing`,
        })
        status = 'critical'
      } else if (errorRate >= THRESHOLDS.errorRate.warning) {
        alerts.push({
          severity: 'medium',
          metric: 'Error Rate',
          value: `${metrics.calls.errorRate}%`,
          threshold: `>${THRESHOLDS.errorRate.warning}%`,
          message: `Elevated error rate: ${metrics.calls.errorRate}%`,
        })
        if (status === 'healthy') status = 'degraded'
      }

      // Check completion rate
      if (completionRate < THRESHOLDS.completionRate.critical) {
        alerts.push({
          severity: 'high',
          metric: 'Completion Rate',
          value: `${metrics.calls.completionRate}%`,
          threshold: `<${THRESHOLDS.completionRate.critical}%`,
          message: `Low completion rate: ${metrics.calls.completionRate}%`,
        })
        if (status !== 'critical') status = 'degraded'
      }

      // Check pending callbacks
      if (pendingCallbacks >= THRESHOLDS.pendingCallbacks.critical) {
        alerts.push({
          severity: 'high',
          metric: 'Pending Callbacks',
          value: pendingCallbacks.toString(),
          threshold: `>${THRESHOLDS.pendingCallbacks.critical}`,
          message: `${pendingCallbacks} callbacks pending (${urgentCallbacks} urgent)`,
        })
        if (status !== 'critical') status = 'degraded'
      } else if (pendingCallbacks >= THRESHOLDS.pendingCallbacks.warning) {
        alerts.push({
          severity: 'medium',
          metric: 'Pending Callbacks',
          value: pendingCallbacks.toString(),
          threshold: `>${THRESHOLDS.pendingCallbacks.warning}`,
          message: `${pendingCallbacks} callbacks pending`,
        })
        if (status === 'healthy') status = 'degraded'
      }

      // Check callback age
      if (oldestMinutes >= THRESHOLDS.callbackAgeMinutes.critical && pendingCallbacks > 0) {
        alerts.push({
          severity: 'high',
          metric: 'Callback Age',
          value: `${metrics.callbacks.oldestMinutes}min`,
          threshold: `>${THRESHOLDS.callbackAgeMinutes.critical}min`,
          message: `Oldest callback is ${metrics.callbacks.oldestMinutes} minutes old`,
        })
        if (status !== 'critical') status = 'degraded'
      }

      return {
        status,
        metrics,
        alerts,
        lastChecked: new Date(),
      }
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!restaurantId,
  })
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusIndicator({ status }: { status: 'healthy' | 'degraded' | 'critical' }) {
  const config = {
    healthy: {
      icon: CheckCircle,
      color: 'text-success-600',
      bgColor: 'bg-success-100',
      label: 'Healthy',
    },
    degraded: {
      icon: AlertTriangle,
      color: 'text-warning-600',
      bgColor: 'bg-warning-100',
      label: 'Degraded',
    },
    critical: {
      icon: AlertCircle,
      color: 'text-error-600',
      bgColor: 'bg-error-100',
      label: 'Critical',
    },
  }[status]

  const Icon = config.icon

  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full', config.bgColor)}>
      <Icon className={cn('w-4 h-4', config.color)} />
      <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  suffix,
  status,
  link,
}: {
  icon: typeof Activity
  label: string
  value: string | number
  suffix?: string
  status?: 'good' | 'warning' | 'critical'
  link?: string
}) {
  const statusColors = {
    good: 'text-success-600',
    warning: 'text-warning-600',
    critical: 'text-error-600',
  }

  const content = (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-slate-100 rounded-lg">
        <Icon className="w-4 h-4 text-slate-600" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={cn('text-lg font-semibold', status && statusColors[status])}>
          {value}
          {suffix && <span className="text-sm font-normal text-slate-500 ml-0.5">{suffix}</span>}
        </p>
      </div>
    </div>
  )

  if (link) {
    return (
      <Link to={link} className="hover:bg-slate-50 rounded-lg p-2 -m-2 transition-colors">
        {content}
      </Link>
    )
  }

  return content
}

function AlertItem({ alert }: { alert: HealthAlert }) {
  const severityConfig = {
    critical: { color: 'text-error-700', bg: 'bg-error-50', border: 'border-error-200' },
    high: { color: 'text-warning-700', bg: 'bg-warning-50', border: 'border-warning-200' },
    medium: { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    low: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  }[alert.severity]

  return (
    <div className={cn('p-3 rounded-lg border', severityConfig.bg, severityConfig.border)}>
      <p className={cn('text-sm font-medium', severityConfig.color)}>{alert.message}</p>
      <p className="text-xs text-slate-500 mt-1">
        {alert.metric}: {alert.value} (threshold: {alert.threshold})
      </p>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function SystemHealth() {
  const { data: health, isLoading, refetch, isRefetching } = useSystemHealth()
  const [isExpanded, setIsExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-slate-200 rounded w-32" />
          <div className="h-8 bg-slate-200 rounded-full w-24" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    )
  }

  if (!health) return null

  const getValueStatus = (value: number, warning: number, critical: number, inverse = false): 'good' | 'warning' | 'critical' => {
    if (inverse) {
      if (value < critical) return 'critical'
      if (value < warning) return 'warning'
      return 'good'
    }
    if (value >= critical) return 'critical'
    if (value >= warning) return 'warning'
    return 'good'
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-slate-600" />
            <h3 className="font-semibold text-slate-900">System Health</h3>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicator status={health.status} />
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4 text-slate-500', isRefetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          <Clock className="w-3 h-3" />
          Last checked {formatDistanceToNow(health.lastChecked, { addSuffix: true })}
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-slate-200">
        <MetricCard
          icon={Phone}
          label="Calls (10 min)"
          value={health.metrics.calls.total}
          status={getValueStatus(
            health.metrics.calls.errorRate,
            THRESHOLDS.errorRate.warning,
            THRESHOLDS.errorRate.critical
          )}
          link="/calls"
        />
        <MetricCard
          icon={PhoneCallback}
          label="Pending Callbacks"
          value={health.metrics.callbacks.pending}
          suffix={health.metrics.callbacks.urgent > 0 ? `(${health.metrics.callbacks.urgent} urgent)` : undefined}
          status={getValueStatus(
            health.metrics.callbacks.pending,
            THRESHOLDS.pendingCallbacks.warning,
            THRESHOLDS.pendingCallbacks.critical
          )}
          link="/callbacks"
        />
        <MetricCard
          icon={Calendar}
          label="Bookings Today"
          value={health.metrics.bookings.total}
          link="/bookings"
        />
        <MetricCard
          icon={Zap}
          label="Error Rate"
          value={health.metrics.calls.errorRate}
          suffix="%"
          status={getValueStatus(
            health.metrics.calls.errorRate,
            THRESHOLDS.errorRate.warning,
            THRESHOLDS.errorRate.critical
          )}
        />
      </div>

      {/* Alerts */}
      {health.alerts.length > 0 && (
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-slate-700">
              Active Alerts ({health.alerts.length})
            </h4>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {isExpanded ? (
            <div className="space-y-2">
              {health.alerts.map((alert, i) => (
                <AlertItem key={i} alert={alert} />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {health.alerts.slice(0, 3).map((alert, i) => (
                <span
                  key={i}
                  className={cn(
                    'px-2 py-1 text-xs font-medium rounded',
                    alert.severity === 'critical' && 'bg-error-100 text-error-700',
                    alert.severity === 'high' && 'bg-warning-100 text-warning-700',
                    alert.severity === 'medium' && 'bg-yellow-100 text-yellow-700',
                    alert.severity === 'low' && 'bg-blue-100 text-blue-700'
                  )}
                >
                  {alert.metric}
                </span>
              ))}
              {health.alerts.length > 3 && (
                <span className="px-2 py-1 text-xs text-slate-500">
                  +{health.alerts.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick Links */}
      <div className="p-4 flex flex-wrap gap-2">
        <Link
          to="/calls"
          className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View Calls <ExternalLink className="w-3 h-3" />
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          to="/callbacks"
          className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          View Callbacks <ExternalLink className="w-3 h-3" />
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          to="/settings"
          className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
        >
          Settings <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

export default SystemHealth
