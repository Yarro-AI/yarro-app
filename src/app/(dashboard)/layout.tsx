'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { usePM } from '@/contexts/pm-context'
import { DateRangeProvider } from '@/contexts/date-range-context'
import { ErrorBoundary } from '@/components/error-boundary'
import { TicketDrawerProvider } from '@/components/ticket-drawer-provider'
import { DashboardHeader } from '@/components/dashboard-header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { loading, propertyManager, authUser } = usePM()
  const router = useRouter()
  const pathname = usePathname()
  const [checkingOnboarding, setCheckingOnboarding] = useState(true)

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

  // Skip property check — demo data or Getting Started handles it
  useEffect(() => {
    setCheckingOnboarding(false)
  }, [propertyManager])

  // Trial expiry check — redirect to /billing if trial has ended
  useEffect(() => {
    if (!propertyManager) return
    const { subscription_status, trial_ends_at } = propertyManager
    if (subscription_status === 'active') return // paid user, no gate
    if (subscription_status === 'trialing' && trial_ends_at) {
      const expired = new Date(trial_ends_at).getTime() < Date.now()
      if (expired) {
        router.push('/billing')
      }
    }
    if (subscription_status === 'expired') {
      router.push('/billing')
    }
  }, [propertyManager, router])

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
    <div className="flex h-screen bg-muted">
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
        {/* Global search + create header */}
        <DashboardHeader />
        <main className="flex-1 overflow-hidden">
          <DateRangeProvider>
            <ErrorBoundary>
              <TicketDrawerProvider />
              {children}
            </ErrorBoundary>
          </DateRangeProvider>
        </main>
      </div>
    </div>
  )
}
