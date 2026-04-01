'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WelcomeStep } from './welcome-step'
import { SelectTypesStep } from './select-types-step'
import { CertStep } from './cert-step'
import { CompleteStep } from './complete-step'
import { CERTIFICATE_TYPES, type CertificateType } from '@/lib/constants'
import { toast } from 'sonner'

interface ComplianceRow {
  cert_id: string | null
  property_id: string
  property_address: string
  certificate_type: CertificateType
  display_status: string
}

interface SetupWizardProps {
  certificates: ComplianceRow[]
  pmId: string
  onComplete: () => void
}

interface WizardStep {
  propertyId: string
  propertyAddress: string
  certType: CertificateType
}

type Phase = 'welcome' | 'select-types' | 'steps' | 'complete'

export function ComplianceSetupWizard({ certificates, pmId, onComplete }: SetupWizardProps) {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>('welcome')
  const [currentStep, setCurrentStep] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [customSteps, setCustomSteps] = useState<WizardStep[] | null>(null)

  // Build flat list of steps from compliance data (used when no custom selections)
  const defaultSteps = useMemo<WizardStep[]>(() => {
    const seen = new Map<string, { address: string; certs: CertificateType[] }>()
    for (const cert of certificates) {
      if (!seen.has(cert.property_id)) {
        seen.set(cert.property_id, { address: cert.property_address, certs: [] })
      }
      seen.get(cert.property_id)!.certs.push(cert.certificate_type)
    }
    const result: WizardStep[] = []
    for (const [propertyId, { address, certs }] of seen) {
      for (const ct of certs) {
        result.push({ propertyId, propertyAddress: address, certType: ct })
      }
    }
    return result
  }, [certificates])

  const steps = customSteps || defaultSteps

  // Property info for welcome step
  const propertyInfo = useMemo(() => {
    const map = new Map<string, { address: string; type: string; count: number }>()
    for (const cert of certificates) {
      if (!map.has(cert.property_id)) {
        map.set(cert.property_id, { address: cert.property_address, type: 'hmo', count: 0 })
      }
      map.get(cert.property_id)!.count++
    }
    return Array.from(map.values()).map((p) => ({
      address: p.address,
      property_type: p.count > 5 ? 'hmo' : 'single_let',
      certCount: p.count,
    }))
  }, [certificates])

  // Property requirements for select-types step
  const propertyRequirements = useMemo(() => {
    const map = new Map<string, { address: string; certs: CertificateType[] }>()
    for (const cert of certificates) {
      if (!map.has(cert.property_id)) {
        map.set(cert.property_id, { address: cert.property_address, certs: [] })
      }
      map.get(cert.property_id)!.certs.push(cert.certificate_type)
    }
    return Array.from(map.entries()).map(([id, { address, certs }]) => ({
      id,
      address,
      currentRequirements: certs,
    }))
  }, [certificates])

  const handleSelectTypesContinue = async (selections: Map<string, CertificateType[]>) => {
    // Save requirement changes via RPC for each property
    for (const [propertyId, selectedTypes] of selections) {
      const requirements = CERTIFICATE_TYPES.map(ct => ({
        certificate_type: ct,
        is_required: selectedTypes.includes(ct),
      }))

      const { error } = await supabase.rpc('compliance_upsert_requirements', {
        p_property_id: propertyId,
        p_pm_id: pmId,
        p_requirements: requirements,
      })

      if (error) {
        toast.error(`Failed to save requirements: ${error.message}`)
        return
      }
    }

    // Build new steps from selections
    const newSteps: WizardStep[] = []
    for (const prop of propertyRequirements) {
      const selectedTypes = selections.get(prop.id) || []
      for (const ct of selectedTypes) {
        newSteps.push({ propertyId: prop.id, propertyAddress: prop.address, certType: ct })
      }
    }

    setCustomSteps(newSteps)
    setCurrentStep(0)
    setPhase('steps')
  }

  if (phase === 'welcome') {
    return (
      <WelcomeStep
        properties={propertyInfo}
        onStart={() => setPhase('select-types')}
      />
    )
  }

  if (phase === 'select-types') {
    return (
      <SelectTypesStep
        properties={propertyRequirements}
        onContinue={handleSelectTypesContinue}
        onBack={() => setPhase('welcome')}
      />
    )
  }

  if (phase === 'complete') {
    return (
      <CompleteStep
        savedCount={savedCount}
        skippedCount={skippedCount}
        onFinish={onComplete}
      />
    )
  }

  const step = steps[currentStep]
  if (!step) {
    setPhase('complete')
    return null
  }

  const advance = () => {
    if (currentStep >= steps.length - 1) {
      setPhase('complete')
    } else {
      setCurrentStep((prev) => prev + 1)
    }
  }

  return (
    <CertStep
      key={`${step.propertyId}-${step.certType}`}
      propertyAddress={step.propertyAddress}
      propertyId={step.propertyId}
      pmId={pmId}
      certType={step.certType}
      stepNumber={currentStep + 1}
      totalSteps={steps.length}
      onNext={() => {
        setSavedCount((prev) => prev + 1)
        advance()
      }}
      onSkip={() => {
        setSkippedCount((prev) => prev + 1)
        advance()
      }}
      onBack={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
      isFirst={currentStep === 0}
      onSaveAndReturn={onComplete}
    />
  )
}
