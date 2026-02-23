'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import {
  DetailDrawer,
  DetailSection,
  DetailGrid,
  DetailDivider,
} from '@/components/detail-drawer'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { Phone, Mail, Building2, Wrench, X, Check, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CollapsibleSection } from '@/components/collapsible-section'
import { useEditMode, useCreateMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateContractor, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'

interface Contractor {
  id: string
  contractor_name: string
  category: string
  categories: string[] | null
  contractor_phone: string | null
  contractor_email: string | null
  active: boolean
  property_ids: string[] | null
  created_at: string
}

interface ContractorEditable {
  id: string
  contractor_name: string
  categories: string[]
  contractor_phone: string
  contractor_email: string | null
  active: boolean
  property_ids: string[]
}

interface PropertyAddress {
  id: string
  address: string
}

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

const defaultContractorData: ContractorEditable = {
  id: '',
  contractor_name: '',
  categories: [],
  contractor_phone: '',
  contractor_email: null,
  active: true,
  property_ids: [],
}

export default function ContractorsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [selectedContractor, setSelectedContractor] = useState<Contractor | null>(null)
  const [propertyAddresses, setPropertyAddresses] = useState<PropertyAddress[]>([])
  const [allProperties, setAllProperties] = useState<PropertyAddress[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  // Convert Contractor to ContractorEditable
  const toEditable = (c: Contractor | null): ContractorEditable | null => {
    if (!c) return null
    return {
      id: c.id,
      contractor_name: c.contractor_name,
      categories: c.categories || (c.category ? [c.category] : []),
      contractor_phone: c.contractor_phone || '',
      contractor_email: c.contractor_email,
      active: c.active,
      property_ids: c.property_ids || [],
    }
  }

  // Save handler for edit mode
  const handleSave = useCallback(async (data: ContractorEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    // Validate first
    const errors = validateContractor(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const { data: current } = await supabase
      .from('c1_contractors')
      .select('_audit_log')
      .eq('id', data.id)
      .single()

    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]

    const normalized = normalizeRecord('contractors', {
      contractor_name: data.contractor_name,
      contractor_phone: data.contractor_phone,
      contractor_email: data.contractor_email,
    })

    const { error } = await supabase
      .from('c1_contractors')
      .update({
        ...normalized,
        category: data.categories[0] || '', // Primary category (backward compat)
        categories: data.categories,
        active: data.active,
        property_ids: data.property_ids,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Contractor updated')
    await fetchContractors()
  }, [supabase])

  const {
    isEditing,
    editedData,
    isSaving,
    error: editError,
    startEditing,
    cancelEditing,
    updateField,
    saveChanges,
    resetData,
  } = useEditMode<ContractorEditable>({
    initialData: toEditable(selectedContractor),
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  // Create handler for new contractors
  const handleCreate = useCallback(async (data: ContractorEditable) => {
    // Validate first
    const errors = validateContractor(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const normalized = normalizeRecord('contractors', {
      contractor_name: data.contractor_name,
      contractor_phone: data.contractor_phone,
      contractor_email: data.contractor_email,
    })

    const { error } = await supabase
      .from('c1_contractors')
      .insert({
        ...normalized,
        category: data.categories[0] || '', // Primary category (backward compat)
        categories: data.categories,
        active: data.active,
        property_ids: data.property_ids,
        property_manager_id: propertyManager!.id,
      })

    if (error) throw error
    toast.success('Contractor added')
    await fetchContractors()
  }, [supabase, propertyManager])

  const {
    isCreating,
    formData,
    isSaving: isCreatingSaving,
    error: createError,
    startCreating,
    cancelCreating,
    updateField: updateCreateField,
    saveNew,
  } = useCreateMode<ContractorEditable>({
    defaultData: defaultContractorData,
    onCreate: handleCreate,
  })

  useEffect(() => {
    fetchContractors()
    if (propertyManager) {
      fetchAllProperties()
    }
  }, [propertyManager])

  useEffect(() => {
    if (selectedId && contractors.length > 0) {
      const contractor = contractors.find((c) => c.id === selectedId)
      if (contractor) {
        setSelectedContractor(contractor)
        setDrawerOpen(true)
        fetchPropertyAddresses(contractor.property_ids)
      }
    }
  }, [selectedId, contractors])

  // Reset edit data when selected contractor changes
  useEffect(() => {
    resetData(toEditable(selectedContractor))
  }, [selectedContractor, resetData])

  const fetchAllProperties = async () => {
    const { data } = await supabase
      .from('c1_properties')
      .select('id, address')
      .eq('property_manager_id', propertyManager!.id)
      .order('address')

    if (data) {
      setAllProperties(data)
    }
  }

  const fetchPropertyAddresses = async (propertyIds: string[] | null) => {
    if (!propertyIds || propertyIds.length === 0) {
      setPropertyAddresses([])
      return
    }

    const { data } = await supabase
      .from('c1_properties')
      .select('id, address')
      .in('id', propertyIds)

    if (data) {
      setPropertyAddresses(data)
    } else {
      setPropertyAddresses([])
    }
  }

  const fetchContractors = async () => {
    const { data } = await supabase
      .from('c1_contractors')
      .select('*')
      .eq('property_manager_id', propertyManager!.id)
      .eq('active', true)
      .order('category')
      .order('contractor_name')

    if (data) {
      setContractors(data)
    }
    setLoading(false)
  }

  const handleRowClick = (contractor: Contractor) => {
    router.push(`/contractors/${contractor.id}`)
  }

  const handleCloseDrawer = () => {
    if (isEditing) {
      cancelEditing()
    }
    setValidationErrors({})
    setDrawerOpen(false)
    router.push('/contractors')
    setSelectedContractor(null)
    setPropertyAddresses([])
  }

  const handleAddClick = () => {
    setSelectedContractor(null)
    setValidationErrors({})
    startCreating()
    setDrawerOpen(true)
  }

  const handleCloseCreateDrawer = () => {
    cancelCreating()
    setValidationErrors({})
    setDrawerOpen(false)
  }

  const handleDelete = async () => {
    if (!selectedContractor) return

    // Check for open tickets assigned to this contractor (exclude archived)
    const { count } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contractor_id', selectedContractor.id)
      .neq('status', 'closed')
      .neq('archived', true)

    if (count && count > 0) {
      throw new Error(`Cannot deactivate contractor with ${count} open ticket(s). Close or reassign tickets first.`)
    }

    // Soft delete - set active = false
    const { error } = await supabase
      .from('c1_contractors')
      .update({ active: false })
      .eq('id', selectedContractor.id)

    if (error) throw error

    toast.success('Contractor deactivated')
    setDeleteDialogOpen(false)
    handleCloseDrawer()
    await fetchContractors()
  }

  const columns: Column<Contractor>[] = [
    {
      key: 'contractor_name',
      header: 'Name',
      sortable: true,
      render: (c) => <span className="font-medium">{c.contractor_name}</span>,
    },
    {
      key: 'category',
      header: 'Categories',
      sortable: true,
      render: (c) => {
        const cats = c.categories?.length ? c.categories : (c.category ? [c.category] : [])
        return (
          <div className="flex flex-wrap gap-1">
            {cats.map((cat) => (
              <Badge key={cat} variant="outline" className="text-xs">
                <Wrench className="h-3 w-3 mr-1" />
                {cat}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      key: 'contractor_phone',
      header: 'Phone',
      sortable: true,
      render: (c) => (
        <span className="font-mono text-sm">{formatPhoneDisplay(c.contractor_phone) || '-'}</span>
      ),
    },
    {
      key: 'contractor_email',
      header: 'Email',
      sortable: true,
      render: (c) => c.contractor_email || '-',
    },
    {
      key: 'property_ids',
      header: 'Properties',
      render: (c) => (
        <Badge variant="secondary">
          {c.property_ids?.length || 0}
        </Badge>
      ),
    },
  ]

  // Multi-select property handler
  const handlePropertyToggle = (
    data: ContractorEditable,
    update: (field: keyof ContractorEditable, value: unknown) => void,
    propertyId: string
  ) => {
    const currentIds = data.property_ids
    if (currentIds.includes(propertyId)) {
      update('property_ids', currentIds.filter((id) => id !== propertyId))
    } else {
      update('property_ids', [...currentIds, propertyId])
    }
  }

  // Render form fields (shared between edit and create modes)
  const renderFormFields = (
    data: ContractorEditable,
    update: (field: keyof ContractorEditable, value: unknown) => void
  ) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Name <span className="text-destructive">*</span>
        </label>
        <Input
          value={data.contractor_name}
          onChange={(e) => update('contractor_name', e.target.value)}
          placeholder="ABC Plumbing"
          className={`h-9 ${validationErrors.contractor_name ? 'border-destructive' : ''}`}
        />
        {validationErrors.contractor_name && (
          <p className="text-xs text-destructive">{validationErrors.contractor_name}</p>
        )}
      </div>

      <DetailSection title="Details">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Categories <span className="text-destructive">*</span>
            </label>
            {data.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {data.categories.map((cat) => (
                  <Badge key={cat} variant="secondary" className="gap-1 pr-1 text-xs">
                    {cat}
                    <button
                      type="button"
                      onClick={() => update('categories', data.categories.filter((c) => c !== cat))}
                      className="hover:bg-muted rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center justify-between w-full h-9 px-3 text-sm rounded-md border bg-background hover:bg-accent/50 transition-colors text-left ${
                    validationErrors.category ? 'border-destructive' : 'border-input'
                  }`}
                >
                  <span className="text-muted-foreground">
                    {data.categories.length === 0 ? 'Select categories...' : 'Add more...'}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-1.5 max-h-64 overflow-y-auto" align="start">
                {CATEGORY_OPTIONS.map((opt) => {
                  const isSelected = data.categories.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const newCats = isSelected
                          ? data.categories.filter((c) => c !== opt.value)
                          : [...data.categories, opt.value]
                        update('categories', newCats)
                      }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-primary border-primary' : 'border-input'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </PopoverContent>
            </Popover>
            {validationErrors.category && (
              <p className="text-xs text-destructive">{validationErrors.category}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={data.active ? 'active' : 'inactive'}
              onValueChange={(v) => update('active', v === 'active')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DetailSection>

      <DetailDivider />

      <DetailSection title="Contact">
        <DetailGrid columns={2}>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Phone <span className="text-destructive">*</span>
            </label>
            <Input
              type="tel"
              value={data.contractor_phone}
              onChange={(e) => update('contractor_phone', e.target.value)}
              placeholder="07700 900123"
              className={`h-9 ${validationErrors.contractor_phone ? 'border-destructive' : ''}`}
            />
            {validationErrors.contractor_phone ? (
              <p className="text-xs text-destructive">{validationErrors.contractor_phone}</p>
            ) : (
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={data.contractor_email || ''}
              onChange={(e) => update('contractor_email', e.target.value || null)}
              placeholder="contractor@email.com"
              className={`h-9 ${validationErrors.contractor_email ? 'border-destructive' : ''}`}
            />
            {validationErrors.contractor_email && (
              <p className="text-xs text-destructive">{validationErrors.contractor_email}</p>
            )}
          </div>
        </DetailGrid>
      </DetailSection>

      <DetailDivider />

      <DetailSection title="Assigned Properties">
        <div className="space-y-2">
          {data.property_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {data.property_ids.map((id) => {
                const prop = allProperties.find((p) => p.id === id)
                return prop ? (
                  <Badge key={id} variant="secondary" className="gap-1 pr-1">
                    <span className="truncate max-w-[150px]">{prop.address}</span>
                    <button
                      type="button"
                      onClick={() => handlePropertyToggle(data, update, id)}
                      className="hover:bg-muted rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null
              })}
            </div>
          )}
          <Select
            value=""
            onValueChange={(v) => {
              if (v && !data.property_ids.includes(v)) {
                update('property_ids', [...data.property_ids, v])
              }
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Add property..." />
            </SelectTrigger>
            <SelectContent>
              {allProperties
                .filter((p) => !data.property_ids.includes(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.address}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {allProperties.length === 0 && (
            <p className="text-xs text-muted-foreground">No properties available</p>
          )}
        </div>
      </DetailSection>
    </div>
  )

  return (
    <div className="p-8 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Contractors
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your contractor network
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchContractors()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <InteractiveHoverButton text="Add Contractor" onClick={handleAddClick} className="w-40 text-sm h-10" />
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={contractors}
          columns={columns}
          searchPlaceholder="Search contractors..."
          searchKeys={['contractor_name', 'category', 'contractor_email']}
          onRowClick={handleRowClick}
          onViewClick={handleRowClick}
          getRowId={(c) => c.id}
          fillHeight
          emptyMessage={
            <div className="text-center py-8">
              <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="font-medium">No contractors yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add contractors manually or use the{' '}
                <Link href="/import" className="text-primary hover:underline">Import Wizard</Link>
              </p>
            </div>
          }
          loading={loading}
        />
      </div>

      {/* Detail Drawer - View/Edit Mode */}
      {selectedContractor && !isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          title={isEditing ? 'Edit Contractor' : selectedContractor.contractor_name}
          editable={true}
          isEditing={isEditing}
          isSaving={isSaving}
          onEdit={startEditing}
          onSave={saveChanges}
          onCancel={cancelEditing}
          deletable={true}
          onDelete={() => setDeleteDialogOpen(true)}
          deleteLabel="Deactivate"
        >
          {isEditing && editedData ? (
            <div className="space-y-4">
              {editError && (
                <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                  {editError}
                </div>
              )}
              {renderFormFields(editedData, updateField)}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status badges - compact */}
              <div className="flex gap-2 flex-wrap">
                {(selectedContractor.categories?.length ? selectedContractor.categories : [selectedContractor.category]).map((cat) => (
                  <Badge key={cat} variant="outline">
                    <Wrench className="h-3 w-3 mr-1" />
                    {cat}
                  </Badge>
                ))}
                <Badge variant={selectedContractor.active ? 'default' : 'secondary'}>
                  {selectedContractor.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              {/* Contact - compact */}
              <DetailSection title="Contact">
                <div className="space-y-2">
                  {selectedContractor.contractor_phone && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-mono text-sm">{formatPhoneDisplay(selectedContractor.contractor_phone)}</p>
                      </div>
                    </div>
                  )}
                  {selectedContractor.contractor_email && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{selectedContractor.contractor_email}</p>
                      </div>
                    </div>
                  )}
                  {!selectedContractor.contractor_phone && !selectedContractor.contractor_email && (
                    <p className="text-xs text-muted-foreground">No contact info</p>
                  )}
                </div>
              </DetailSection>

              <DetailDivider />

              {/* Properties - COLLAPSIBLE if > 3 properties */}
              {propertyAddresses.length === 0 ? (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No properties assigned</p>
                </div>
              ) : propertyAddresses.length > 3 ? (
                <CollapsibleSection
                  title="Assigned Properties"
                  count={propertyAddresses.length}
                  defaultOpen={false}
                >
                  <div className="space-y-1.5">
                    {propertyAddresses.map((property) => (
                      <Link
                        key={property.id}
                        href={`/properties/${property.id}`}
                        className="flex items-center gap-2 p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs font-medium truncate">{property.address}</p>
                      </Link>
                    ))}
                  </div>
                </CollapsibleSection>
              ) : (
                <DetailSection title={`Assigned Properties (${propertyAddresses.length})`}>
                  <div className="space-y-1.5">
                    {propertyAddresses.map((property) => (
                      <Link
                        key={property.id}
                        href={`/properties/${property.id}`}
                        className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <p className="text-sm font-medium truncate">{property.address}</p>
                      </Link>
                    ))}
                  </div>
                </DetailSection>
              )}
            </div>
          )}
        </DetailDrawer>
      )}

      {/* Create Drawer - New Contractor */}
      {isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseCreateDrawer}
          title="New Contractor"
          editable={false}
          isEditing={true}
          isSaving={isCreatingSaving}
          onSave={saveNew}
          onCancel={handleCloseCreateDrawer}
        >
          <div className="space-y-4">
            {createError && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {createError}
              </div>
            )}
            {renderFormFields(formData, updateCreateField)}
          </div>
        </DetailDrawer>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Deactivate Contractor"
        description="Are you sure you want to deactivate this contractor? They will no longer appear in selection lists but historical data will be preserved."
        itemName={selectedContractor?.contractor_name || undefined}
        onConfirm={handleDelete}
      />
    </div>
  )
}
