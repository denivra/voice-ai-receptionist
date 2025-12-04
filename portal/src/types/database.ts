/**
 * Database types for Voice AI Receptionist
 *
 * TODO: Generate these types from Supabase using:
 * npx supabase gen types typescript --project-id your-project-id > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string
          name: string
          phone: string
          address: string | null
          timezone: string
          business_hours: Json
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone: string
          address?: string | null
          timezone?: string
          business_hours?: Json
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string
          address?: string | null
          timezone?: string
          business_hours?: Json
          settings?: Json
          created_at?: string
          updated_at?: string
        }
      }
      call_logs: {
        Row: {
          id: string
          restaurant_id: string
          vapi_call_id: string
          phone_number: string
          direction: 'inbound' | 'outbound'
          started_at: string
          ended_at: string | null
          duration_seconds: number | null
          outcome: 'completed' | 'transferred' | 'failed' | 'missed'
          transfer_reason: string | null
          transcript: string | null
          summary: string | null
          sentiment: 'positive' | 'neutral' | 'negative' | null
          recording_url: string | null
          cost_cents: number | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          vapi_call_id: string
          phone_number: string
          direction?: 'inbound' | 'outbound'
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          outcome?: 'completed' | 'transferred' | 'failed' | 'missed'
          transfer_reason?: string | null
          transcript?: string | null
          summary?: string | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          recording_url?: string | null
          cost_cents?: number | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          vapi_call_id?: string
          phone_number?: string
          direction?: 'inbound' | 'outbound'
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          outcome?: 'completed' | 'transferred' | 'failed' | 'missed'
          transfer_reason?: string | null
          transcript?: string | null
          summary?: string | null
          sentiment?: 'positive' | 'neutral' | 'negative' | null
          recording_url?: string | null
          cost_cents?: number | null
          metadata?: Json
          created_at?: string
        }
      }
      reservations: {
        Row: {
          id: string
          restaurant_id: string
          customer_name: string
          customer_phone: string
          customer_email: string | null
          party_size: number
          reservation_time: string
          seating_type: 'any' | 'indoor' | 'outdoor' | 'bar' | 'patio' | 'private'
          status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'seated' | 'completed'
          special_requests: string | null
          confirmation_code: string
          source: 'ai_phone' | 'website' | 'walk_in' | 'partner'
          call_log_id: string | null
          sms_consent: boolean
          confirmation_sent_at: string | null
          reminder_sent_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          customer_name: string
          customer_phone: string
          customer_email?: string | null
          party_size: number
          reservation_time: string
          seating_type?: 'any' | 'indoor' | 'outdoor' | 'bar' | 'patio' | 'private'
          status?: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'seated' | 'completed'
          special_requests?: string | null
          confirmation_code?: string
          source?: 'ai_phone' | 'website' | 'walk_in' | 'partner'
          call_log_id?: string | null
          sms_consent?: boolean
          confirmation_sent_at?: string | null
          reminder_sent_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          customer_name?: string
          customer_phone?: string
          customer_email?: string | null
          party_size?: number
          reservation_time?: string
          seating_type?: 'any' | 'indoor' | 'outdoor' | 'bar' | 'patio' | 'private'
          status?: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'seated' | 'completed'
          special_requests?: string | null
          confirmation_code?: string
          source?: 'ai_phone' | 'website' | 'walk_in' | 'partner'
          call_log_id?: string | null
          sms_consent?: boolean
          confirmation_sent_at?: string | null
          reminder_sent_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      callbacks: {
        Row: {
          id: string
          restaurant_id: string
          customer_phone: string
          customer_name: string | null
          reason: string
          priority: 'low' | 'normal' | 'high' | 'urgent'
          status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          notes: string | null
          call_log_id: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          attempts: number
          last_attempt_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          customer_phone: string
          customer_name?: string | null
          reason: string
          priority?: 'low' | 'normal' | 'high' | 'urgent'
          status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          notes?: string | null
          call_log_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          attempts?: number
          last_attempt_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          customer_phone?: string
          customer_name?: string | null
          reason?: string
          priority?: 'low' | 'normal' | 'high' | 'urgent'
          status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          notes?: string | null
          call_log_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          attempts?: number
          last_attempt_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      analytics_daily: {
        Row: {
          id: string
          restaurant_id: string
          date: string
          total_calls: number
          completed_calls: number
          transferred_calls: number
          failed_calls: number
          missed_calls: number
          total_bookings: number
          ai_bookings: number
          total_duration_seconds: number
          avg_duration_seconds: number
          total_cost_cents: number
          sentiment_positive: number
          sentiment_neutral: number
          sentiment_negative: number
          peak_hour: number | null
          transfer_reasons: Json
          created_at: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          date: string
          total_calls?: number
          completed_calls?: number
          transferred_calls?: number
          failed_calls?: number
          missed_calls?: number
          total_bookings?: number
          ai_bookings?: number
          total_duration_seconds?: number
          avg_duration_seconds?: number
          total_cost_cents?: number
          sentiment_positive?: number
          sentiment_neutral?: number
          sentiment_negative?: number
          peak_hour?: number | null
          transfer_reasons?: Json
          created_at?: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          date?: string
          total_calls?: number
          completed_calls?: number
          transferred_calls?: number
          failed_calls?: number
          missed_calls?: number
          total_bookings?: number
          ai_bookings?: number
          total_duration_seconds?: number
          avg_duration_seconds?: number
          total_cost_cents?: number
          sentiment_positive?: number
          sentiment_neutral?: number
          sentiment_negative?: number
          peak_hour?: number | null
          transfer_reasons?: Json
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_table_availability: {
        Args: {
          p_restaurant_id: string
          p_datetime: string
          p_party_size: number
          p_seating_preference?: string
        }
        Returns: Json
      }
      create_reservation: {
        Args: {
          p_restaurant_id: string
          p_customer_name: string
          p_customer_phone: string
          p_datetime: string
          p_party_size: number
          p_seating_type?: string
          p_special_requests?: string
          p_sms_consent?: boolean
          p_call_log_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Restaurant = Database['public']['Tables']['restaurants']['Row']
export type CallLog = Database['public']['Tables']['call_logs']['Row']
export type Reservation = Database['public']['Tables']['reservations']['Row']
export type Callback = Database['public']['Tables']['callbacks']['Row']
export type AnalyticsDaily = Database['public']['Tables']['analytics_daily']['Row']

// Insert types
export type RestaurantInsert = Database['public']['Tables']['restaurants']['Insert']
export type CallLogInsert = Database['public']['Tables']['call_logs']['Insert']
export type ReservationInsert = Database['public']['Tables']['reservations']['Insert']
export type CallbackInsert = Database['public']['Tables']['callbacks']['Insert']

// Update types
export type RestaurantUpdate = Database['public']['Tables']['restaurants']['Update']
export type CallLogUpdate = Database['public']['Tables']['call_logs']['Update']
export type ReservationUpdate = Database['public']['Tables']['reservations']['Update']
export type CallbackUpdate = Database['public']['Tables']['callbacks']['Update']
