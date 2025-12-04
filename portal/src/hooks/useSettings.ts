import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from './useSupabase'
import type { Restaurant, RestaurantUpdate } from '@/types/database'

// Business hours type
export interface DayHours {
  isOpen: boolean
  openTime: string
  closeTime: string
  lastSeating: string
}

export interface BusinessHours {
  monday: DayHours
  tuesday: DayHours
  wednesday: DayHours
  thursday: DayHours
  friday: DayHours
  saturday: DayHours
  sunday: DayHours
}

// Settings type stored in restaurant.settings JSON
export interface RestaurantSettings {
  // Booking settings
  maxPartySize: number
  largePartyThreshold: number
  lastSeatingOffset: number // minutes before close
  confirmationSmsTemplate: string
  cancellationPolicy: string

  // Notifications
  slackWebhookUrl: string | null
  alertErrorRateThreshold: number // percentage
  alertCallbackAgeThreshold: number // hours
  dailyDigestEmail: string | null
  emailNotifications: {
    dailySummary: boolean
    urgentCallbacks: boolean
    failedCalls: boolean
  }

  // Knowledge base
  knowledgeBase: KnowledgeBaseEntry[]

  // Webhook secret
  webhookSecret: string | null
}

export interface KnowledgeBaseEntry {
  id: string
  category: string
  topic: string
  keywords: string[]
  answer: string | null
  hardRule: 'TRANSFER_IMMEDIATELY' | 'CHECK_AVAILABILITY' | 'COLLECT_CALLBACK' | null
  transferScript: string | null
  isActive: boolean
}

// Default settings
const defaultSettings: RestaurantSettings = {
  maxPartySize: 8,
  largePartyThreshold: 6,
  lastSeatingOffset: 60,
  confirmationSmsTemplate: 'Hi {customer_name}! Your reservation at {restaurant_name} is confirmed for {date} at {time} for {party_size} guests. Confirmation code: {confirmation_code}. Reply CANCEL to cancel.',
  cancellationPolicy: 'Reservations can be cancelled up to 2 hours before the scheduled time. No-shows may result in a fee.',
  slackWebhookUrl: null,
  alertErrorRateThreshold: 10,
  alertCallbackAgeThreshold: 4,
  dailyDigestEmail: null,
  emailNotifications: {
    dailySummary: true,
    urgentCallbacks: true,
    failedCalls: false,
  },
  knowledgeBase: [],
  webhookSecret: null,
}

// Default business hours
const defaultBusinessHours: BusinessHours = {
  monday: { isOpen: true, openTime: '17:00', closeTime: '22:00', lastSeating: '21:00' },
  tuesday: { isOpen: true, openTime: '17:00', closeTime: '22:00', lastSeating: '21:00' },
  wednesday: { isOpen: true, openTime: '17:00', closeTime: '22:00', lastSeating: '21:00' },
  thursday: { isOpen: true, openTime: '17:00', closeTime: '22:00', lastSeating: '21:00' },
  friday: { isOpen: true, openTime: '17:00', closeTime: '23:00', lastSeating: '22:00' },
  saturday: { isOpen: true, openTime: '12:00', closeTime: '23:00', lastSeating: '22:00' },
  sunday: { isOpen: true, openTime: '12:00', closeTime: '21:00', lastSeating: '20:00' },
}

/**
 * Hook to fetch and update restaurant settings
 */
export function useSettings() {
  const { restaurantId } = useRestaurant()
  const queryClient = useQueryClient()

  // Fetch restaurant data
  const query = useQuery({
    queryKey: ['settings', restaurantId],
    queryFn: async () => {
      if (!restaurantId) return null

      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .single()

      if (error) throw error

      const restaurant = data as Restaurant

      // Parse settings with defaults
      const settings: RestaurantSettings = {
        ...defaultSettings,
        ...(restaurant.settings as Partial<RestaurantSettings> || {}),
      }

      // Parse business hours with defaults
      const businessHours: BusinessHours = {
        ...defaultBusinessHours,
        ...(restaurant.business_hours as Partial<BusinessHours> || {}),
      }

      return {
        restaurant,
        settings,
        businessHours,
      }
    },
    enabled: !!restaurantId,
  })

  // Update business info mutation
  const updateBusinessInfo = useMutation({
    mutationFn: async (data: {
      name: string
      phone: string
      address: string | null
      timezone: string
    }) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const { error } = await supabase
        .from('restaurants')
        .update({
          name: data.name,
          phone: data.phone,
          address: data.address,
          timezone: data.timezone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
    },
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['settings', restaurantId] })

      // Snapshot previous value
      const previous = queryClient.getQueryData(['settings', restaurantId])

      // Optimistically update
      queryClient.setQueryData(['settings', restaurantId], (old: typeof query.data) => {
        if (!old) return old
        return {
          ...old,
          restaurant: {
            ...old.restaurant,
            ...newData,
          },
        }
      })

      return { previous }
    },
    onError: (err, newData, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(['settings', restaurantId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  // Update business hours mutation
  const updateBusinessHours = useMutation({
    mutationFn: async (businessHours: BusinessHours) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const { error } = await supabase
        .from('restaurants')
        .update({
          business_hours: businessHours as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
    },
    onMutate: async (newHours) => {
      await queryClient.cancelQueries({ queryKey: ['settings', restaurantId] })
      const previous = queryClient.getQueryData(['settings', restaurantId])

      queryClient.setQueryData(['settings', restaurantId], (old: typeof query.data) => {
        if (!old) return old
        return {
          ...old,
          businessHours: newHours,
        }
      })

      return { previous }
    },
    onError: (err, newData, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings', restaurantId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Update settings mutation
  const updateSettings = useMutation({
    mutationFn: async (newSettings: Partial<RestaurantSettings>) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      // Get current settings
      const currentSettings = query.data?.settings || defaultSettings

      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            ...newSettings,
          } as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
    },
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: ['settings', restaurantId] })
      const previous = queryClient.getQueryData(['settings', restaurantId])

      queryClient.setQueryData(['settings', restaurantId], (old: typeof query.data) => {
        if (!old) return old
        return {
          ...old,
          settings: {
            ...old.settings,
            ...newSettings,
          },
        }
      })

      return { previous }
    },
    onError: (err, newData, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['settings', restaurantId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Add knowledge base entry mutation
  const addKnowledgeEntry = useMutation({
    mutationFn: async (entry: Omit<KnowledgeBaseEntry, 'id'>) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const currentSettings = query.data?.settings || defaultSettings
      const newEntry: KnowledgeBaseEntry = {
        ...entry,
        id: crypto.randomUUID(),
      }

      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            knowledgeBase: [...currentSettings.knowledgeBase, newEntry],
          } as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
      return newEntry
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Update knowledge base entry mutation
  const updateKnowledgeEntry = useMutation({
    mutationFn: async (entry: KnowledgeBaseEntry) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const currentSettings = query.data?.settings || defaultSettings
      const updatedKnowledgeBase = currentSettings.knowledgeBase.map((e) =>
        e.id === entry.id ? entry : e
      )

      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            knowledgeBase: updatedKnowledgeBase,
          } as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Delete knowledge base entry mutation
  const deleteKnowledgeEntry = useMutation({
    mutationFn: async (entryId: string) => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const currentSettings = query.data?.settings || defaultSettings
      const updatedKnowledgeBase = currentSettings.knowledgeBase.filter(
        (e) => e.id !== entryId
      )

      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            knowledgeBase: updatedKnowledgeBase,
          } as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Regenerate webhook secret mutation
  const regenerateWebhookSecret = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error('No restaurant ID')

      const currentSettings = query.data?.settings || defaultSettings
      const newSecret = crypto.randomUUID().replace(/-/g, '')

      const { error } = await supabase
        .from('restaurants')
        .update({
          settings: {
            ...currentSettings,
            webhookSecret: newSecret,
          } as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', restaurantId)

      if (error) throw error
      return newSecret
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
    },
  })

  // Clear test data mutation
  const clearTestData = useMutation({
    mutationFn: async () => {
      if (!restaurantId) throw new Error('No restaurant ID')

      // Delete all call logs, reservations, callbacks for this restaurant
      const results = await Promise.all([
        supabase.from('call_logs').delete().eq('restaurant_id', restaurantId),
        supabase.from('reservations').delete().eq('restaurant_id', restaurantId),
        supabase.from('callbacks').delete().eq('restaurant_id', restaurantId),
        supabase.from('analytics_daily').delete().eq('restaurant_id', restaurantId),
      ])

      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        throw new Error('Failed to clear some data')
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', restaurantId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['calls'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      queryClient.invalidateQueries({ queryKey: ['callbacks'] })
    },
  })

  return {
    restaurant: query.data?.restaurant ?? null,
    settings: query.data?.settings ?? defaultSettings,
    businessHours: query.data?.businessHours ?? defaultBusinessHours,
    isLoading: query.isLoading,
    error: query.error,

    updateBusinessInfo: updateBusinessInfo.mutate,
    isUpdatingBusinessInfo: updateBusinessInfo.isPending,

    updateBusinessHours: updateBusinessHours.mutate,
    isUpdatingBusinessHours: updateBusinessHours.isPending,

    updateSettings: updateSettings.mutate,
    isUpdatingSettings: updateSettings.isPending,

    addKnowledgeEntry: addKnowledgeEntry.mutate,
    isAddingKnowledgeEntry: addKnowledgeEntry.isPending,

    updateKnowledgeEntry: updateKnowledgeEntry.mutate,
    isUpdatingKnowledgeEntry: updateKnowledgeEntry.isPending,

    deleteKnowledgeEntry: deleteKnowledgeEntry.mutate,
    isDeletingKnowledgeEntry: deleteKnowledgeEntry.isPending,

    regenerateWebhookSecret: regenerateWebhookSecret.mutateAsync,
    isRegeneratingSecret: regenerateWebhookSecret.isPending,

    clearTestData: clearTestData.mutateAsync,
    isClearingTestData: clearTestData.isPending,
  }
}

// Knowledge base categories
export const knowledgeCategories = [
  { id: 'dietary', label: 'Dietary' },
  { id: 'parking', label: 'Parking' },
  { id: 'hours', label: 'Hours' },
  { id: 'cancellation', label: 'Cancellation' },
  { id: 'large_party', label: 'Large Party' },
  { id: 'specials', label: 'Specials' },
  { id: 'dress_code', label: 'Dress Code' },
  { id: 'children', label: 'Children' },
  { id: 'accessibility', label: 'Accessibility' },
  { id: 'payment', label: 'Payment' },
  { id: 'takeout_delivery', label: 'Takeout/Delivery' },
  { id: 'complaints', label: 'Complaints' },
]

// Timezone options
export const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona Time (AZ)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AK)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HI)' },
]
