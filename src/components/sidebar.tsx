'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  Wrench,
  MessageSquare,
  CheckCircle2,
  Mail,
  LogOut,
  ChevronDown,
  User,
  BookOpen,
  Settings,
  Upload,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

interface SidebarCounts {
  properties: number
  tenants: number
  contractors: number
}

// Core navigation - your data (countKey maps to SidebarCounts)
const coreNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, countKey: null },
  { href: '/properties', label: 'Properties', icon: Building2, countKey: 'properties' as const },
  { href: '/tenants', label: 'Tenants', icon: Users, countKey: 'tenants' as const },
  { href: '/contractors', label: 'Contractors', icon: Wrench, countKey: 'contractors' as const },
]

// Activity navigation - system generated
const activityNavItems = [
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/conversations', label: 'Conversations', icon: MessageSquare },
  { href: '/messages', label: 'Messages', icon: Mail },
  { href: '/completions', label: 'Completions', icon: CheckCircle2 },
]

const dataManagementItems = [
  { href: '/guide/rules', label: 'Rules & Preferences', icon: SlidersHorizontal },
  { href: '/guide', label: 'Product Guide', icon: BookOpen },
  { href: '/guide/import', label: 'Import Data', icon: Upload },
]

export function Sidebar() {
  const pathname = usePathname()
  const { propertyManager, signOut } = usePM()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [counts, setCounts] = useState<SidebarCounts>({ properties: 0, tenants: 0, contractors: 0 })
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchCounts = useCallback(async () => {
    if (!propertyManager) return

    const [propsRes, tenantsRes, contractorsRes] = await Promise.all([
      supabase.from('c1_properties').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_tenants').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_contractors').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id).eq('active', true),
    ])

    setCounts({
      properties: propsRes.count || 0,
      tenants: tenantsRes.count || 0,
      contractors: contractorsRes.count || 0,
    })
  }, [propertyManager, supabase])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  // Use wordmark logo for light mode, white logo for dark mode
  const logoSrc = mounted && resolvedTheme === 'dark' ? '/logo-white.png' : '/logo-wordmark.png'

  return (
    <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo + Theme Toggle */}
      <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
        <Image
          src={logoSrc}
          alt="Yarro"
          width={100}
          height={30}
          className="opacity-90"
          priority
        />
        <ThemeToggle />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* Core Navigation */}
        {coreNavItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          const count = item.countKey ? counts[item.countKey] : null

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </div>
              {count !== null && (
                <span className={cn(
                  'text-xs font-medium tabular-nums',
                  isActive ? 'text-sidebar-primary-foreground/80' : 'text-sidebar-foreground/50'
                )}>
                  {count}
                </span>
              )}
            </Link>
          )
        })}

        {/* Activity Section - System Generated */}
        <div className="pt-4 mt-4 border-t border-sidebar-border/40">
          <p className="px-3 py-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
            Activity
          </p>
          {activityNavItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Resources Section */}
        <div className="pt-4 mt-4 border-t border-sidebar-border/40">
          <p className="px-3 py-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
            Resources
          </p>
          {dataManagementItems.map((item) => {
            // Use exact match only - prevents /guide highlighting when on /guide/import
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between px-3 py-2.5 h-auto text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sidebar-accent text-sidebar-foreground flex-shrink-0">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-sm font-medium truncate max-w-[120px]">
                    {propertyManager?.business_name || propertyManager?.name || 'User'}
                  </span>
                  <span className="text-xs text-sidebar-foreground/50 truncate max-w-[120px]">
                    {propertyManager?.email}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{propertyManager?.name}</p>
              <p className="text-xs text-muted-foreground">{propertyManager?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
