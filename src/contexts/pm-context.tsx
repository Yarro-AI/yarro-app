'use client'

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
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
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let mounted = true

    const fetchPM = async (userId: string) => {
      const { data: pm } = await supabase
        .from('c1_property_managers')
        .select('*')
        .eq('user_id', userId)
        .single()
      return pm
    }

    // Listen for auth changes - handles ALL events including initial session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session?.user) {
          setPropertyManager(null)
          setLoading(false)
        } else if (
          event === 'INITIAL_SESSION' ||
          event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED'
        ) {
          const pm = await fetchPM(session!.user.id)
          if (mounted) {
            setPropertyManager(pm)
            setLoading(false)
          }
        }
      }
    )

    // Fallback: never stay loading forever
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

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
