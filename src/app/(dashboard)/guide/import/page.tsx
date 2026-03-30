'use client'

import { OnboardingWizard } from '@/components/onboarding-wizard'
import { PageShell } from '@/components/page-shell'

export default function ImportPage() {
  return (
    <PageShell title="Import Data" subtitle="Import properties, landlords, tenants, and contractors from spreadsheets" scrollable>
      <OnboardingWizard />
    </PageShell>
  )
}
