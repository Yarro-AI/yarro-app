'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  CircleHelp,
  Contact,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Ticket,
  Users,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePM } from '@/contexts/pm-context'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface SearchResult {
  id: string
  label: string
  subtitle?: string
  type: 'property' | 'tenant' | 'ticket' | 'contractor' | 'landlord' | 'compliance'
  href: string
}

const entityConfig = {
  property:   { icon: Building2,  heading: 'Properties' },
  tenant:     { icon: Users,      heading: 'Tenants' },
  ticket:     { icon: Ticket,     heading: 'Tickets' },
  contractor: { icon: Wrench,     heading: 'Contractors' },
  landlord:   { icon: Contact,    heading: 'Landlords' },
  compliance: { icon: ShieldCheck, heading: 'Compliance' },
} as const

const createOptions = [
  { label: 'New Ticket',     icon: Ticket,    href: '/tickets?create=true' },
  { label: 'New Property',   icon: Building2, href: '/properties?create=true' },
  { label: 'New Tenant',     icon: Users,     href: '/tenants?create=true' },
  { label: 'New Contractor', icon: Wrench,    href: '/contractors?create=true' },
  { label: 'New Landlord',   icon: Contact,   href: '/landlords?create=true' },
]

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

export function DashboardHeader() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const { propertyManager } = usePM()
  const router = useRouter()
  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Debounced search
  const search = useCallback(
    async (q: string) => {
      if (!propertyManager || q.length < 2) {
        setResults([])
        setLoading(false)
        return
      }

      setLoading(true)
      const pmId = propertyManager.id
      const pattern = `%${q}%`

      const [properties, tenants, tickets, contractors, landlords, compliance] =
        await Promise.all([
          supabase
            .from('c1_properties')
            .select('id, address')
            .eq('property_manager_id', pmId)
            .ilike('address', pattern)
            .limit(5),
          supabase
            .from('c1_tenants')
            .select('id, full_name, phone, email')
            .eq('property_manager_id', pmId)
            .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
            .limit(5),
          supabase
            .from('c1_tickets')
            .select('id, issue_description, address')
            .eq('property_manager_id', pmId)
            .ilike('issue_description', pattern)
            .limit(5),
          supabase
            .from('c1_contractors')
            .select('id, contractor_name, contractor_email')
            .eq('property_manager_id', pmId)
            .ilike('contractor_name', pattern)
            .limit(5),
          supabase
            .from('c1_landlords')
            .select('id, full_name, email')
            .eq('property_manager_id', pmId)
            .ilike('full_name', pattern)
            .limit(5),
          supabase
            .from('c1_compliance_certificates')
            .select('id, certificate_type, property_id')
            .eq('property_manager_id', pmId)
            .ilike('certificate_type', pattern)
            .limit(5),
        ])

      const items: SearchResult[] = [
        ...(properties.data || []).map((p) => ({
          id: p.id,
          label: p.address || 'Unknown',
          type: 'property' as const,
          href: `/properties/${p.id}`,
        })),
        ...(tenants.data || []).map((t) => ({
          id: t.id,
          label: t.full_name || 'Unknown',
          subtitle: t.phone || t.email || undefined,
          type: 'tenant' as const,
          href: `/tenants/${t.id}`,
        })),
        ...(tickets.data || []).map((t) => ({
          id: t.id,
          label: t.issue_description || 'Untitled',
          subtitle: t.address || undefined,
          type: 'ticket' as const,
          href: `/tickets?ticketId=${t.id}`,
        })),
        ...(contractors.data || []).map((c) => ({
          id: c.id,
          label: c.contractor_name || 'Unknown',
          subtitle: c.contractor_email || undefined,
          type: 'contractor' as const,
          href: `/contractors/${c.id}`,
        })),
        ...(landlords.data || []).map((l) => ({
          id: l.id,
          label: l.full_name || 'Unknown',
          subtitle: l.email || undefined,
          type: 'landlord' as const,
          href: `/landlords/${l.id}`,
        })),
        ...(compliance.data || []).map((c) => ({
          id: c.id,
          label: c.certificate_type || 'Unknown',
          type: 'compliance' as const,
          href: `/compliance/${c.id}`,
        })),
      ]

      setResults(items)
      setLoading(false)
    },
    [propertyManager, supabase],
  )

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  const handleSelect = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.type]) acc[r.type] = []
    acc[r.type].push(r)
    return acc
  }, {})

  return (
    <div className="flex-shrink-0 border-b border-border/60 bg-secondary">
      <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
        {/* Spacer pushes actions right */}
        <div className="flex-1" />

        {/* Right-aligned actions — labeled icons + create */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Search */}
          <button
            onClick={() => setOpen(true)}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Search className="h-4 w-4" />
            <span>Search</span>
          </button>
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
          {/* Help */}
          <Link
            href="/guide"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <CircleHelp className="h-4 w-4" />
            <span>Help</span>
          </Link>

          {/* Feedback */}
          <Link
            href="/feedback"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Feedback</span>
          </Link>

          {/* Create dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="icon" className="h-9 w-9 ml-2">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {createOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.href}
                  onClick={() => router.push(opt.href)}
                >
                  <opt.icon className="mr-2 h-4 w-4" />
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Command palette dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            <CommandInput
              placeholder="Search properties, tenants, tickets..."
              value={query}
              onValueChange={handleQueryChange}
            />
            <CommandList className="max-h-[400px]">
              {query.length < 2 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Type to search across all your data
                </div>
              ) : loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Searching...
                </div>
              ) : results.length === 0 ? (
                <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
              ) : (
                Object.entries(grouped).map(([type, items]) => {
                  const config = entityConfig[type as keyof typeof entityConfig]
                  const Icon = config.icon
                  return (
                    <CommandGroup key={type} heading={config.heading}>
                      {items.map((item) => (
                        <CommandItem
                          key={`${type}-${item.id}`}
                          value={`${type}-${item.id}`}
                          onSelect={() => handleSelect(item.href)}
                        >
                          <Icon className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{item.label}</span>
                            {item.subtitle && (
                              <span className="text-xs text-muted-foreground truncate">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )
                })
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}
