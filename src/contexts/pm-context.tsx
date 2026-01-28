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
  const [userId, setUserId] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false) // Track if initial session check is done
  const supabase = createClient()

  // Fetch PM record when userId changes (separate from auth listener)
  useEffect(() => {
    if (!userId) {
      setPropertyManager(null)
      // Only set loading=false if we've completed the initial session check
      // Otherwise we'd briefly show "not logged in" before session check resolves
      if (initialized) {
        setLoading(false)
      }
      return
    }

    let mounted = true
    setLoading(true)

    const fetchPM = async () => {
      try {
        const { data: pm } = await supabase
          .from('c1_property_managers')
          .select('*')
          .eq('user_id', userId)
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
    fetchPM()

    return () => { mounted = false }
  }, [userId, initialized, supabase])

  // Auth state management
  // CRITICAL: onAuthStateChange callback must NOT be async and must NOT make Supabase calls
  // See: https://github.com/supabase/supabase/issues/35754
  useEffect(() => {
    // Initial session check - getSession() reads cookies, no network call (won't hang)
    // Middleware already validates with getUser() on every request
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
      setInitialized(true) // Mark that we've checked - now safe to show "no user" state
    })

    // Listen for auth state changes - NOT async, NO Supabase calls inside
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Just update userId - the other useEffect handles PM fetching
        if (event === 'SIGNED_OUT') {
          setUserId(null)
        } else if (session?.user) {
          setUserId(session.user.id)
        }
      }
    )

    // When tab becomes visible, do a simple session check
    // If no session, redirect to login. Don't use getUser() - it can hang.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            window.location.href = '/login'
          } else if (session.user.id !== userId) {
            // Session user changed (unlikely but handle it)
            setUserId(session.user.id)
          }
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [supabase, userId])

  const signOut = useCallback(async () => {
    setLoading(true)
    // Use server-side logout to properly clear httpOnly cookies
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setPropertyManager(null)
    setUserId(null)
    setLoading(false)
    window.location.href = '/login'
  }, [])

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
