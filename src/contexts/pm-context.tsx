'use client'

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type PropertyManager = Tables<'c1_property_managers'>

interface PMContextType {
  propertyManager: PropertyManager | null
  loading: boolean
  signOut: () => void
}

const PMContext = createContext<PMContextType>({
  propertyManager: null,
  loading: true,
  signOut: () => {},
})

export function PMProvider({ children }: { children: ReactNode }) {
  const [propertyManager, setPropertyManager] = useState<PropertyManager | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let mounted = true

    const loadPM = async () => {
      try {
        // getUser() validates with server - unlike getSession() which reads stale local data
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
          if (mounted) {
            setPropertyManager(null)
            setLoading(false)
          }
          return
        }

        // Fetch PM record
        const { data: pm } = await supabase
          .from('c1_property_managers')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (mounted) {
          setPropertyManager(pm)
          setLoading(false)
        }
      } catch {
        if (mounted) {
          setPropertyManager(null)
          setLoading(false)
        }
      }
    }

    // Initial load with timeout failsafe
    const initialTimeout = setTimeout(() => {
      // If initial loadPM takes too long, auth is broken - force logout
      supabase.auth.signOut().catch(() => {})
      window.location.href = '/login'
    }, 8000)

    loadPM().finally(() => clearTimeout(initialTimeout))

    // Re-check auth when tab becomes visible (handles backgrounded tabs returning)
    // Has timeout failsafe - if getUser() hangs, redirect to login
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        const timeout = setTimeout(() => {
          // If loadPM takes too long, auth is broken - force logout
          supabase.auth.signOut().catch(() => {})
          window.location.href = '/login'
        }, 8000)

        try {
          await loadPM()
        } finally {
          clearTimeout(timeout)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          setPropertyManager(null)
          setLoading(false)
        } else if (event === 'SIGNED_IN' && session?.user) {
          setLoading(true)
          const { data: pm } = await supabase
            .from('c1_property_managers')
            .select('*')
            .eq('user_id', session.user.id)
            .single()
          if (mounted) {
            setPropertyManager(pm)
            setLoading(false)
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refreshed - no action needed, session is still valid
        }
      }
    )

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    setLoading(true)
    await supabase.auth.signOut()
    // Don't manually clear cookies - Supabase handles this
    setPropertyManager(null)
    setLoading(false)
    window.location.href = '/login'
  }, [supabase])

  return (
    <PMContext.Provider value={{ propertyManager, loading, signOut }}>
      {children}
    </PMContext.Provider>
  )
}

export function usePM() {
  const context = useContext(PMContext)
  if (context === undefined) {
    throw new Error('usePM must be used within a PMProvider')
  }
  return context
}
