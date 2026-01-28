'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/error-boundary'
import { Button } from '@/components/ui/button'

const SOFT_TIMEOUT_MS = 5000  // Show recovery buttons after 5s
const HARD_TIMEOUT_MS = 10000 // Force logout after 10s - don't leave user stuck

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { loading, propertyManager } = usePM()
  const router = useRouter()
  const pathname = usePathname()
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const supabase = createClient()

  // If no PM after loading completes, redirect to login
  useEffect(() => {
    if (!loading && !propertyManager) {
      router.push('/login')
    }
  }, [loading, propertyManager, router])

  // Loading timeout - show recovery UI, then force logout
  useEffect(() => {
    if (loading || checkingOnboarding) {
      // Soft timeout - show buttons
      const softTimeout = setTimeout(() => {
        setLoadingTimedOut(true)
      }, SOFT_TIMEOUT_MS)

      // Hard timeout - force logout (don't leave user stuck forever)
      const hardTimeout = setTimeout(async () => {
        const freshSupabase = createClient()
        await freshSupabase.auth.signOut().catch(() => {})
        window.location.href = '/login'
      }, HARD_TIMEOUT_MS)

      return () => {
        clearTimeout(softTimeout)
        clearTimeout(hardTimeout)
      }
    } else {
      setLoadingTimedOut(false)
    }
  }, [loading, checkingOnboarding])

  // Check if PM needs onboarding (no properties yet)
  useEffect(() => {
    if (!propertyManager || pathname === '/import' || pathname === '/settings' || pathname === '/update-password') {
      setCheckingOnboarding(false)
      return
    }

    const checkProperties = async () => {
      try {
        const { count, error } = await supabase
          .from('c1_properties')
          .select('id', { count: 'exact', head: true })
          .eq('property_manager_id', propertyManager.id)

        if (error) {
          // Query failed - don't block, just proceed to dashboard
          setCheckingOnboarding(false)
          return
        }

        if (count === 0) {
          router.push('/import')
        }
        setCheckingOnboarding(false)
      } catch {
        // Network or other error - don't block, just proceed
        setCheckingOnboarding(false)
      }
    }

    checkProperties()
  }, [propertyManager, pathname, router, supabase])

  // Recovery handlers MUST bypass React - don't depend on context state
  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const handleLogout = useCallback(async () => {
    // Create fresh client - don't use context's potentially-broken reference
    const freshSupabase = createClient()
    await freshSupabase.auth.signOut().catch(() => {})
    // Hard redirect - don't use router which depends on React
    window.location.href = '/login'
  }, [])

  // Loading state with timeout recovery
  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          {loadingTimedOut ? (
            <div className="space-y-4">
              <p className="text-gray-600">Taking longer than expected...</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={handleRetry} variant="default">
                  Refresh Page
                </Button>
                <Button onClick={handleLogout} variant="outline">
                  Log Out
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">Loading...</div>
          )}
        </div>
      </div>
    )
  }

  if (!propertyManager) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Redirecting to login...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </main>
    </div>
  )
}
