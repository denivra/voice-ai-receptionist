import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from './useSupabase'
import type { Reservation, Callback, ReservationInsert, ReservationUpdate, CallbackUpdate } from '@/types/database'
import { startOfDay, endOfDay } from 'date-fns'

interface UseBookingsOptions {
  search?: string
  status?: string
  date?: Date
  page?: number
  limit?: number
}

interface UseCallbacksOptions {
  search?: string
  status?: string
  priority?: string
  includeCompletedToday?: boolean
}

export type ResolutionType = 'booked' | 'no_answer' | 'declined' | 'resolved' | 'invalid' | 'other'

export interface CallbackResolution {
  resolutionType: ResolutionType
  notes: string
  bookingId?: string
}

export interface CallbackMetrics {
  avgResolutionTime: number // minutes
  pendingCount: number
  urgentCount: number
  oldestPendingMinutes: number
  reasonBreakdown: Record<string, number>
}

/**
 * Hook to fetch reservations with filtering
 */
export function useBookings(options: UseBookingsOptions = {}) {
  const { restaurantId } = useRestaurant()
  const { search, status, date, page = 1, limit = 50 } = options

  const query = useQuery({
    queryKey: ['bookings', restaurantId, search, status, date?.toISOString(), page, limit],
    queryFn: async () => {
      if (!restaurantId) return []

      let query = supabase
        .from('reservations')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('reservation_time', { ascending: true })

      if (date) {
        const dayStart = startOfDay(date)
        const dayEnd = endOfDay(date)
        query = query
          .gte('reservation_time', dayStart.toISOString())
          .lte('reservation_time', dayEnd.toISOString())
      }

      if (search) {
        query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`)
      }

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) throw error

      return data as Reservation[]
    },
    enabled: !!restaurantId,
  })

  return {
    bookings: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Hook to fetch a single booking by ID
 */
export function useBooking(bookingId: string | undefined) {
  const query = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: async () => {
      if (!bookingId) return null

      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', bookingId)
        .single()

      if (error) throw error

      return data as Reservation
    },
    enabled: !!bookingId,
  })

  return {
    booking: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Hook to create a new booking
 */
export function useCreateBooking() {
  const queryClient = useQueryClient()
  const { restaurantId } = useRestaurant()

  return useMutation({
    mutationFn: async (booking: Omit<ReservationInsert, 'restaurant_id'>) => {
      if (!restaurantId) throw new Error('No restaurant selected')

      const { data, error } = await supabase
        .from('reservations')
        .insert({
          ...booking,
          restaurant_id: restaurantId,
        })
        .select()
        .single()

      if (error) throw error

      return data as Reservation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/**
 * Hook to update a booking
 */
export function useUpdateBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...update }: ReservationUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('reservations')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return data as Reservation
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking', data.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/**
 * Hook to fetch callbacks with filtering
 */
export function useCallbacks(options: UseCallbacksOptions = {}) {
  const { restaurantId } = useRestaurant()
  const queryClient = useQueryClient()
  const { search, status, priority, includeCompletedToday } = options

  const query = useQuery({
    queryKey: ['callbacks', restaurantId, search, status, priority, includeCompletedToday],
    queryFn: async () => {
      if (!restaurantId) return []

      let query = supabase
        .from('callbacks')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true })

      if (search) {
        query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`)
      }

      if (status) {
        if (status === 'completed' && includeCompletedToday) {
          // Only show today's completed callbacks
          const todayStart = startOfDay(new Date())
          query = query
            .eq('status', 'completed')
            .gte('completed_at', todayStart.toISOString())
        } else {
          query = query.eq('status', status)
        }
      }

      if (priority) {
        query = query.eq('priority', priority)
      }

      const { data, error } = await query

      if (error) throw error

      return data as Callback[]
    },
    enabled: !!restaurantId,
  })

  // Mutation to mark callback as in progress
  const markInProgressMutation = useMutation({
    mutationFn: async (callbackId: string) => {
      const { data, error } = await supabase
        .from('callbacks')
        .update({
          status: 'in_progress',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', callbackId)
        .select()
        .single()

      if (error) throw error

      return data as Callback
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callbacks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  // Mutation to mark callback as complete with resolution
  const markCompleteMutation = useMutation({
    mutationFn: async ({
      callbackId,
      resolution,
    }: {
      callbackId: string
      resolution: CallbackResolution
    }) => {
      // First get current callback to increment attempts
      const { data: callback } = await supabase
        .from('callbacks')
        .select('attempts, notes')
        .eq('id', callbackId)
        .single()

      const resolutionNote = `[${resolution.resolutionType.toUpperCase()}] ${resolution.notes}${
        resolution.bookingId ? ` (Booking: ${resolution.bookingId})` : ''
      }`

      const { data, error } = await supabase
        .from('callbacks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          attempts: (callback?.attempts ?? 0) + 1,
          notes: callback?.notes
            ? `${callback.notes}\n\n${resolutionNote}`
            : resolutionNote,
        })
        .eq('id', callbackId)
        .select()
        .single()

      if (error) throw error

      return data as Callback
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callbacks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  // Mutation to mark callback as failed/cancelled
  const markFailedMutation = useMutation({
    mutationFn: async ({
      callbackId,
      reason,
    }: {
      callbackId: string
      reason?: string
    }) => {
      // First get current callback to increment attempts
      const { data: callback } = await supabase
        .from('callbacks')
        .select('attempts, notes')
        .eq('id', callbackId)
        .single()

      const { data, error } = await supabase
        .from('callbacks')
        .update({
          status: 'cancelled',
          attempts: (callback?.attempts ?? 0) + 1,
          last_attempt_at: new Date().toISOString(),
          notes: reason
            ? callback?.notes
              ? `${callback.notes}\n\n[CANCELLED] ${reason}`
              : `[CANCELLED] ${reason}`
            : callback?.notes,
        })
        .eq('id', callbackId)
        .select()
        .single()

      if (error) throw error

      return data as Callback
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callbacks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  return {
    callbacks: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    markInProgress: markInProgressMutation.mutate,
    markComplete: markCompleteMutation.mutate,
    markFailed: markFailedMutation.mutate,
    isUpdating:
      markInProgressMutation.isPending ||
      markCompleteMutation.isPending ||
      markFailedMutation.isPending,
  }
}

/**
 * Hook to fetch callback metrics
 */
export function useCallbackMetrics() {
  const { restaurantId } = useRestaurant()

  const query = useQuery({
    queryKey: ['callback-metrics', restaurantId],
    queryFn: async (): Promise<CallbackMetrics> => {
      if (!restaurantId) {
        return {
          avgResolutionTime: 0,
          pendingCount: 0,
          urgentCount: 0,
          oldestPendingMinutes: 0,
          reasonBreakdown: {},
        }
      }

      // Fetch pending callbacks
      const { data: pendingCallbacks, error: pendingError } = await supabase
        .from('callbacks')
        .select('id, priority, reason, created_at')
        .eq('restaurant_id', restaurantId)
        .in('status', ['pending', 'in_progress'])

      if (pendingError) throw pendingError

      // Fetch completed callbacks from today for resolution time
      const todayStart = startOfDay(new Date())
      const { data: completedToday, error: completedError } = await supabase
        .from('callbacks')
        .select('created_at, completed_at')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'completed')
        .gte('completed_at', todayStart.toISOString())

      if (completedError) throw completedError

      // Calculate metrics
      const now = new Date()
      const pendingCount = pendingCallbacks?.length ?? 0
      const urgentCount = pendingCallbacks?.filter((c) => c.priority === 'urgent').length ?? 0

      // Calculate oldest pending
      let oldestPendingMinutes = 0
      if (pendingCallbacks && pendingCallbacks.length > 0) {
        const oldest = pendingCallbacks.reduce((min, c) =>
          new Date(c.created_at) < new Date(min.created_at) ? c : min
        )
        oldestPendingMinutes = Math.floor(
          (now.getTime() - new Date(oldest.created_at).getTime()) / 60000
        )
      }

      // Calculate average resolution time
      let avgResolutionTime = 0
      if (completedToday && completedToday.length > 0) {
        const totalMinutes = completedToday.reduce((sum, c) => {
          if (c.completed_at) {
            const created = new Date(c.created_at).getTime()
            const completed = new Date(c.completed_at).getTime()
            return sum + (completed - created) / 60000
          }
          return sum
        }, 0)
        avgResolutionTime = Math.round(totalMinutes / completedToday.length)
      }

      // Calculate reason breakdown
      const reasonBreakdown: Record<string, number> = {}
      pendingCallbacks?.forEach((c) => {
        // Extract first few words as reason category
        const reasonKey = c.reason?.split(' ').slice(0, 3).join(' ') || 'Unknown'
        reasonBreakdown[reasonKey] = (reasonBreakdown[reasonKey] || 0) + 1
      })

      return {
        avgResolutionTime,
        pendingCount,
        urgentCount,
        oldestPendingMinutes,
        reasonBreakdown,
      }
    },
    enabled: !!restaurantId,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  return {
    metrics: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Hook to fetch call summary for a callback
 */
export function useCallbackCallSummary(callLogId: string | null) {
  const query = useQuery({
    queryKey: ['callback-call-summary', callLogId],
    queryFn: async () => {
      if (!callLogId) return null

      const { data, error } = await supabase
        .from('call_logs')
        .select('summary, transcript, started_at, duration_seconds')
        .eq('id', callLogId)
        .single()

      if (error) throw error

      return data
    },
    enabled: !!callLogId,
  })

  return {
    callSummary: query.data,
    isLoading: query.isLoading,
  }
}

/**
 * Hook to update a callback
 */
export function useUpdateCallback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...update }: CallbackUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('callbacks')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return data as Callback
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['callbacks'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
