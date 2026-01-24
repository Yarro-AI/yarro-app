'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/error-boundary'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { loading, propertyManager, signOut } = usePM()
  const router = useRouter()
  const pathname = usePathname()
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!loading && !propertyManager) {
      // Sign out to clear cookies, preventing redirect loop with middleware
      signOut()
    }
  }, [loading, propertyManager, signOut])

  // Check if PM needs onboarding (no properties yet)
  useEffect(() => {
    if (!propertyManager || pathname === '/import' || pathname === '/settings' || pathname === '/update-password') {
      setCheckingOnboarding(false)
      return
    }

    const checkProperties = async () => {
      const { count } = await supabase
        .from('c1_properties')
        .select('id', { count: 'exact', head: true })
        .eq('property_manager_id', propertyManager.id)

      if (count === 0) {
        router.push('/import')
      }
      setCheckingOnboarding(false)
    }

    checkProperties()
  }, [propertyManager, pathname, router, supabase])

  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!propertyManager) {
    return null
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
