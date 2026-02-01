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
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import { Building2, User, Phone, Mail, Wrench, Ticket, Plus } from 'lucide-react'
import { CollapsibleSection } from '@/components/collapsible-section'
import { useEditMode, useCreateMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateProperty, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import type { Json } from '@/types/database'

interface PropertyHub {
  property_id: string | null
  address: string | null
  landlord_name: string | null
  landlord_phone: string | null
  landlord_email: string | null
  auto_approve_limit: number | null
  access_instructions: string | null
  emergency_access_contact: string | null
  tenants: Json | null
  contractors: Json | null
  open_tickets: Json | null
  recent_tickets: Json | null
}

interface PropertyEditable {
  id: string
  address: string
  landlord_name: string | null
  landlord_phone: string | null
  landlord_email: string | null
  auto_approve_limit: number | null
  access_instructions: string | null
  emergency_access_contact: string | null
}

interface Tenant {
  id: string
  full_name: string
  phone: string
  email: string
  role_tag: string
}

interface Contractor {
  id: string
  contractor_name: string
  category: string
}

interface TicketSummary {
  id: string
  issue_description: string
  status: string
  job_stage: string
  date_logged: string
}

const defaultPropertyData: PropertyEditable = {
  id: '',
  address: '',
  landlord_name: null,
  landlord_phone: null,
  landlord_email: null,
  auto_approve_limit: null,
  access_instructions: null,
  emergency_access_contact: null,
}

export default function PropertiesPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [properties, setProperties] = useState<PropertyHub[]>([])
  const [selectedProperty, setSelectedProperty] = useState<PropertyHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  // Convert PropertyHub to PropertyEditable
  const toEditable = (p: PropertyHub | null): PropertyEditable | null => {
    if (!p || !p.property_id) return null
    return {
      id: p.property_id,
      address: p.address || '',
      landlord_name: p.landlord_name,
      landlord_phone: p.landlord_phone,
      landlord_email: p.landlord_email,
      auto_approve_limit: p.auto_approve_limit,
      access_instructions: p.access_instructions,
      emergency_access_contact: p.emergency_access_contact,
    }
  }

  // Save handler for edit mode
  const handleSave = useCallback(async (data: PropertyEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    // Validate first
    const errors = validateProperty(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    // First get current audit log
    const { data: current } = await supabase
      .from('c1_properties')
      .select('_audit_log')
      .eq('id', data.id)
      .single()

    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]

    const normalized = normalizeRecord('properties', {
      address: data.address,
      landlord_name: data.landlord_name,
      landlord_phone: data.landlord_phone,
      landlord_email: data.landlord_email,
      auto_approve_limit: data.auto_approve_limit,
      access_instructions: data.access_instructions,
      emergency_access_contact: data.emergency_access_contact,
    })

    const { error } = await supabase
      .from('c1_properties')
      .update({
        ...normalized,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Property updated')
    await fetchProperties()
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
  } = useEditMode<PropertyEditable>({
    initialData: toEditable(selectedProperty),
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  // Create handler for new properties
  const handleCreate = useCallback(async (data: PropertyEditable) => {
    // Validate first
    const errors = validateProperty(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const normalized = normalizeRecord('properties', {
      address: data.address,
      landlord_name: data.landlord_name,
      landlord_phone: data.landlord_phone,
      landlord_email: data.landlord_email,
      auto_approve_limit: data.auto_approve_limit,
      access_instructions: data.access_instructions,
      emergency_access_contact: data.emergency_access_contact,
    })

    const { error } = await supabase
      .from('c1_properties')
      .insert({
        ...normalized,
        property_manager_id: propertyManager!.id,
      })

    if (error) throw error
    toast.success('Property added')
    await fetchProperties()
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
  } = useCreateMode<PropertyEditable>({
    defaultData: defaultPropertyData,
    onCreate: handleCreate,
  })

  useEffect(() => {
    if (!propertyManager) return
    fetchProperties()
  }, [propertyManager])

  useEffect(() => {
    if (selectedId && properties.length > 0) {
      const property = properties.find((p) => p.property_id === selectedId)
      if (property) {
        setSelectedProperty(property)
        setDrawerOpen(true)
      }
    }
  }, [selectedId, properties])

  // Reset edit data when selected property changes
  useEffect(() => {
    resetData(toEditable(selectedProperty))
  }, [selectedProperty, resetData])

  const fetchProperties = async () => {
    const { data } = await supabase
      .from('v_properties_hub')
      .select('*')
      .eq('property_manager_id', propertyManager!.id)
      .order('address')

    if (data) {
      setProperties(data)
    }
    setLoading(false)
  }

  const handleRowClick = (property: PropertyHub) => {
    if (property.property_id) {
      router.push(`/properties?id=${property.property_id}`)
    }
  }

  const handleCloseDrawer = () => {
    if (isEditing) {
      cancelEditing()
    }
    setValidationErrors({})
    setDrawerOpen(false)
    router.push('/properties')
    setSelectedProperty(null)
  }

  const handleAddClick = () => {
    setSelectedProperty(null)
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
    if (!selectedProperty?.property_id) return

    // Check for tenants first
    const { count: tenantCount } = await supabase
      .from('c1_tenants')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', selectedProperty.property_id)

    if (tenantCount && tenantCount > 0) {
      throw new Error(`Cannot delete property with ${tenantCount} tenant(s). Remove or reassign tenants first.`)
    }

    // Check for open tickets
    const { count: ticketCount } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', selectedProperty.property_id)
      .neq('status', 'closed')

    if (ticketCount && ticketCount > 0) {
      throw new Error(`Cannot delete property with ${ticketCount} open ticket(s). Close tickets first.`)
    }

    const { error } = await supabase
      .from('c1_properties')
      .delete()
      .eq('id', selectedProperty.property_id)

    if (error) throw error

    toast.success('Property deleted')
    setDeleteDialogOpen(false)
    handleCloseDrawer()
    await fetchProperties()
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return `£${amount.toFixed(0)}`
  }

  const getTenants = (tenants: Json | null): Tenant[] => {
    if (!tenants || !Array.isArray(tenants)) return []
    return tenants as unknown as Tenant[]
  }

  const getContractors = (contractors: Json | null): Contractor[] => {
    if (!contractors || !Array.isArray(contractors)) return []
    return contractors as unknown as Contractor[]
  }

  const getTickets = (tickets: Json | null): TicketSummary[] => {
    if (!tickets || !Array.isArray(tickets)) return []
    return tickets as unknown as TicketSummary[]
  }

  const columns: Column<PropertyHub>[] = [
    {
      key: 'address',
      header: 'Address',
      sortable: true,
      width: '35%',
      render: (p) => <span className="font-medium">{p.address}</span>,
    },
    {
      key: 'landlord_name',
      header: 'Landlord',
      sortable: true,
      render: (p) => p.landlord_name || '-',
    },
    {
      key: 'auto_approve_limit',
      header: 'Auto-Approve',
      sortable: true,
      render: (p) => formatCurrency(p.auto_approve_limit),
    },
    {
      key: 'tenants',
      header: 'Tenants',
      render: (p) => (
        <Badge variant="outline">{getTenants(p.tenants).length}</Badge>
      ),
    },
    {
      key: 'open_tickets',
      header: 'Open Tickets',
      render: (p) => {
        const count = getTickets(p.open_tickets).length
        return count > 0 ? (
          <Badge className="bg-primary">{count}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      },
    },
  ]

  // Render form fields (shared between edit and create modes)
  const renderFormFields = (
    data: PropertyEditable,
    update: (field: keyof PropertyEditable, value: unknown) => void
  ) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Address <span className="text-destructive">*</span>
        </label>
        <Input
          value={data.address}
          onChange={(e) => update('address', e.target.value)}
          placeholder="123 Main Street, Manchester, M1 1AA"
          className={`h-9 ${validationErrors.address ? 'border-destructive' : ''}`}
        />
        {validationErrors.address ? (
          <p className="text-xs text-destructive">{validationErrors.address}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Comma-separated, ending with UK postcode</p>
        )}
      </div>

      <DetailSection title="Landlord">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={data.landlord_name || ''}
              onChange={(e) => update('landlord_name', e.target.value || null)}
              placeholder="John Smith"
              className="h-9"
            />
          </div>
          <DetailGrid columns={2}>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={data.landlord_phone || ''}
                onChange={(e) => update('landlord_phone', e.target.value || null)}
                placeholder="07700 900123"
                className={`h-9 ${validationErrors.landlord_phone ? 'border-destructive' : ''}`}
              />
              {validationErrors.landlord_phone ? (
                <p className="text-xs text-destructive">{validationErrors.landlord_phone}</p>
              ) : (
                <p className="text-xs text-muted-foreground">UK mobile format</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Email</label>
              <Input
                type="email"
                value={data.landlord_email || ''}
                onChange={(e) => update('landlord_email', e.target.value || null)}
                placeholder="landlord@email.com"
                className={`h-9 ${validationErrors.landlord_email ? 'border-destructive' : ''}`}
              />
              {validationErrors.landlord_email && (
                <p className="text-xs text-destructive">{validationErrors.landlord_email}</p>
              )}
            </div>
          </DetailGrid>
        </div>
      </DetailSection>

      <DetailDivider />

      <DetailSection title="Settings">
        <DetailGrid columns={2}>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Auto-Approve Limit (£) <span className="text-destructive">*</span>
            </label>
            <Input
              type="number"
              value={data.auto_approve_limit ?? ''}
              onChange={(e) => update('auto_approve_limit', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="500"
              className={`h-9 ${validationErrors.auto_approve_limit ? 'border-destructive' : ''}`}
            />
            {validationErrors.auto_approve_limit && (
              <p className="text-xs text-destructive">{validationErrors.auto_approve_limit}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Emergency Contact</label>
            <Input
              value={data.emergency_access_contact || ''}
              onChange={(e) => update('emergency_access_contact', e.target.value || null)}
              placeholder="Name / Phone"
              className="h-9"
            />
          </div>
        </DetailGrid>
      </DetailSection>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Access Instructions</label>
        <Textarea
          value={data.access_instructions || ''}
          onChange={(e) => update('access_instructions', e.target.value || null)}
          placeholder="Key safe code, gate access, etc."
          rows={3}
          className="text-sm"
        />
      </div>
    </div>
  )

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Properties</h1>
          <p className="text-muted-foreground mt-1">
            Manage your property portfolio
          </p>
        </div>
        <Button onClick={handleAddClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Property
        </Button>
      </div>

      {/* Data Table */}
      <DataTable
        data={properties}
        columns={columns}
        searchPlaceholder="Search properties..."
        searchKeys={['address', 'landlord_name']}
        onRowClick={handleRowClick}
        onViewClick={handleRowClick}
        getRowId={(p) => p.property_id || ''}
        emptyMessage="No properties found"
        loading={loading}
      />

      {/* Detail Drawer - View/Edit Mode */}
      {selectedProperty && !isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          title={isEditing ? 'Edit Property' : (selectedProperty.address || 'Property')}
          width="wide"
          editable={true}
          isEditing={isEditing}
          isSaving={isSaving}
          onEdit={startEditing}
          onSave={saveChanges}
          onCancel={cancelEditing}
          deletable={true}
          onDelete={() => setDeleteDialogOpen(true)}
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
              {/* Landlord - compact */}
              <DetailSection title="Landlord">
                <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedProperty.landlord_name || 'Not set'}</p>
                    {selectedProperty.landlord_phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        {formatPhoneDisplay(selectedProperty.landlord_phone)}
                      </p>
                    )}
                    {selectedProperty.landlord_email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedProperty.landlord_email}
                      </p>
                    )}
                  </div>
                </div>
              </DetailSection>

              {/* Details - compact */}
              <DetailGrid columns={2}>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Auto-Approve</p>
                  <p className="text-sm font-medium">{formatCurrency(selectedProperty.auto_approve_limit)}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Emergency</p>
                  <p className="text-sm font-medium truncate">{selectedProperty.emergency_access_contact || '-'}</p>
                </div>
              </DetailGrid>
              {selectedProperty.access_instructions && (
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-0.5">Access</p>
                  <p className="text-xs">{selectedProperty.access_instructions}</p>
                </div>
              )}

              <DetailDivider />

              {/* Open Tickets - MOVED UP, always visible */}
              <DetailSection title={`Open Tickets (${getTickets(selectedProperty.open_tickets).length})`}>
                {getTickets(selectedProperty.open_tickets).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No open tickets</p>
                ) : (
                  <div className="space-y-1.5">
                    {getTickets(selectedProperty.open_tickets).map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/tickets?id=${ticket.id}`}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Ticket className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs truncate">
                            {ticket.issue_description || 'No description'}
                          </span>
                        </div>
                        <StatusBadge status={ticket.job_stage} />
                      </Link>
                    ))}
                  </div>
                )}
              </DetailSection>

              <DetailDivider />

              {/* Tenants - COLLAPSIBLE, closed by default */}
              <CollapsibleSection
                title="Tenants"
                count={getTenants(selectedProperty.tenants).length}
                defaultOpen={false}
              >
                {getTenants(selectedProperty.tenants).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tenants</p>
                ) : (
                  <div className="space-y-1.5">
                    {getTenants(selectedProperty.tenants).map((tenant) => (
                      <Link
                        key={tenant.id}
                        href={`/tenants?id=${tenant.id}`}
                        className="flex items-center justify-between p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <div>
                          <p className="text-sm font-medium">{tenant.full_name}</p>
                          {tenant.phone && (
                            <p className="text-xs text-muted-foreground">{formatPhoneDisplay(tenant.phone)}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">{tenant.role_tag || 'tenant'}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Contractors - COLLAPSIBLE, closed by default */}
              <CollapsibleSection
                title="Assigned Contractors"
                count={getContractors(selectedProperty.contractors).length}
                defaultOpen={false}
              >
                {getContractors(selectedProperty.contractors).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No contractors assigned</p>
                ) : (
                  <div className="space-y-1.5">
                    {getContractors(selectedProperty.contractors).map((contractor) => (
                      <Link
                        key={contractor.id}
                        href={`/contractors?id=${contractor.id}`}
                        className="flex items-center gap-2 p-2 bg-muted/30 rounded hover:bg-muted/50 transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{contractor.contractor_name}</span>
                        <span className="text-xs text-muted-foreground">({contractor.category})</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}
        </DetailDrawer>
      )}

      {/* Create Drawer - New Property */}
      {isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseCreateDrawer}
          title="New Property"
          width="wide"
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
        title="Delete Property"
        description="Are you sure you want to delete this property? This action cannot be undone. Closed tickets will remain in history."
        itemName={selectedProperty?.address || undefined}
        onConfirm={handleDelete}
      />
    </div>
  )
}
