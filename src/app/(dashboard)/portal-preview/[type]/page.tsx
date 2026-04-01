'use client'

import { useState } from 'react'
import { useParams, notFound } from 'next/navigation'
import { tenantPortalMocks, landlordPortalMocks, oohPortalMocks, contractorPortalMocks, contractorQuoteMocks } from '@/lib/portal-mock-data'
import { TenantPortalV2 } from '@/components/portal/tenant-portal-v2'
import { LandlordPortalV2 } from '@/components/portal/landlord-portal-v2'
import { OOHPortalV2 } from '@/components/portal/ooh-portal-v2'
import { ContractorPortalV2, ContractorQuoteV2 } from '@/components/portal/contractor-portal-v2'

const PORTAL_TYPES = ['tenant', 'landlord', 'ooh', 'contractor', 'contractor-quote'] as const
type PortalType = typeof PORTAL_TYPES[number]

const VARIANT_LABELS: Record<PortalType, Record<string, string>> = {
  tenant: {
    reported: 'Reported',
    contractorFound: 'Contractor Found',
    booked: 'Booked',
    completed: 'Completed',
  },
  landlord: {
    fresh: 'Fresh (no submissions)',
    inProgress: 'In Progress',
    resolved: 'Resolved',
  },
  ooh: {
    fresh: 'Fresh (no submissions)',
    inProgress: 'In Progress',
    resolved: 'Resolved',
  },
  contractor: {
    needsScheduling: 'Needs Scheduling',
    booked: 'Booked',
    completed: 'Completed',
  },
  'contractor-quote': {
    fresh: 'Fresh (no quote)',
    submitted: 'Quote Submitted',
  },
}

const noop = async () => { await new Promise(r => setTimeout(r, 800)) }

function TenantPreview({ variant }: { variant: string }) {
  const mock = tenantPortalMocks[variant as keyof typeof tenantPortalMocks]
  if (!mock) return null
  return <TenantPortalV2 data={{ ...mock }} onAvailabilityUpdate={noop} />
}

function LandlordPreview({ variant }: { variant: string }) {
  const mock = landlordPortalMocks[variant as keyof typeof landlordPortalMocks]
  if (!mock) return null
  return <LandlordPortalV2 data={{ ...mock }} onSubmit={noop} />
}

function OOHPreview({ variant }: { variant: string }) {
  const mock = oohPortalMocks[variant as keyof typeof oohPortalMocks]
  if (!mock) return null
  return <OOHPortalV2 data={{ ...mock }} onSubmit={noop} />
}

function ContractorPreview({ variant }: { variant: string }) {
  const mock = contractorPortalMocks[variant as keyof typeof contractorPortalMocks]
  if (!mock) return null
  return <ContractorPortalV2 data={{ ...mock }} onSchedule={noop} onCompletion={noop} />
}

function ContractorQuotePreview({ variant }: { variant: string }) {
  const mock = contractorQuoteMocks[variant as keyof typeof contractorQuoteMocks]
  if (!mock) return null
  return <ContractorQuoteV2 data={{ ...mock }} onQuoteSubmit={noop} />
}

export default function PortalPreviewPage() {
  const { type } = useParams<{ type: string }>()

  if (process.env.NODE_ENV === 'production') return notFound()
  if (!PORTAL_TYPES.includes(type as PortalType)) return notFound()

  const portalType = type as PortalType
  const variants = VARIANT_LABELS[portalType]
  const variantKeys = Object.keys(variants)
  const [selectedVariant, setSelectedVariant] = useState(variantKeys[0])

  return (
    <div className="min-h-screen bg-background">
      {/* Control bar */}
      <div className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-foreground">Portal Preview</h1>
              <div className="flex gap-1">
                {PORTAL_TYPES.map((pt) => (
                  <a
                    key={pt}
                    href={`/portal-preview/${pt}`}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      pt === portalType
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {{ tenant: 'Tenant', landlord: 'Landlord', ooh: 'OOH', contractor: 'Contractor', 'contractor-quote': 'Quote' }[pt]}
                  </a>
                ))}
              </div>
            </div>
            <select
              value={selectedVariant}
              onChange={(e) => setSelectedVariant(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {variantKeys.map((key) => (
                <option key={key} value={key}>{variants[key]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Portal render */}
      <div key={`${portalType}-${selectedVariant}`}>
        {portalType === 'tenant' && <TenantPreview variant={selectedVariant} />}
        {portalType === 'landlord' && <LandlordPreview variant={selectedVariant} />}
        {portalType === 'ooh' && <OOHPreview variant={selectedVariant} />}
        {portalType === 'contractor' && <ContractorPreview variant={selectedVariant} />}
        {portalType === 'contractor-quote' && <ContractorQuotePreview variant={selectedVariant} />}
      </div>
    </div>
  )
}
