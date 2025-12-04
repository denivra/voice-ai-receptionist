import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

/**
 * Hook to manage Supabase authentication state
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return {
    user,
    session,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!session,
  }
}

/**
 * Hook to get the current restaurant context
 * TODO: Implement multi-restaurant support
 */
export function useRestaurant() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: Fetch restaurant ID from user profile or session
    // For now, use environment variable or default
    const defaultRestaurantId = import.meta.env.VITE_DEFAULT_RESTAURANT_ID || null
    setRestaurantId(defaultRestaurantId)
    setLoading(false)
  }, [])

  return {
    restaurantId,
    loading,
    setRestaurantId,
  }
}
