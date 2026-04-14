'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

type PropertyManager = Tables<'c1_property_managers'>

interface AuthUser {
  id: string
  email: string
  name?: string
}

interface PMContextType {
  propertyManager: PropertyManager | null
  authUser: AuthUser | null
  loading: boolean
  signOut: () => void
  refreshPM: () => Promise<void>
}

const PMContext = createContext<PMContextType>({
  propertyManager: null,
  authUser: null,
  loading: true,
  signOut: () => {},
  refreshPM: async () => {},
})

export function PMProvider({ children }: { children: ReactNode }) {
  const [propertyManager, setPropertyManager] = useState<PropertyManager | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
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
      setAuthUser(session?.user ? {
        id: session.user.id,
        email: session.user.email!,
        name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
      } : null)
      setInitialized(true) // Mark that we've checked - now safe to show "no user" state
    })

    // Listen for auth state changes - NOT async, NO Supabase calls inside
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Just update userId and authUser - the other useEffect handles PM fetching
        if (event === 'SIGNED_OUT') {
          setUserId(null)
          setAuthUser(null)
        } else if (session?.user) {
          setUserId(session.user.id)
          setAuthUser({
            id: session.user.id,
            email: session.user.email!,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || '',
          })
        }
      }
    )

    // When tab becomes visible, do a simple session check
    // If no session, redirect to login. Don't use getUser() - it can hang.
    // Skip for public portal pages — they have no auth session by design.
    const publicPrefixes = ['/ooh/', '/contractor/', '/tenant/', '/landlord/', '/i/']
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (publicPrefixes.some((p) => window.location.pathname.startsWith(p))) return
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

  // Refresh PM record - used after creating new PM during onboarding
  const refreshPM = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data: pm } = await supabase
        .from('c1_property_managers')
        .select('*')
        .eq('user_id', userId)
        .single()
      setPropertyManager(pm)
    } catch {
      setPropertyManager(null)
    }
    setLoading(false)
  }, [userId, supabase])

  const signOut = useCallback(async () => {
    setLoading(true)
    // Use server-side logout to properly clear httpOnly cookies
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    // Clear app-specific localStorage (onboarding/notification state)
    // Preserves layout prefs (sidebar-collapsed, sidebar-groups)
    Object.keys(localStorage)
      .filter(k => k.startsWith('yarro_'))
      .forEach(k => localStorage.removeItem(k))
    setPropertyManager(null)
    setAuthUser(null)
    setUserId(null)
    setLoading(false)
    window.location.href = '/login'
  }, [])

  const contextValue = useMemo(() => ({
    propertyManager, authUser, loading, signOut, refreshPM
  }), [propertyManager, authUser, loading, signOut, refreshPM])

  return (
    <PMContext.Provider value={contextValue}>
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
