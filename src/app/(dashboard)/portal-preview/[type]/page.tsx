'use client'

import { useState } from 'react'
import { useParams, notFound } from 'next/navigation'
import { tenantMocks, tenantPortalMocks, landlordMocks, oohMocks, contractorMocks } from '@/lib/portal-mock-data'
import { TenantPortalV2 } from '@/components/portal/tenant-portal-v2'
import { LandlordPortalView } from '@/components/portal/landlord-portal'
import { OOHPortalView } from '@/components/portal/ooh-portal'
import { ContractorQuoteView, ContractorTicketView } from '@/components/portal/contractor-portal'

// Dev-only guard — returns 404 in production
if (process.env.NODE_ENV === 'production') {
  // This page should never render in production
}

const PORTAL_TYPES = ['tenant', 'landlord', 'ooh', 'contractor'] as const
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
    withSubmissions: 'In Progress',
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
}

// No-op handlers for preview mode
const noop = async () => { await new Promise(r => setTimeout(r, 800)) }

function TenantPreview({ variant }: { variant: string }) {
  const mock = tenantPortalMocks[variant as keyof typeof tenantPortalMocks]
  if (!mock) return null

  return (
    <TenantPortalV2
      data={{ ...mock }}
      onAvailabilityUpdate={noop}
    />
  )
}

function LandlordPreview({ variant }: { variant: string }) {
  const [justSubmitted, setJustSubmitted] = useState(false)
  const mock = landlordMocks[variant as keyof typeof landlordMocks]
  if (!mock) return null

  async function handleSubmit() {
    await noop()
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 3000)
  }

  return (
    <LandlordPortalView
      ticket={{ ...mock }}
      onSubmit={handleSubmit}
      justSubmitted={justSubmitted}
    />
  )
}

function OOHPreview({ variant }: { variant: string }) {
  const [justSubmitted, setJustSubmitted] = useState(false)
  const mock = oohMocks[variant as keyof typeof oohMocks]
  if (!mock) return null

  async function handleSubmit() {
    await noop()
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 3000)
  }

  return (
    <OOHPortalView
      ticket={{ ...mock }}
      onSubmit={handleSubmit}
      justSubmitted={justSubmitted}
    />
  )
}

function ContractorPreview({ variant }: { variant: string }) {
  const [justSubmitted, setJustSubmitted] = useState(false)
  const mock = contractorMocks[variant as keyof typeof contractorMocks]
  if (!mock) return null

  async function handleAction() {
    await noop()
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 3000)
  }

  return (
    <ContractorTicketView
      ticket={{ ...mock }}
      onSchedule={handleAction}
      onCompletion={handleAction}
      onRescheduleDecision={handleAction}
      justSubmitted={justSubmitted}
      submitMessage="Preview — no data was sent."
    />
  )
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
    <div className="min-h-screen bg-gray-100">
      {/* Control bar — sits above the portal preview */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-gray-900">Portal Preview</h1>
              <div className="flex gap-1">
                {PORTAL_TYPES.map((pt) => (
                  <a
                    key={pt}
                    href={`/portal-preview/${pt}`}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      pt === portalType
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </a>
                ))}
              </div>
            </div>
            <select
              value={selectedVariant}
              onChange={(e) => setSelectedVariant(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {variantKeys.map((key) => (
                <option key={key} value={key}>{variants[key]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Portal render — key forces remount on variant change */}
      <div key={`${portalType}-${selectedVariant}`}>
        {portalType === 'tenant' && <TenantPreview variant={selectedVariant} />}
        {portalType === 'landlord' && <LandlordPreview variant={selectedVariant} />}
        {portalType === 'ooh' && <OOHPreview variant={selectedVariant} />}
        {portalType === 'contractor' && <ContractorPreview variant={selectedVariant} />}
      </div>
    </div>
  )
}
