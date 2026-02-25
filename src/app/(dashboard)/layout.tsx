'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { usePM } from '@/contexts/pm-context'
import { DateRangeProvider } from '@/contexts/date-range-context'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/error-boundary'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { loading, propertyManager, authUser } = usePM()
  const router = useRouter()
  const pathname = usePathname()
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)
  const supabase = createClient()

  // Smart redirect after loading completes
  useEffect(() => {
    if (loading) return

    if (!authUser) {
      // No auth at all → login
      router.push('/login')
    } else if (!propertyManager && pathname !== '/import') {
      // Auth exists but no PM record yet → onboarding will create PM
      router.push('/import')
    }
  }, [loading, propertyManager, authUser, router, pathname])

  // Check if PM needs onboarding (no properties yet)
  // Skip this check for new users without PM (they're on /import creating their PM)
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
          setCheckingOnboarding(false)
          return
        }

        if (count === 0) {
          router.push('/import')
        }
        setCheckingOnboarding(false)
      } catch {
        setCheckingOnboarding(false)
      }
    }

    checkProperties()
  }, [propertyManager, pathname, router, supabase])

  // Loading state - simple, no timeouts needed now that root cause is fixed
  if (loading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Redirecting to login...</div>
      </div>
    )
  }

  // Allow /import route without PM (new user onboarding)
  if (!propertyManager && pathname !== '/import') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Redirecting to onboarding...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white dark:bg-background">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile-only hamburger bar — hidden on lg+ where docked sidebar is visible */}
        <div className="lg:hidden flex items-center px-3 h-12 border-b border-border/40 flex-shrink-0 bg-background">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 overflow-y-auto bg-card">
              <Sidebar />
            </SheetContent>
          </Sheet>
        </div>
        <main className="flex-1 overflow-auto">
          <DateRangeProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </DateRangeProvider>
        </main>
      </div>
    </div>
  )
}
