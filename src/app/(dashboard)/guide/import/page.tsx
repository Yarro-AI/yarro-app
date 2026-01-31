'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { OnboardingWizard } from '@/components/onboarding-wizard'

export default function ImportPage() {
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
        <div className="max-w-4xl">
          <OnboardingWizard />
        </div>
      </div>
    </div>
  )
}
