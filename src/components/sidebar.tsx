'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
  ChevronRight,
  User,
  Settings,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Contact,
  Plug,
  ShieldCheck,
  BedDouble,
  FileText,
  ClipboardList,
  MessageCircle,
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface SidebarCounts {
  properties: number
  landlords: number
  tenants: number
  contractors: number
}

interface BadgeCounts {
  actionableTickets: number
  complianceIssues: number
}

interface NavChild {
  href: string
  label: string
  countKey?: keyof SidebarCounts
  badgeKey?: keyof BadgeCounts
  comingSoon?: boolean
}

interface NavGroup {
  label: string
  icon: React.ElementType
  defaultOpen?: boolean
  children: NavChild[]
}

// ─────────────────────────────────────────────────────────
// Navigation structure (PRD v3 Section 3.1)
// ─────────────────────────────────────────────────────────

const navGroups: NavGroup[] = [
  {
    label: 'Portfolio',
    icon: Building2,
    defaultOpen: false,
    children: [
      { href: '/properties', label: 'Properties', countKey: 'properties' },
      { href: '/tenants', label: 'Tenants', countKey: 'tenants' },
      { href: '/landlords', label: 'Landlords', countKey: 'landlords' },
      { href: '/rent', label: 'Rent' },
    ],
  },
  {
    label: 'Maintenance',
    icon: Wrench,
    defaultOpen: false,
    children: [
      { href: '/tickets', label: 'Jobs', badgeKey: 'actionableTickets' },
      { href: '/contractors', label: 'Contractors', countKey: 'contractors' },
    ],
  },
  {
    label: 'Compliance',
    icon: ShieldCheck,
    defaultOpen: false,
    children: [
      { href: '/compliance', label: 'Certificates', badgeKey: 'complianceIssues' },
      { href: '/audit-trail', label: 'Audit Trail' },
    ],
  },
  {
    label: 'Automation',
    icon: Settings,
    defaultOpen: false,
    children: [
      { href: '/integrations', label: 'Integrations' },
      { href: '/integrations/import', label: 'Import Data' },
      { href: '/guide/rules', label: 'Settings' },
    ],
  },
]

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getStoredGroupState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem('sidebar-groups')
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

function storeGroupState(state: Record<string, boolean>) {
  localStorage.setItem('sidebar-groups', JSON.stringify(state))
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const { propertyManager, signOut } = usePM()
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    }
    return false
  })
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const stored = getStoredGroupState()
    // Only allow one group open at a time — use stored state or first defaultOpen
    const openLabel = navGroups.find(g => stored[g.label])?.label
      ?? navGroups.find(g => g.defaultOpen !== false)?.label
    const initial: Record<string, boolean> = {}
    navGroups.forEach(g => {
      initial[g.label] = g.label === openLabel
    })
    return initial
  })
  const [counts, setCounts] = useState<SidebarCounts>({ properties: 0, landlords: 0, tenants: 0, contractors: 0 })
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>({ actionableTickets: 0, complianceIssues: 0 })
  const supabase = createClient()

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  const toggleGroup = (label: string) => {
    setGroupOpen(prev => {
      const isOpening = !prev[label]
      // Accordion: close all others when opening one
      const next: Record<string, boolean> = {}
      navGroups.forEach(g => {
        next[g.label] = g.label === label ? isOpening : false
      })
      storeGroupState(next)
      return next
    })
  }

  const fetchCounts = useCallback(async () => {
    if (!propertyManager) {
      setBadgeCounts({ actionableTickets: 0, complianceIssues: 0 })
      return
    }

    const [propsRes, landlordsRes, tenantsRes, contractorsRes, ticketsRes, complianceRes] = await Promise.all([
      supabase.from('c1_properties').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_landlords').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_tenants').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id),
      supabase.from('c1_contractors').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager.id).eq('active', true),
      // Actionable tickets: open + needs PM attention
      supabase.from('c1_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('property_manager_id', propertyManager.id)
        .eq('status', 'open')
        .or('handoff.eq.true,pending_review.eq.true'),
      // Compliance: use RPC for accurate computed statuses (handles "missing" certs + date-based expiry)
      supabase.rpc('compliance_get_all_statuses', { p_pm_id: propertyManager.id }),
    ])

    setCounts({
      properties: propsRes.count || 0,
      landlords: landlordsRes.count || 0,
      tenants: tenantsRes.count || 0,
      contractors: contractorsRes.count || 0,
    })

    const complianceIssues = (complianceRes.data ?? []).filter(
      (c: { status_group: string }) => c.status_group === 'attention'
    ).length

    setBadgeCounts({
      actionableTickets: ticketsRes.count || 0,
      complianceIssues,
    })
  }, [propertyManager, supabase])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  // Check if a path is active (exact match or starts-with for nested routes)
  const isActive = (href: string) => {
    const basePath = href.split('?')[0]
    return pathname === basePath || (basePath !== '/' && pathname.startsWith(basePath + '/'))
  }

  // Check if any child in a group has an active badge
  const groupHasBadge = (group: NavGroup) =>
    group.children.some(c => c.badgeKey && badgeCounts[c.badgeKey] > 0)

  // Check if any child in a group is active
  const isGroupActive = (group: NavGroup) => group.children.some(c => isActive(c.href))

  // ─── Collapsed sidebar ──────────────────────────────────

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col h-full w-16 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200">
          {/* Logo */}
          <div className="p-3 flex justify-center border-b border-sidebar-border">
            <Image src="/logo-icon.png" alt="Yarro" width={28} height={28} className="brightness-0 invert opacity-90" priority />
          </div>

          {/* Expand button */}
          <div className="px-2 pt-2 flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-sidebar-foreground hover:text-white hover:bg-sidebar-accent"
                  onClick={toggleCollapsed}
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>Expand sidebar</p></TooltipContent>
            </Tooltip>
          </div>

          {/* Dashboard icon */}
          <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/"
                  className={cn(
                    'flex items-center justify-center p-2.5 rounded-lg transition-all relative',
                    isActive('/')
                      ? 'bg-sidebar-accent text-white'
                      : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-accent'
                  )}
                >
                  {isActive('/') && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-primary rounded-r" />}
                  <LayoutDashboard className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right"><p>Dashboard</p></TooltipContent>
            </Tooltip>

            {/* Group icons — show group icon only when collapsed */}
            {navGroups.map(group => {
              const GroupIcon = group.icon
              return (
                <Tooltip key={group.label}>
                  <TooltipTrigger asChild>
                    <Link
                      href={group.children[0]?.href || '/'}
                      className={cn(
                        'flex items-center justify-center p-2.5 rounded-lg transition-all mt-1 relative',
                        isGroupActive(group)
                          ? 'text-white'
                          : 'text-sidebar-foreground hover:text-white hover:bg-sidebar-accent'
                      )}
                    >
                      <GroupIcon className="h-5 w-5" />
                      {groupHasBadge(group) && (
                        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right"><p>{group.label}</p></TooltipContent>
                </Tooltip>
              )
            })}
          </nav>

          {/* User — collapsed */}
          <div className="border-t border-sidebar-border p-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full h-10 text-sidebar-foreground hover:text-white hover:bg-sidebar-accent"
                    >
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[#1E3A54] text-[#C8DFF0]">
                        <User className="h-4 w-4" />
                      </div>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{propertyManager?.name || 'User'}</p>
                  </TooltipContent>
                </Tooltip>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{propertyManager?.name}</p>
                  <p className="text-xs text-muted-foreground">{propertyManager?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings"><Settings className="mr-2 h-4 w-4" />Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()} className="text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </TooltipProvider>
    )
  }

  // ─── Expanded sidebar ──────────────────────────────────

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200">
        {/* Logo + Collapse */}
        <div className="border-b border-sidebar-border flex items-center justify-between p-6">
          <Image
            src="/logo-white.png"
            alt="Yarro"
            width={100}
            height={30}
            className="opacity-90"
            priority
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground hover:text-white hover:bg-sidebar-accent"
            onClick={toggleCollapsed}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {/* Dashboard — top level, above all groups */}
          <Link
            href="/"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-all',
              isActive('/')
                ? 'text-white'
                : 'text-sidebar-foreground hover:text-white'
            )}
          >
            <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
            Dashboard
          </Link>

          {/* Collapsible groups */}
          {navGroups.map(group => {
            const open = groupOpen[group.label]
            const active = isGroupActive(group)
            const GroupIcon = group.icon

            return (
              <div key={group.label} className="mt-4">
                {/* Group parent — icon + label + chevron */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-base font-medium transition-all w-full text-left',
                    active
                      ? 'text-[#B8D4E8]'
                      : 'text-sidebar-foreground hover:text-[#B8D4E8]'
                  )}
                >
                  <span className="relative flex-shrink-0">
                    <GroupIcon className="h-5 w-5" />
                    {!open && groupHasBadge(group) && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </span>
                  <span className="flex-1">{group.label}</span>
                  <ChevronRight className={cn(
                    'h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200',
                    open && 'rotate-90'
                  )} />
                </button>

                {/* Children — per-child border-l for active line alignment */}
                {open && (
                  <div className="mt-0.5 space-y-0">
                    {group.children.map(child => {
                      const childActive = isActive(child.href)
                      const count = child.countKey ? counts[child.countKey] : null

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            'flex items-center gap-3 ml-[19px] pl-3 py-2 text-sm transition-all',
                            childActive
                              ? 'border-l-[3px] border-l-sidebar-primary bg-sidebar-accent text-white font-medium rounded-r-lg'
                              : 'border-l border-sidebar-border text-sidebar-foreground hover:text-white hover:bg-sidebar-accent rounded-r-lg'
                          )}
                        >
                          <span className="flex-1">{child.label}</span>
                          {count !== null && count > 0 && (
                            <span className={cn(
                              'text-xs font-medium tabular-nums mr-2',
                              childActive ? 'text-white/80' : 'text-sidebar-foreground/60'
                            )}>
                              {count}
                            </span>
                          )}
                          {child.badgeKey && badgeCounts[child.badgeKey] > 0 && (
                            <span className="text-[10px] font-bold bg-[rgba(220,38,38,0.22)] text-[#FCA5A5] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1 mr-2">
                              {badgeCounts[child.badgeKey]}
                            </span>
                          )}
                          {child.comingSoon && (
                            <span className="text-[9px] font-medium text-sidebar-foreground/40 uppercase tracking-wider mr-2">
                              Soon
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* User section — bottom */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-3 py-2.5 h-auto text-sidebar-foreground hover:text-white hover:bg-sidebar-accent"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[#1E3A54] text-[#C8DFF0] flex-shrink-0">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium text-[#C8DFF0] truncate max-w-[120px]">
                      {propertyManager?.name || 'User'}
                    </span>
                    <span className="text-xs text-[#4A7A9B] truncate max-w-[120px]">
                      {propertyManager?.business_name || ''}
                    </span>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{propertyManager?.name}</p>
                <p className="text-xs text-muted-foreground">{propertyManager?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings"><Settings className="mr-2 h-4 w-4" />Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-red-600 focus:text-red-600">
                <LogOut className="mr-2 h-4 w-4" />Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </TooltipProvider>
  )
}
