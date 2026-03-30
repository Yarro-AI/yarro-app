'use client'

import { OnboardingWizard } from '@/components/onboarding-wizard'
import { PageShell } from '@/components/page-shell'

export default function ImportPage() {
  return (
    <PageShell title="Import Data" subtitle="Onboard your properties, tenants, and contractors step by step" scrollable>
      <OnboardingWizard />
    </PageShell>
  )
}
