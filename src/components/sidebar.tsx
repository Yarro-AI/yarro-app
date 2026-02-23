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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  LayoutDashboard,
  Ticket,
  Building2,
  Users,
  Wrench,
  LogOut,
  ChevronDown,
  User,
  BookOpen,
  Settings,
  Upload,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  MessageCircle,
  Contact,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

interface SidebarCounts {
  properties: number
  landlords: number
  tenants: number
  contractors: number
}

const coreNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, countKey: null },
  { href: '/properties', label: 'Properties', icon: Building2, countKey: 'properties' as const },
  { href: '/landlords', label: 'Landlords', icon: Contact, countKey: 'landlords' as const },
  { href: '/tenants', label: 'Tenants', icon: Users, countKey: 'tenants' as const },
  { href: '/contractors', label: 'Contractors', icon: Wrench, countKey: 'contractors' as const },
]

const activityNavItems = [
  { href: '/tickets', label: 'Tickets', icon: Ticket },
]

const dataManagementItems = [
  { href: '/guide/rules', label: 'Rules & Preferences', icon: SlidersHorizontal },
  { href: '/guide', label: 'Product Guide', icon: BookOpen },
  { href: '/guide/import', label: 'Import Data', icon: Upload },
  { href: '/feedback', label: 'Feedback', icon: MessageCircle },
]

export function Sidebar() {
  const pathname = usePathname()
  const { propertyManager, signOut } = usePM()
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })
  const [counts, setCounts] = useState<SidebarCounts>({ properties: 0, landlords: 0, tenants: 0, contractors: 0 })
  const supabase = createClient()

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const fetchCounts = useCallback(async () => {
    if (!propertyManager) return

    const [propsRes, landlordsRes, tenantsRes, contractorsRes] = await Promise.all([
      supabase.from('c1_properties').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_landlords').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_tenants').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_contractors').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id).eq('active', true),
    ])

    setCounts({
      properties: propsRes.count || 0,
      landlords: landlordsRes.count || 0,
      tenants: tenantsRes.count || 0,
      contractors: contractorsRes.count || 0,
    })
  }, [propertyManager, supabase])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  const isDark = mounted && (resolvedTheme === 'dark' || resolvedTheme === 'blue')
  const logoSrc = isDark ? '/logo-white.png' : '/logo-wordmark.png'

  // Shared nav link renderer
  const NavLink = ({ href, label, icon: Icon, count }: { href: string; label: string; icon: React.ElementType; count?: number | null }) => {
    const isActive = pathname === href

    const link = (
      <Link
        href={href}
        className={cn(
          'flex items-center rounded-lg text-sm font-medium transition-all',
          collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5',
          isActive
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
        )}
      >
        <div className={cn('flex items-center', collapsed ? '' : 'gap-3')}>
          <Icon className="h-5 w-5 flex-shrink-0" />
          {!collapsed && label}
        </div>
        {!collapsed && count !== null && count !== undefined && (
          <span className={cn(
            'text-xs font-medium tabular-nums',
            isActive ? 'text-sidebar-primary-foreground/80' : 'text-sidebar-foreground/50'
          )}>
            {count}
          </span>
        )}
      </Link>
    )

    if (collapsed) {
      return (
        <Tooltip key={href}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{label}{count !== null && count !== undefined ? ` (${count})` : ''}</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return link
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className={cn(
        'flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}>
        {/* Logo + Controls */}
        <div className={cn(
          'border-b border-sidebar-border flex items-center',
          collapsed ? 'p-3 justify-center flex-col gap-2' : 'p-6 justify-between'
        )}>
          {collapsed ? (
            <Image
              src="/logo-icon.png"
              alt="Yarro"
              width={28}
              height={28}
              className="opacity-90"
              priority
            />
          ) : (
            <Image
              src={logoSrc}
              alt="Yarro"
              width={100}
              height={30}
              className="opacity-90"
              priority
            />
          )}
          {!collapsed && (
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                onClick={toggleCollapsed}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Expand button when collapsed */}
        {collapsed && (
          <div className="px-2 pt-2 flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={toggleCollapsed}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>Expand sidebar</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span><ThemeToggle /></span>
              </TooltipTrigger>
              <TooltipContent side="right"><p>Theme</p></TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Navigation */}
        <nav className={cn('flex-1 py-4 space-y-1 overflow-y-auto', collapsed ? 'px-2' : 'px-3')}>
          {coreNavItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              count={item.countKey ? counts[item.countKey] : null}
            />
          ))}

          {/* Activity Section */}
          <div className="pt-4 mt-4 border-t border-sidebar-border/40">
            {!collapsed && (
              <p className="px-3 py-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                Activity
              </p>
            )}
            {activityNavItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </div>

          {/* Resources Section */}
          <div className="pt-4 mt-4 border-t border-sidebar-border/40">
            {!collapsed && (
              <p className="px-3 py-2 text-xs font-medium text-sidebar-foreground/50 uppercase tracking-wider">
                Resources
              </p>
            )}
            {dataManagementItems.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </div>
        </nav>

        {/* User section */}
        <div className={cn('border-t border-sidebar-border', collapsed ? 'p-2' : 'p-3')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full h-10 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-sidebar-accent text-sidebar-foreground">
                        <User className="h-4 w-4" />
                      </div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{propertyManager?.business_name || propertyManager?.name || 'User'}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
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
              )}
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
    </TooltipProvider>
  )
}
