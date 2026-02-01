'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Combobox } from '@/components/ui/combobox'
import { CONTRACTOR_CATEGORIES, TICKET_PRIORITIES } from '@/lib/constants'
import { normalizeRecord, validateTenant, validateContractor, hasErrors } from '@/lib/normalize'
import { Loader2, CheckCircle2, AlertTriangle, Plus } from 'lucide-react'

interface Property {
  id: string
  address: string
}

interface Tenant {
  id: string
  full_name: string
  property_id: string
}

interface Contractor {
  id: string
  contractor_name: string
  category: string
  property_ids: string[] | null
}

interface TicketFormData {
  property_id: string
  tenant_id: string
  issue_description: string
  category: string
  priority: string
  contractor_ids: string[]       // Array, required, ORDERED
  availability: string           // Optional
  access: string                 // Optional
}

interface TicketFormProps {
  initialData?: Partial<TicketFormData> & { contractor_id?: string | null }  // Support legacy single contractor
  onSubmit: (data: TicketFormData) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((p) => ({
  value: p,
  label: p.charAt(0) + p.slice(1).toLowerCase(),
}))

export function TicketForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Ticket',
}: TicketFormProps) {
  const { propertyManager } = usePM()
  const supabase = createClient()

  // Convert legacy contractor_id to contractor_ids array if present
  const initialContractorIds = initialData?.contractor_ids ||
    (initialData?.contractor_id ? [initialData.contractor_id] : [])

  const [formData, setFormData] = useState<TicketFormData>({
    property_id: initialData?.property_id || '',
    tenant_id: initialData?.tenant_id || '',
    issue_description: initialData?.issue_description || '',
    category: initialData?.category || '',
    priority: initialData?.priority || 'MEDIUM',
    contractor_ids: initialContractorIds,
    availability: initialData?.availability || '',
    access: initialData?.access || '',
  })

  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([])
  const [filteredContractors, setFilteredContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add New modals
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [addContractorOpen, setAddContractorOpen] = useState(false)
  const [newTenant, setNewTenant] = useState({ full_name: '', phone: '', email: '' })
  const [newContractor, setNewContractor] = useState({ contractor_name: '', contractor_phone: '', category: '' })
  const [savingNew, setSavingNew] = useState(false)

  // Fetch properties, tenants, and contractors
  useEffect(() => {
    if (!propertyManager) return

    const fetchData = async () => {
      setLoading(true)

      const [propsRes, tenantsRes, contractorsRes] = await Promise.all([
        supabase
          .from('c1_properties')
          .select('id, address')
          .eq('property_manager_id', propertyManager.id)
          .order('address'),
        supabase
          .from('c1_tenants')
          .select('id, full_name, property_id')
          .eq('property_manager_id', propertyManager.id)
          .order('full_name'),
        supabase
          .from('c1_contractors')
          .select('id, contractor_name, category, property_ids')
          .eq('property_manager_id', propertyManager.id)
          .eq('active', true)
          .order('category')
          .order('contractor_name'),
      ])

      if (propsRes.data) setProperties(propsRes.data)
      if (tenantsRes.data) setTenants(tenantsRes.data)
      if (contractorsRes.data) setContractors(contractorsRes.data)

      setLoading(false)
    }

    fetchData()
  }, [propertyManager, supabase])

  // Filter tenants by selected property
  useEffect(() => {
    if (formData.property_id) {
      setFilteredTenants(tenants.filter((t) => t.property_id === formData.property_id))
    } else {
      setFilteredTenants([])
    }
    // Reset tenant if property changes
    if (formData.tenant_id) {
      const validTenant = tenants.find(
        (t) => t.id === formData.tenant_id && t.property_id === formData.property_id
      )
      if (!validTenant) {
        setFormData((prev) => ({ ...prev, tenant_id: '' }))
      }
    }
  }, [formData.property_id, tenants, formData.tenant_id])

  // Show ALL contractors (no property constraint) — manual tickets need flexibility
  // Sort order: property-assigned + category match first, then property-assigned, then others
  useEffect(() => {
    const isPropertyAssigned = (c: Contractor) =>
      c.property_ids === null || (formData.property_id && c.property_ids?.includes(formData.property_id))
    const isCategoryMatch = (c: Contractor) =>
      formData.category && c.category === formData.category

    // Sort: property-assigned first, then category matches, then alphabetically
    const sorted = [...contractors].sort((a, b) => {
      const aProp = isPropertyAssigned(a) ? 0 : 1
      const bProp = isPropertyAssigned(b) ? 0 : 1
      if (aProp !== bProp) return aProp - bProp
      const aCat = isCategoryMatch(a) ? 0 : 1
      const bCat = isCategoryMatch(b) ? 0 : 1
      if (aCat !== bCat) return aCat - bCat
      return a.contractor_name.localeCompare(b.contractor_name)
    })
    setFilteredContractors(sorted)
  }, [contractors, formData.property_id, formData.category])

  // Helper to check if contractor is assigned to current property
  const isAssignedToProperty = (c: Contractor) =>
    c.property_ids === null || (formData.property_id && c.property_ids?.includes(formData.property_id))


  const updateField = useCallback((field: keyof TicketFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }, [])

  // Add new tenant handler
  const handleAddTenant = async () => {
    const errors = validateTenant({ ...newTenant, role_tag: 'tenant', property_id: formData.property_id })
    if (hasErrors(errors)) {
      setError(Object.values(errors).filter(Boolean).join(', '))
      return
    }

    setSavingNew(true)
    try {
      const normalized = normalizeRecord('tenants', {
        full_name: newTenant.full_name,
        phone: newTenant.phone,
        email: newTenant.email || null,
      })

      const { data, error: insertError } = await supabase
        .from('c1_tenants')
        .insert({
          ...normalized,
          role_tag: 'tenant',
          property_id: formData.property_id,
          property_manager_id: propertyManager!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      // Add to local state and select it
      const newT = {
        id: data.id,
        full_name: newTenant.full_name,
        property_id: formData.property_id,
      }
      setTenants((prev) => [...prev, newT])
      setFormData((prev) => ({ ...prev, tenant_id: data.id }))
      setAddTenantOpen(false)
      setNewTenant({ full_name: '', phone: '', email: '' })
      toast.success('Tenant added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tenant')
    } finally {
      setSavingNew(false)
    }
  }

  // Add new contractor handler
  const handleAddContractor = async () => {
    const errors = validateContractor({
      ...newContractor,
      contractor_email: null,
      active: true,
      property_ids: formData.property_id ? [formData.property_id] : [],
    })
    if (hasErrors(errors)) {
      setError(Object.values(errors).filter(Boolean).join(', '))
      return
    }

    setSavingNew(true)
    try {
      const normalized = normalizeRecord('contractors', {
        contractor_name: newContractor.contractor_name,
        contractor_phone: newContractor.contractor_phone,
        contractor_email: null,
      })

      const { data, error: insertError } = await supabase
        .from('c1_contractors')
        .insert({
          ...normalized,
          category: newContractor.category,
          active: true,
          property_ids: formData.property_id ? [formData.property_id] : null,
          property_manager_id: propertyManager!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      // Add to local state and select it
      const newC: Contractor = {
        id: data.id,
        contractor_name: newContractor.contractor_name,
        category: newContractor.category,
        property_ids: formData.property_id ? [formData.property_id] : null,
      }
      setContractors((prev) => [...prev, newC])
      setFormData((prev) => ({ ...prev, contractor_ids: [...prev.contractor_ids, data.id] }))
      setAddContractorOpen(false)
      setNewContractor({ contractor_name: '', contractor_phone: '', category: '' })
      toast.success('Contractor added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contractor')
    } finally {
      setSavingNew(false)
    }
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.property_id) {
      setError('Please select a property')
      return
    }
    if (!formData.tenant_id) {
      setError('Please select a tenant')
      return
    }
    if (!formData.issue_description.trim()) {
      setError('Please describe the issue')
      return
    }
    if (!formData.category) {
      setError('Please select a category')
      return
    }
    if (formData.contractor_ids.length === 0) {
      setError('Please select at least one contractor')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await onSubmit(formData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Two column grid for main fields */}
      <div className="grid grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Property <span className="text-destructive">*</span>
            </label>
            <Combobox
              options={properties.map((p) => ({ value: p.id, label: p.address }))}
              value={formData.property_id}
              onValueChange={(v) => updateField('property_id', v)}
              placeholder="Search properties..."
              searchPlaceholder="Type to search..."
              emptyText="No properties found"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Tenant <span className="text-destructive">*</span>
            </label>
            <Combobox
              options={filteredTenants.map((t) => ({ value: t.id, label: t.full_name }))}
              value={formData.tenant_id}
              onValueChange={(v) => updateField('tenant_id', v)}
              placeholder={formData.property_id ? 'Search tenants...' : 'Select property first'}
              searchPlaceholder="Type to search..."
              emptyText="No tenants found"
              disabled={!formData.property_id}
              onAddNew={formData.property_id ? () => setAddTenantOpen(true) : undefined}
              addNewLabel="Add new tenant"
            />
            {formData.property_id && filteredTenants.length === 0 && (
              <p className="text-xs text-amber-600">No tenants at this property. Click to add one.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Category <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.category}
                onValueChange={(v) => updateField('category', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Priority <span className="text-destructive">*</span>
              </label>
              <Select
                value={formData.priority}
                onValueChange={(v) => updateField('priority', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Issue Description <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={formData.issue_description}
              onChange={(e) => updateField('issue_description', e.target.value)}
              placeholder="Describe the maintenance issue..."
              rows={4}
            />
          </div>
        </div>

        {/* Right column - Contractors */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Contractors <span className="text-destructive">*</span>
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary"
                onClick={() => setAddContractorOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add New
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click to select. First contractor contacted immediately, others after 6h if no response.
            </p>
          </div>

          {filteredContractors.length === 0 ? (
            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-center">
              <p className="text-sm text-amber-700">
                No contractors available. Add contractors in the Contractors section.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
              {filteredContractors.map((c) => {
                const isSelected = formData.contractor_ids.includes(c.id)
                const orderIndex = formData.contractor_ids.indexOf(c.id)
                const isCategoryMatch = formData.category && c.category === formData.category
                const isPropertyAssigned = isAssignedToProperty(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFormData((prev) => ({
                          ...prev,
                          contractor_ids: prev.contractor_ids.filter((id) => id !== c.id),
                        }))
                      } else {
                        setFormData((prev) => ({
                          ...prev,
                          contractor_ids: [...prev.contractor_ids, c.id],
                        }))
                      }
                    }}
                    className={`w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors ${
                      isSelected ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isSelected ? (
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {orderIndex + 1}
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      <div className="flex flex-col items-start">
                        <span className={`text-sm ${isSelected ? 'font-medium' : ''}`}>
                          {c.contractor_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{c.category}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isPropertyAssigned && formData.property_id && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          Other
                        </span>
                      )}
                      {isCategoryMatch && (
                        <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                          Match
                        </span>
                      )}
                      {isSelected && orderIndex === 0 && (
                        <span className="text-xs text-primary font-medium">First</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Selected summary */}
          {formData.contractor_ids.length > 0 && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-green-800">
                    {formData.contractor_ids.length} contractor{formData.contractor_ids.length > 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    {contractors.find((c) => c.id === formData.contractor_ids[0])?.contractor_name} will be contacted first
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Category mismatch warning */}
          {formData.category && formData.contractor_ids.length > 0 && (() => {
            const mismatchedContractors = formData.contractor_ids
              .map(id => contractors.find(c => c.id === id))
              .filter(c => c && c.category !== formData.category) as Contractor[]
            if (mismatchedContractors.length === 0) return null
            return (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Category mismatch</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Job category is <span className="font-medium">&quot;{formData.category}&quot;</span> but{' '}
                      {mismatchedContractors.length === 1 ? (
                        <>
                          <span className="font-medium">{mismatchedContractors[0].contractor_name}</span> specialises in{' '}
                          <span className="font-medium">&quot;{mismatchedContractors[0].category}&quot;</span>
                        </>
                      ) : (
                        <>
                          {mismatchedContractors.map((c, i) => (
                            <span key={c.id}>
                              {i > 0 && (i === mismatchedContractors.length - 1 ? ' and ' : ', ')}
                              <span className="font-medium">{c.contractor_name}</span> ({c.category})
                            </span>
                          ))}
                          {' '}don&apos;t match
                        </>
                      )}.
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Check this is intentional before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Additional details */}
          <div className="pt-2 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Additional Details (Optional)
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tenant Availability</label>
              <Input
                value={formData.availability}
                onChange={(e) => updateField('availability', e.target.value)}
                placeholder="e.g., Weekdays after 5pm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Access Instructions</label>
              <Input
                value={formData.access}
                onChange={(e) => updateField('access', e.target.value)}
                placeholder="e.g., Key under mat"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>

      {/* Add Tenant Dialog */}
      <Dialog open={addTenantOpen} onOpenChange={setAddTenantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>
              Add a new tenant to the selected property.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={newTenant.full_name}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={newTenant.phone}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="07700 900123"
              />
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={newTenant.email}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="tenant@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTenantOpen(false)} disabled={savingNew}>
              Cancel
            </Button>
            <Button onClick={handleAddTenant} disabled={savingNew}>
              {savingNew ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contractor Dialog */}
      <Dialog open={addContractorOpen} onOpenChange={setAddContractorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Contractor</DialogTitle>
            <DialogDescription>
              Add a new contractor to your network.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={newContractor.contractor_name}
                onChange={(e) => setNewContractor((prev) => ({ ...prev, contractor_name: e.target.value }))}
                placeholder="ABC Plumbing"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={newContractor.contractor_phone}
                onChange={(e) => setNewContractor((prev) => ({ ...prev, contractor_phone: e.target.value }))}
                placeholder="07700 900123"
              />
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Category <span className="text-destructive">*</span>
              </label>
              <Select
                value={newContractor.category}
                onValueChange={(v) => setNewContractor((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContractorOpen(false)} disabled={savingNew}>
              Cancel
            </Button>
            <Button onClick={handleAddContractor} disabled={savingNew}>
              {savingNew ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Add Contractor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
