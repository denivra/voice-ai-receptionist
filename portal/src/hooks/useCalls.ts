import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from './useSupabase'
import type { CallLog, Callback, Reservation, Restaurant } from '@/types/database'
import { startOfDay, endOfDay, subDays } from 'date-fns'

interface UseCallsOptions {
  search?: string
  outcome?: string
  direction?: 'inbound' | 'outbound'
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  sortBy?: 'started_at' | 'duration_seconds' | 'outcome'
  sortOrder?: 'asc' | 'desc'
}

export interface DashboardStats {
  totalCalls: number
  callsChange: number
  totalBookings: number
  bookingsChange: number
  pendingCallbacks: number
  avgDuration: number
  avgDurationChange: number
  resolutionRate: number
  resolutionChange: number
  failedCallsToday: number
  systemStatus: 'healthy' | 'degraded' | 'error'
}

export interface DashboardData {
  stats: DashboardStats | null
  recentCalls: CallLog[]
  todayBookings: Reservation[]
  pendingCallbacks: Callback[]
  restaurant: Restaurant | null
}

/**
 * Hook to fetch call logs with filtering and pagination
 */
export function useCalls(options: UseCallsOptions = {}) {
  const { restaurantId } = useRestaurant()
  const {
    search,
    outcome,
    direction,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    sortBy = 'started_at',
    sortOrder = 'desc',
  } = options

  const query = useQuery({
    queryKey: ['calls', restaurantId, search, outcome, direction, dateFrom, dateTo, page, limit, sortBy, sortOrder],
    queryFn: async () => {
      if (!restaurantId) return { calls: [], count: 0 }

      let query = supabase
        .from('call_logs')
        .select('*', { count: 'exact' })
        .eq('restaurant_id', restaurantId)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * limit, page * limit - 1)

      if (search) {
        query = query.ilike('phone_number', `%${search}%`)
      }

      if (outcome) {
        query = query.eq('outcome', outcome)
      }

      if (direction) {
        query = query.eq('direction', direction)
      }

      if (dateFrom) {
        query = query.gte('started_at', dateFrom)
      }

      if (dateTo) {
        query = query.lte('started_at', dateTo)
      }

      const { data, error, count } = await query

      if (error) throw error

      return {
        calls: data as CallLog[],
        count: count ?? 0,
      }
    },
    enabled: !!restaurantId,
  })

  return {
    calls: query.data?.calls,
    totalCount: query.data?.count,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook to fetch all calls for export (no pagination)
 */
export function useCallsExport(options: Omit<UseCallsOptions, 'page' | 'limit'> = {}) {
  const { restaurantId } = useRestaurant()
  const { search, outcome, direction, dateFrom, dateTo, sortBy = 'started_at', sortOrder = 'desc' } = options

  const query = useQuery({
    queryKey: ['calls-export', restaurantId, search, outcome, direction, dateFrom, dateTo, sortBy, sortOrder],
    queryFn: async () => {
      if (!restaurantId) return []

      let query = supabase
        .from('call_logs')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order(sortBy, { ascending: sortOrder === 'asc' })

      if (search) {
        query = query.ilike('phone_number', `%${search}%`)
      }

      if (outcome) {
        query = query.eq('outcome', outcome)
      }

      if (direction) {
        query = query.eq('direction', direction)
      }

      if (dateFrom) {
        query = query.gte('started_at', dateFrom)
      }

      if (dateTo) {
        query = query.lte('started_at', dateTo)
      }

      const { data, error } = await query

      if (error) throw error

      return data as CallLog[]
    },
    enabled: false, // Only run when explicitly called
  })

  return {
    calls: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook to fetch a single call by ID with related data
 */
export function useCall(callId: string | undefined) {
  const query = useQuery({
    queryKey: ['call', callId],
    queryFn: async () => {
      if (!callId) return null

      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('id', callId)
        .single()

      if (error) throw error

      return data as CallLog
    },
    enabled: !!callId,
  })

  return {
    call: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export interface CallDetailData {
  call: CallLog | null
  relatedBooking: Reservation | null
  relatedCallback: Callback | null
}

/**
 * Hook to fetch a single call by ID with related booking and callback data
 */
export function useCallDetail(callId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['call-detail', callId],
    queryFn: async (): Promise<CallDetailData> => {
      if (!callId) return { call: null, relatedBooking: null, relatedCallback: null }

      // Fetch call and related data in parallel
      const [callResult, bookingResult, callbackResult] = await Promise.all([
        supabase
          .from('call_logs')
          .select('*')
          .eq('id', callId)
          .single(),
        supabase
          .from('reservations')
          .select('*')
          .eq('call_log_id', callId)
          .maybeSingle(),
        supabase
          .from('callbacks')
          .select('*')
          .eq('call_log_id', callId)
          .maybeSingle(),
      ])

      if (callResult.error) throw callResult.error

      return {
        call: callResult.data as CallLog,
        relatedBooking: bookingResult.data as Reservation | null,
        relatedCallback: callbackResult.data as Callback | null,
      }
    },
    enabled: !!callId,
  })

  // Add notes mutation
  const addNote = useMutation({
    mutationFn: async ({ callId, notes }: { callId: string; notes: string }) => {
      // Get existing metadata
      const { data: existing } = await supabase
        .from('call_logs')
        .select('metadata')
        .eq('id', callId)
        .single()

      const existingMetadata = (existing?.metadata as Record<string, unknown>) || {}
      const existingNotes = (existingMetadata.notes as string[]) || []

      const { error } = await supabase
        .from('call_logs')
        .update({
          metadata: {
            ...existingMetadata,
            notes: [...existingNotes, { text: notes, timestamp: new Date().toISOString() }],
          },
        })
        .eq('id', callId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-detail', callId] })
      queryClient.invalidateQueries({ queryKey: ['calls'] })
    },
  })

  return {
    call: query.data?.call ?? null,
    relatedBooking: query.data?.relatedBooking ?? null,
    relatedCallback: query.data?.relatedCallback ?? null,
    isLoading: query.isLoading,
    error: query.error,
    addNote: addNote.mutate,
    isAddingNote: addNote.isPending,
  }
}

/**
 * Hook to fetch dashboard data with comprehensive stats
 */
export function useDashboardData() {
  const { restaurantId } = useRestaurant()
  const queryClient = useQueryClient()
  const today = new Date()
  const todayStart = startOfDay(today)
  const todayEnd = endOfDay(today)
  const yesterdayStart = startOfDay(subDays(today, 1))
  const yesterdayEnd = endOfDay(subDays(today, 1))

  const query = useQuery({
    queryKey: ['dashboard', restaurantId],
    queryFn: async (): Promise<DashboardData> => {
      if (!restaurantId) {
        return {
          stats: null,
          recentCalls: [],
          todayBookings: [],
          pendingCallbacks: [],
          restaurant: null,
        }
      }

      // Fetch all dashboard data in parallel
      const [
        restaurantResult,
        todayCallsResult,
        yesterdayCallsResult,
        recentCallsResult,
        todayBookingsResult,
        yesterdayBookingsResult,
        callbacksResult,
      ] = await Promise.all([
        // Restaurant info
        supabase
          .from('restaurants')
          .select('*')
          .eq('id', restaurantId)
          .single(),

        // Today's calls with duration
        supabase
          .from('call_logs')
          .select('id, outcome, duration_seconds')
          .eq('restaurant_id', restaurantId)
          .gte('started_at', todayStart.toISOString())
          .lte('started_at', todayEnd.toISOString()),

        // Yesterday's calls for comparison
        supabase
          .from('call_logs')
          .select('id, outcome, duration_seconds')
          .eq('restaurant_id', restaurantId)
          .gte('started_at', yesterdayStart.toISOString())
          .lte('started_at', yesterdayEnd.toISOString()),

        // Recent calls (last 10)
        supabase
          .from('call_logs')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('started_at', { ascending: false })
          .limit(10),

        // Today's bookings
        supabase
          .from('reservations')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .gte('reservation_time', todayStart.toISOString())
          .lte('reservation_time', todayEnd.toISOString())
          .neq('status', 'cancelled')
          .order('reservation_time', { ascending: true }),

        // Yesterday's bookings for comparison
        supabase
          .from('reservations')
          .select('id')
          .eq('restaurant_id', restaurantId)
          .gte('reservation_time', yesterdayStart.toISOString())
          .lte('reservation_time', yesterdayEnd.toISOString())
          .neq('status', 'cancelled'),

        // Pending callbacks
        supabase
          .from('callbacks')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'pending')
          .order('priority', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

      // Calculate stats
      const todayCalls = todayCallsResult.data ?? []
      const yesterdayCalls = yesterdayCallsResult.data ?? []
      const todayCallCount = todayCalls.length
      const yesterdayCallCount = yesterdayCalls.length

      const callsChange = yesterdayCallCount > 0
        ? Math.round(((todayCallCount - yesterdayCallCount) / yesterdayCallCount) * 100)
        : todayCallCount > 0 ? 100 : 0

      const todayBookings = todayBookingsResult.data?.length ?? 0
      const yesterdayBookings = yesterdayBookingsResult.data?.length ?? 0
      const bookingsChange = yesterdayBookings > 0
        ? Math.round(((todayBookings - yesterdayBookings) / yesterdayBookings) * 100)
        : todayBookings > 0 ? 100 : 0

      // Calculate average duration
      const todayDurations = todayCalls
        .filter(c => c.duration_seconds)
        .map(c => c.duration_seconds as number)
      const avgDuration = todayDurations.length > 0
        ? Math.round(todayDurations.reduce((a, b) => a + b, 0) / todayDurations.length)
        : 0

      const yesterdayDurations = yesterdayCalls
        .filter(c => c.duration_seconds)
        .map(c => c.duration_seconds as number)
      const yesterdayAvgDuration = yesterdayDurations.length > 0
        ? Math.round(yesterdayDurations.reduce((a, b) => a + b, 0) / yesterdayDurations.length)
        : 0

      const avgDurationChange = yesterdayAvgDuration > 0
        ? Math.round(((avgDuration - yesterdayAvgDuration) / yesterdayAvgDuration) * 100)
        : 0

      // Calculate resolution rate (completed / total)
      const completedCalls = todayCalls.filter(c => c.outcome === 'completed').length
      const resolutionRate = todayCallCount > 0
        ? Math.round((completedCalls / todayCallCount) * 100)
        : 0

      const yesterdayCompleted = yesterdayCalls.filter(c => c.outcome === 'completed').length
      const yesterdayResolutionRate = yesterdayCallCount > 0
        ? Math.round((yesterdayCompleted / yesterdayCallCount) * 100)
        : 0

      const resolutionChange = yesterdayResolutionRate > 0
        ? resolutionRate - yesterdayResolutionRate
        : 0

      // Calculate failed calls and system status
      const failedCallsToday = todayCalls.filter(c => c.outcome === 'failed').length
      const failureRate = todayCallCount > 0 ? (failedCallsToday / todayCallCount) * 100 : 0

      let systemStatus: 'healthy' | 'degraded' | 'error' = 'healthy'
      if (failureRate > 20) {
        systemStatus = 'error'
      } else if (failureRate > 10) {
        systemStatus = 'degraded'
      }

      const stats: DashboardStats = {
        totalCalls: todayCallCount,
        callsChange,
        totalBookings: todayBookings,
        bookingsChange,
        pendingCallbacks: callbacksResult.data?.length ?? 0,
        avgDuration,
        avgDurationChange,
        resolutionRate,
        resolutionChange,
        failedCallsToday,
        systemStatus,
      }

      return {
        stats,
        recentCalls: (recentCallsResult.data as CallLog[]) ?? [],
        todayBookings: (todayBookingsResult.data as Reservation[]) ?? [],
        pendingCallbacks: (callbacksResult.data as Callback[]) ?? [],
        restaurant: restaurantResult.data as Restaurant | null,
      }
    },
    enabled: !!restaurantId,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Mark callback complete mutation
  const markCallbackComplete = useMutation({
    mutationFn: async (callbackId: string) => {
      const { error } = await supabase
        .from('callbacks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', callbackId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  return {
    stats: query.data?.stats ?? null,
    recentCalls: query.data?.recentCalls ?? [],
    todayBookings: query.data?.todayBookings ?? [],
    pendingCallbacks: query.data?.pendingCallbacks ?? [],
    restaurant: query.data?.restaurant ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    markCallbackComplete: markCallbackComplete.mutate,
    isMarkingComplete: markCallbackComplete.isPending,
  }
}
