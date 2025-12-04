import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from './useSupabase'

type TableName = 'call_logs' | 'reservations' | 'callbacks'

/**
 * Hook to subscribe to realtime updates for a specific table
 */
export function useRealtimeSubscription(table: TableName) {
  const queryClient = useQueryClient()
  const { restaurantId } = useRestaurant()

  useEffect(() => {
    if (!restaurantId) return

    // Create a channel for this table
    const channel = supabase
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          console.log(`Realtime ${table} change:`, payload.eventType)

          // Invalidate relevant queries based on the table
          switch (table) {
            case 'call_logs':
              queryClient.invalidateQueries({ queryKey: ['calls'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard'] })
              break
            case 'reservations':
              queryClient.invalidateQueries({ queryKey: ['bookings'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard'] })
              break
            case 'callbacks':
              queryClient.invalidateQueries({ queryKey: ['callbacks'] })
              queryClient.invalidateQueries({ queryKey: ['dashboard'] })
              break
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, table, queryClient])
}

/**
 * Hook to subscribe to all relevant tables for dashboard updates
 */
export function useDashboardRealtime() {
  useRealtimeSubscription('call_logs')
  useRealtimeSubscription('reservations')
  useRealtimeSubscription('callbacks')
}

/**
 * Hook to subscribe to call log updates only
 */
export function useCallsRealtime() {
  useRealtimeSubscription('call_logs')
}

/**
 * Hook to subscribe to reservation updates only
 */
export function useBookingsRealtime() {
  useRealtimeSubscription('reservations')
}

/**
 * Hook to subscribe to callback updates only
 */
export function useCallbacksRealtime() {
  useRealtimeSubscription('callbacks')
}
