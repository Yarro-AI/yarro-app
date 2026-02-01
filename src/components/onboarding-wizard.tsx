'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { Button } from '@/components/ui/button'
import { ProgressBar } from './onboarding/progress-bar'
import { StepPMDetails, PMDetailsEntry } from './onboarding/step-pm-details'
import { StepLandlords, LandlordPersona } from './onboarding/step-landlords'
import { StepProperties, PropertyEntry } from './onboarding/step-properties'
import { StepTenants, TenantEntry } from './onboarding/step-tenants'
import { StepContractors, ContractorEntry } from './onboarding/step-contractors'
import { normalizeRecord, normalizePhone, isValidUKPhone, hasValidUKPostcode } from '@/lib/normalize'
import { validatePhone, validateEmail } from '@/lib/validate'
import { ArrowLeft, ArrowRight, CheckCircle, Loader2, SkipForward } from 'lucide-react'

type OnboardingStep = 'pm_details' | 'landlords' | 'properties' | 'tenants' | 'contractors' | 'complete'

interface OnboardingState {
  step: OnboardingStep
  pmDetails: PMDetailsEntry
  landlords: LandlordPersona[]
  properties: PropertyEntry[]
  tenants: TenantEntry[]
  contractors: ContractorEntry[]
  batchId: string
  insertedCounts: { properties: number; tenants: number; contractors: number }
  existingProperties: { id: string; address: string }[]
}

const STEP_ORDER: OnboardingStep[] = ['pm_details', 'landlords', 'properties', 'tenants', 'contractors', 'complete']

export function OnboardingWizard() {
  const { propertyManager, authUser, refreshPM } = usePM()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if PM details are already configured (name and phone exist)
  const pmDetailsConfigured = !!(propertyManager?.name && propertyManager?.phone)

  const [state, setState] = useState<OnboardingState>({
    // Start at landlords if PM details already configured, otherwise start at pm_details
    step: pmDetailsConfigured ? 'landlords' : 'pm_details',
    pmDetails: {
      name: propertyManager?.name || '',
      business_name: propertyManager?.business_name || '',
      phone: propertyManager?.phone || '',
      emergency_contact: propertyManager?.emergency_contact || ''
    },
    landlords: [{ tempId: crypto.randomUUID(), name: '', email: '', phone: '' }],
    properties: [{ tempId: crypto.randomUUID(), address: '', landlordTempId: '', access_instructions: '', emergency_access_contact: '', auto_approve_limit: '' }],
    tenants: [{ full_name: '', phone: '', email: '', role_tag: 'tenant', propertyId: '' }],
    contractors: [{ contractor_name: '', category: '', contractor_phone: '', contractor_email: '', property_ids: null }],
    batchId: crypto.randomUUID(),
    insertedCounts: { properties: 0, tenants: 0, contractors: 0 },
    existingProperties: [],
  })

  // Update pmDetails and step when propertyManager loads
  useEffect(() => {
    if (!propertyManager) return
    const hasDetails = !!(propertyManager.name && propertyManager.phone)
    setState((prev) => ({
      ...prev,
      // Only update step if still at pm_details and details already configured
      step: prev.step === 'pm_details' && hasDetails ? 'landlords' : prev.step,
      pmDetails: {
        name: propertyManager.name || prev.pmDetails.name,
        business_name: propertyManager.business_name || prev.pmDetails.business_name,
        phone: propertyManager.phone || prev.pmDetails.phone,
        emergency_contact: propertyManager.emergency_contact || prev.pmDetails.emergency_contact,
      },
    }))
  }, [propertyManager])

  // Fetch existing properties on mount (for tenant/contractor dropdowns)
  useEffect(() => {
    if (!propertyManager) return
    const fetchExisting = async () => {
      const { data } = await supabase
        .from('c1_properties')
        .select('id, address')
        .eq('property_manager_id', propertyManager.id)
        .order('address')

      if (data) {
        setState((prev) => ({ ...prev, existingProperties: data }))
      }
    }
    fetchExisting()
  }, [propertyManager, supabase])

  const currentStepIndex = STEP_ORDER.indexOf(state.step)

  const goBack = () => {
    if (currentStepIndex > 0) {
      setState((prev) => ({ ...prev, step: STEP_ORDER[currentStepIndex - 1] }))
    }
  }

  const skip = () => {
    if (currentStepIndex < STEP_ORDER.length - 1) {
      setState((prev) => ({ ...prev, step: STEP_ORDER[currentStepIndex + 1] }))
    }
  }

  const canGoBack = () => {
    if (state.step === 'pm_details') return false // Can't go back from first step
    // Allow going back to PM details from landlords (for editing)
    if (state.step === 'tenants' && state.insertedCounts.properties > 0) return false
    if (state.step === 'contractors' && state.insertedCounts.tenants > 0) return false
    return currentStepIndex > 0
  }

  const handleNext = async () => {
    // For pm_details step, we need authUser (for new users) or propertyManager (for existing)
    // For all other steps, we need propertyManager
    if (state.step !== 'pm_details' && !propertyManager) return
    if (state.step === 'pm_details' && !authUser) return

    setError(null)
    setSaving(true)

    try {
      if (state.step === 'pm_details') {
        // Validate PM details
        if (!state.pmDetails.name.trim()) {
          setError('Your name is required')
          setSaving(false)
          return
        }
        if (!state.pmDetails.phone.trim()) {
          setError('Your phone number is required')
          setSaving(false)
          return
        }
        if (!isValidUKPhone(state.pmDetails.phone)) {
          setError('Enter a valid UK phone number')
          setSaving(false)
          return
        }

        if (propertyManager) {
          // Existing PM → UPDATE
          const { error: updateError } = await supabase
            .from('c1_property_managers')
            .update({
              name: state.pmDetails.name.trim(),
              business_name: state.pmDetails.business_name.trim() || null,
              phone: normalizePhone(state.pmDetails.phone),
              emergency_contact: state.pmDetails.emergency_contact.trim() || null,
            })
            .eq('id', propertyManager.id)

          if (updateError) {
            setError(`Failed to update your details: ${updateError.message}`)
            setSaving(false)
            return
          }

          toast.success('Your details saved')
        } else if (authUser) {
          // New user, no PM yet → INSERT
          const { error: insertError } = await supabase
            .from('c1_property_managers')
            .insert({
              user_id: authUser.id,
              email: authUser.email,
              name: state.pmDetails.name.trim(),
              business_name: state.pmDetails.business_name.trim() || null,
              phone: normalizePhone(state.pmDetails.phone),
              emergency_contact: state.pmDetails.emergency_contact.trim() || null,
            })

          if (insertError) {
            setError(`Failed to create your profile: ${insertError.message}`)
            setSaving(false)
            return
          }

          // Refresh context so propertyManager is available for remaining steps
          await refreshPM()
          toast.success('Profile created')
        }

        setState((prev) => ({ ...prev, step: 'landlords' }))
      } else if (state.step === 'landlords') {
        // Validate landlords - if they have a name, they must have a phone
        const landlordsWithData = state.landlords.filter((l) => l.name.trim())
        const landlordsWithoutPhone = landlordsWithData.filter((l) => !l.phone.trim())
        if (landlordsWithoutPhone.length > 0) {
          setError(`${landlordsWithoutPhone.length} ${landlordsWithoutPhone.length === 1 ? 'landlord needs' : 'landlords need'} a phone number`)
          setSaving(false)
          return
        }
        // Validate phone format for landlords
        for (const landlord of landlordsWithData) {
          if (!isValidUKPhone(landlord.phone)) {
            setError(`Landlord "${landlord.name}": Enter a valid UK phone number`)
            setSaving(false)
            return
          }
        }
        setState((prev) => ({ ...prev, step: 'properties' }))
      } else if (state.step === 'properties') {
        if (!propertyManager) return
        // Insert properties
        const validProps = state.properties.filter((p) => p.address.trim())

        // Validate all properties have landlords selected (if landlords exist)
        if (state.landlords.some((l) => l.name.trim())) {
          const propsWithoutLandlord = validProps.filter((p) => !p.landlordTempId)
          if (propsWithoutLandlord.length > 0) {
            setError(`${propsWithoutLandlord.length} ${propsWithoutLandlord.length === 1 ? 'property needs' : 'properties need'} a landlord selected (highlighted in amber)`)
            setSaving(false)
            return
          }
        }

        // Validate all properties have valid UK postcodes before inserting
        for (const prop of validProps) {
          if (!hasValidUKPostcode(prop.address)) {
            setError(`Property "${prop.address}": Address must end with a valid UK postcode (e.g., SW1A 1AA, M1 1AE)`)
            setSaving(false)
            return
          }
        }

        // Check for existing properties to avoid duplicates
        const { data: existingProps } = await supabase
          .from('c1_properties')
          .select('id, address')
          .eq('property_manager_id', propertyManager.id)

        const existingAddresses = new Set(
          (existingProps || []).map((p) => p.address.toLowerCase().trim())
        )

        let insertedCount = 0
        let skippedCount = 0

        const updatedProperties = [...state.properties]

        for (let i = 0; i < updatedProperties.length; i++) {
          const prop = updatedProperties[i]
          if (!prop.address.trim() || prop.insertedId) continue

          // Skip if already exists
          if (existingAddresses.has(prop.address.toLowerCase().trim())) {
            const existing = existingProps?.find(
              (p) => p.address.toLowerCase().trim() === prop.address.toLowerCase().trim()
            )
            if (existing) {
              updatedProperties[i] = { ...prop, insertedId: existing.id }
              skippedCount++
              continue
            }
          }

          // Find landlord info
          const landlord = state.landlords.find((l) => l.tempId === prop.landlordTempId)

          const record: Record<string, unknown> = {
            address: prop.address,
            property_manager_id: propertyManager.id,
            auto_approve_limit: prop.auto_approve_limit ? parseFloat(prop.auto_approve_limit) : null,
            access_instructions: prop.access_instructions || null,
            emergency_access_contact: prop.emergency_access_contact || null,
            _import_batch_id: state.batchId,
            _imported_at: new Date().toISOString(),
          }

          if (landlord) {
            record.landlord_name = landlord.name || null
            record.landlord_email = landlord.email || null
            record.landlord_phone = landlord.phone || null
          }

          const normalized = normalizeRecord('properties', record)

          const { data, error: insertError } = await supabase
            .from('c1_properties')
            .insert(normalized)
            .select('id')
            .single()

          if (insertError) {
            setError(`Failed to insert property "${prop.address}": ${insertError.message}`)
            setSaving(false)
            return
          }

          updatedProperties[i] = { ...prop, insertedId: data.id }
          insertedCount++
        }

        if (insertedCount > 0 || skippedCount > 0) {
          const parts = []
          if (insertedCount > 0) parts.push(`${insertedCount} added`)
          if (skippedCount > 0) parts.push(`${skippedCount} already existed`)
          toast.success(`Properties: ${parts.join(', ')}`)
        }

        setState((prev) => ({
          ...prev,
          properties: updatedProperties,
          step: 'tenants',
          insertedCounts: { ...prev.insertedCounts, properties: insertedCount },
          existingProperties: [
            ...prev.existingProperties,
            ...updatedProperties
              .filter((p) => p.insertedId)
              .map((p) => ({ id: p.insertedId!, address: p.address })),
          ],
        }))
      } else if (state.step === 'tenants') {
        if (!propertyManager) return
        // Insert tenants - require name, phone, AND property
        const validTenants = state.tenants.filter((t) => t.full_name.trim() && t.phone.trim() && t.propertyId)

        // Check for tenants with name/phone but missing property
        const tenantsWithoutProperty = state.tenants.filter(
          (t) => t.full_name.trim() && t.phone.trim() && !t.propertyId
        )
        if (tenantsWithoutProperty.length > 0) {
          setError(`${tenantsWithoutProperty.length} ${tenantsWithoutProperty.length === 1 ? 'tenant needs' : 'tenants need'} a property selected (highlighted in amber)`)
          setSaving(false)
          return
        }

        // Validate before inserting
        for (const tenant of validTenants) {
          const phoneResult = validatePhone(tenant.phone)
          if (!phoneResult.valid) {
            setError(`Tenant "${tenant.full_name}": ${phoneResult.error}`)
            setSaving(false)
            return
          }
          if (tenant.email) {
            const emailResult = validateEmail(tenant.email)
            if (!emailResult.valid) {
              setError(`Tenant "${tenant.full_name}": ${emailResult.error}`)
              setSaving(false)
              return
            }
          }
        }

        // Fetch fresh property IDs to verify they exist (handles stale state)
        const { data: freshProps } = await supabase
          .from('c1_properties')
          .select('id')
          .eq('property_manager_id', propertyManager.id)
        const validPropertyIds = new Set((freshProps || []).map((p) => p.id))

        // Verify all property IDs exist
        for (const tenant of validTenants) {
          if (!validPropertyIds.has(tenant.propertyId)) {
            setError(`Property selection is stale. Please refresh the page and re-select properties.`)
            setSaving(false)
            return
          }
        }

        // Check for existing tenants to avoid duplicates (by phone + property)
        const { data: existingTenants } = await supabase
          .from('c1_tenants')
          .select('phone, property_id')
          .eq('property_manager_id', propertyManager.id)
        const existingKeys = new Set(
          (existingTenants || []).map((t) => `${normalizePhone(t.phone)}|${t.property_id}`)
        )

        let insertedCount = 0
        let skippedCount = 0

        for (const tenant of validTenants) {
          const tenantKey = `${normalizePhone(tenant.phone)}|${tenant.propertyId}`
          if (existingKeys.has(tenantKey)) {
            skippedCount++
            continue
          }

          const record: Record<string, unknown> = {
            full_name: tenant.full_name,
            phone: tenant.phone,
            email: tenant.email || null,
            role_tag: tenant.role_tag || 'tenant',
            property_id: tenant.propertyId || null,
            property_manager_id: propertyManager.id,
            _import_batch_id: state.batchId,
            _imported_at: new Date().toISOString(),
          }

          const normalized = normalizeRecord('tenants', record)

          const { error: insertError } = await supabase
            .from('c1_tenants')
            .insert(normalized)

          if (insertError) {
            setError(`Failed to insert tenant "${tenant.full_name}": ${insertError.message}`)
            setSaving(false)
            return
          }
          insertedCount++
          existingKeys.add(tenantKey) // Prevent duplicates within same batch
        }

        if (insertedCount > 0 || skippedCount > 0) {
          const parts = []
          if (insertedCount > 0) parts.push(`${insertedCount} added`)
          if (skippedCount > 0) parts.push(`${skippedCount} already existed`)
          toast.success(`Tenants: ${parts.join(', ')}`)
        }

        setState((prev) => ({
          ...prev,
          step: 'contractors',
          insertedCounts: { ...prev.insertedCounts, tenants: insertedCount },
        }))
      } else if (state.step === 'contractors') {
        if (!propertyManager) return

        // Check for contractors with name but missing category
        const contractorsWithoutCategory = state.contractors.filter(
          (c) => c.contractor_name.trim() && !c.category
        )
        if (contractorsWithoutCategory.length > 0) {
          setError(`${contractorsWithoutCategory.length} ${contractorsWithoutCategory.length === 1 ? 'contractor needs' : 'contractors need'} a category selected (highlighted in amber)`)
          setSaving(false)
          return
        }

        // Check for contractors with name but missing phone
        const contractorsWithoutPhone = state.contractors.filter(
          (c) => c.contractor_name.trim() && !c.contractor_phone.trim()
        )
        if (contractorsWithoutPhone.length > 0) {
          setError(`${contractorsWithoutPhone.length} ${contractorsWithoutPhone.length === 1 ? 'contractor needs' : 'contractors need'} a phone number`)
          setSaving(false)
          return
        }

        // Insert contractors
        const validContractors = state.contractors.filter(
          (c) => c.contractor_name.trim() && c.category && c.contractor_phone.trim()
        )

        // Validate before inserting
        for (const contractor of validContractors) {
          const phoneResult = validatePhone(contractor.contractor_phone)
          if (!phoneResult.valid) {
            setError(`Contractor "${contractor.contractor_name}": ${phoneResult.error}`)
            setSaving(false)
            return
          }
          if (contractor.contractor_email) {
            const emailResult = validateEmail(contractor.contractor_email)
            if (!emailResult.valid) {
              setError(`Contractor "${contractor.contractor_name}": ${emailResult.error}`)
              setSaving(false)
              return
            }
          }
        }

        // Check for existing contractors to avoid duplicates (by phone)
        const { data: existingContractors } = await supabase
          .from('c1_contractors')
          .select('contractor_phone')
          .eq('property_manager_id', propertyManager.id)
        const existingPhones = new Set(
          (existingContractors || []).map((c) => normalizePhone(c.contractor_phone))
        )

        let insertedCount = 0
        let skippedCount = 0

        for (const contractor of validContractors) {
          const normalizedPhone = normalizePhone(contractor.contractor_phone)
          if (existingPhones.has(normalizedPhone)) {
            skippedCount++
            continue
          }

          const record: Record<string, unknown> = {
            contractor_name: contractor.contractor_name,
            category: contractor.category,
            contractor_phone: contractor.contractor_phone,
            contractor_email: contractor.contractor_email || null,
            property_ids: contractor.property_ids && contractor.property_ids.length > 0 ? contractor.property_ids : null,
            active: true,
            property_manager_id: propertyManager.id,
            _import_batch_id: state.batchId,
            _imported_at: new Date().toISOString(),
          }

          const normalized = normalizeRecord('contractors', record)

          const { error: insertError } = await supabase
            .from('c1_contractors')
            .insert(normalized)

          if (insertError) {
            setError(`Failed to insert contractor "${contractor.contractor_name}": ${insertError.message}`)
            setSaving(false)
            return
          }
          insertedCount++
          existingPhones.add(normalizedPhone) // Prevent duplicates within same batch
        }

        if (insertedCount > 0 || skippedCount > 0) {
          const parts = []
          if (insertedCount > 0) parts.push(`${insertedCount} added`)
          if (skippedCount > 0) parts.push(`${skippedCount} already existed`)
          toast.success(`Contractors: ${parts.join(', ')}`)
        }
        toast.success('Onboarding complete!')

        setState((prev) => ({
          ...prev,
          step: 'complete',
          insertedCounts: { ...prev.insertedCounts, contractors: insertedCount },
        }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const resetWizard = () => {
    setState({
      step: 'landlords', // Skip PM details on reset - already done
      pmDetails: state.pmDetails, // Keep PM details
      landlords: [{ tempId: crypto.randomUUID(), name: '', email: '', phone: '' }],
      properties: [{ tempId: crypto.randomUUID(), address: '', landlordTempId: '', access_instructions: '', emergency_access_contact: '', auto_approve_limit: '' }],
      tenants: [{ full_name: '', phone: '', email: '', role_tag: 'tenant', propertyId: '' }],
      contractors: [{ contractor_name: '', category: '', contractor_phone: '', contractor_email: '', property_ids: null }],
      batchId: crypto.randomUUID(),
      insertedCounts: { properties: 0, tenants: 0, contractors: 0 },
      existingProperties: state.existingProperties,
    })
  }

  // Get all property options for tenant/contractor steps
  const allPropertyOptions = state.existingProperties

  return (
    <div className="space-y-6">
      <ProgressBar currentStep={state.step} />

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Step Content */}
      <div className="bg-card rounded-xl border p-6">
        {state.step === 'pm_details' && (
          <StepPMDetails
            details={state.pmDetails}
            email={propertyManager?.email || authUser?.email || ''}
            onChange={(pmDetails) => setState((prev) => ({ ...prev, pmDetails }))}
          />
        )}

        {state.step === 'landlords' && (
          <StepLandlords
            landlords={state.landlords}
            onChange={(landlords) => setState((prev) => ({ ...prev, landlords }))}
          />
        )}

        {state.step === 'properties' && (
          <StepProperties
            properties={state.properties}
            landlords={state.landlords}
            onChange={(properties) => setState((prev) => ({ ...prev, properties }))}
          />
        )}

        {state.step === 'tenants' && (
          <StepTenants
            tenants={state.tenants}
            properties={allPropertyOptions}
            onChange={(tenants) => setState((prev) => ({ ...prev, tenants }))}
          />
        )}

        {state.step === 'contractors' && (
          <StepContractors
            contractors={state.contractors}
            onChange={(contractors) => setState((prev) => ({ ...prev, contractors }))}
          />
        )}

        {state.step === 'complete' && (
          <div className="text-center space-y-4 py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-medium text-card-foreground">Onboarding Complete</h2>
            <div className="flex justify-center gap-6">
              {state.insertedCounts.properties > 0 && (
                <div>
                  <p className="text-2xl font-bold text-primary">{state.insertedCounts.properties}</p>
                  <p className="text-sm text-muted-foreground">Properties</p>
                </div>
              )}
              {state.insertedCounts.tenants > 0 && (
                <div>
                  <p className="text-2xl font-bold text-primary">{state.insertedCounts.tenants}</p>
                  <p className="text-sm text-muted-foreground">Tenants</p>
                </div>
              )}
              {state.insertedCounts.contractors > 0 && (
                <div>
                  <p className="text-2xl font-bold text-primary">{state.insertedCounts.contractors}</p>
                  <p className="text-sm text-muted-foreground">Contractors</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Batch ID: {state.batchId}</p>
            <div className="flex justify-center gap-3 pt-4">
              <Button variant="outline" onClick={resetWizard}>Import More</Button>
              <Button onClick={() => window.location.href = '/'}>Go to Dashboard</Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {state.step !== 'complete' && (
        <div className="flex items-center justify-between">
          <div>
            {canGoBack() && (
              <Button variant="outline" onClick={goBack} disabled={saving}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(state.step !== 'pm_details' || pmDetailsConfigured) && (
              <Button variant="ghost" onClick={skip} disabled={saving}>
                <SkipForward className="h-4 w-4 mr-1" />
                Skip
              </Button>
            )}
            <Button onClick={handleNext} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : state.step === 'contractors' ? (
                <>
                  Complete
                  <CheckCircle className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
