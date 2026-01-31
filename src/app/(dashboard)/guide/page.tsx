'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { GuideTabs } from '@/components/guide-tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Check, Circle, ArrowRight, Upload } from 'lucide-react'
import Link from 'next/link'

interface SetupStatus {
  hasDetails: boolean
  propertiesCount: number
  tenantsCount: number
  contractorsCount: number
  landlordsCount: number
}

export default function GuidePage() {
  const { propertyManager } = usePM()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    fetchStatus()
  }, [propertyManager])

  const fetchStatus = async () => {
    const [properties, tenants, contractors, landlords] = await Promise.all([
      supabase.from('c1_properties').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager!.id),
      supabase.from('c1_tenants').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager!.id),
      supabase.from('c1_contractors').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager!.id),
      supabase.from('c1_landlords').select('id', { count: 'exact', head: true }).eq('property_manager_id', propertyManager!.id),
    ])

    setStatus({
      hasDetails: !!(propertyManager?.business_name && propertyManager?.phone),
      propertiesCount: properties.count || 0,
      tenantsCount: tenants.count || 0,
      contractorsCount: contractors.count || 0,
      landlordsCount: landlords.count || 0,
    })
    setLoading(false)
  }

  const steps = status ? [
    {
      number: 1,
      title: 'Your Details',
      description: 'Business name, phone, emergency contact',
      complete: status.hasDetails,
      count: null,
      href: '/settings',
      action: 'Edit',
    },
    {
      number: 2,
      title: 'Properties',
      description: 'Add the properties you manage',
      complete: status.propertiesCount > 0,
      count: status.propertiesCount,
      href: '/properties',
      action: 'Manage',
    },
    {
      number: 3,
      title: 'Tenants',
      description: 'Add tenants for each property',
      complete: status.tenantsCount > 0,
      count: status.tenantsCount,
      href: '/tenants',
      action: 'Manage',
    },
    {
      number: 4,
      title: 'Contractors',
      description: 'Add contractors by category',
      complete: status.contractorsCount > 0,
      count: status.contractorsCount,
      href: '/contractors',
      action: 'Manage',
    },
    {
      number: 5,
      title: 'Landlords',
      description: 'Add landlords and set approval limits',
      complete: status.landlordsCount > 0,
      count: status.landlordsCount,
      href: '/properties',
      action: 'Manage',
    },
  ] : []

  const completedSteps = steps.filter(s => s.complete).length
  const totalSteps = steps.length

  return (
    <div className="h-full bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Product Guide</h1>
          <p className="text-muted-foreground mt-1">
            Your complete guide to Yarro property management
          </p>
        </div>

        {/* Tabs */}
        <GuideTabs />

        {/* Content */}
        <div className="max-w-3xl space-y-6">
          {/* Progress */}
          {!loading && status && (
            <div className="flex items-center gap-4 p-4 bg-white rounded-xl border-2 border-blue-500/20">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Setup Progress</span>
                  <span className="text-sm text-gray-500">{completedSteps} of {totalSteps} complete</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-3">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
              ))
            ) : (
              steps.map((step) => (
                <Card
                  key={step.number}
                  className={`border-2 transition-all ${step.complete ? 'border-emerald-500/30 bg-emerald-50/30' : 'border-gray-200'}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Status icon */}
                      <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                        step.complete ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {step.complete ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <span className="font-semibold">{step.number}</span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{step.title}</h3>
                          {step.count !== null && step.count > 0 && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              {step.count} added
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{step.description}</p>
                      </div>

                      {/* Action */}
                      <Link
                        href={step.href}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        {step.action}
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Import CTA */}
          <Link
            href="/guide/import"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-500/50 hover:bg-blue-50/30 transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Upload className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">Need to import data from a spreadsheet?</p>
              <p className="text-sm text-gray-500">Use our import wizard to bulk upload properties, tenants, and contractors</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
          </Link>
        </div>
      </div>
    </div>
  )
}
