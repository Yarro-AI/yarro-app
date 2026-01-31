'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Upload, Users, Wrench, Building } from 'lucide-react'

const tabs = [
  { href: '/guide', label: 'Import Data', icon: Upload },
  { href: '/guide/tenant', label: 'For Tenants', icon: Users },
  { href: '/guide/contractor', label: 'For Contractors', icon: Wrench },
  { href: '/guide/landlord', label: 'For Landlords', icon: Building },
]

export function GuideTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border">
      <nav className="flex gap-1" aria-label="Guide sections">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || (tab.href === '/guide' && pathname === '/guide/import')
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
