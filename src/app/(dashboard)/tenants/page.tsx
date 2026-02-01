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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import { Phone, Mail, Building2, CheckCircle, Plus, Users } from 'lucide-react'
import { useEditMode, useCreateMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateTenant, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { TENANT_ROLES } from '@/lib/constants'

interface Tenant {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role_tag: string | null
  verified_by: string | null
  property_id: string | null
  created_at: string
  address?: string
}

interface TenantEditable {
  id: string
  full_name: string
  phone: string
  email: string | null
  role_tag: string
  property_id: string | null
}

interface PropertyOption {
  id: string
  address: string
}

const ROLE_OPTIONS = TENANT_ROLES.map((r) => ({
  value: r,
  label: r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}))

const defaultTenantData: TenantEditable = {
  id: '',
  full_name: '',
  phone: '',
  email: null,
  role_tag: 'tenant',
  property_id: null,
}

export default function TenantsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [properties, setProperties] = useState<PropertyOption[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  // Convert Tenant to TenantEditable
  const toEditable = (t: Tenant | null): TenantEditable | null => {
    if (!t) return null
    return {
      id: t.id,
      full_name: t.full_name || '',
      phone: t.phone || '',
      email: t.email,
      role_tag: t.role_tag || 'tenant',
      property_id: t.property_id,
    }
  }

  // Save handler for edit mode
  const handleSave = useCallback(async (data: TenantEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    // Validate first
    const errors = validateTenant(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const { data: current } = await supabase
      .from('c1_tenants')
      .select('_audit_log')
      .eq('id', data.id)
      .single()

    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]

    const normalized = normalizeRecord('tenants', {
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
    })

    const { error } = await supabase
      .from('c1_tenants')
      .update({
        ...normalized,
        role_tag: data.role_tag,
        property_id: data.property_id,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Tenant updated')
    await fetchTenants()
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
  } = useEditMode<TenantEditable>({
    initialData: toEditable(selectedTenant),
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  // Create handler for new tenants
  const handleCreate = useCallback(async (data: TenantEditable) => {
    // Validate first
    const errors = validateTenant(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const normalized = normalizeRecord('tenants', {
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
    })

    const { error } = await supabase
      .from('c1_tenants')
      .insert({
        ...normalized,
        role_tag: data.role_tag,
        property_id: data.property_id,
        property_manager_id: propertyManager!.id,
      })

    if (error) throw error
    toast.success('Tenant added')
    await fetchTenants()
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
  } = useCreateMode<TenantEditable>({
    defaultData: defaultTenantData,
    onCreate: handleCreate,
  })

  useEffect(() => {
    if (!propertyManager) return
    fetchTenants()
    fetchProperties()
  }, [propertyManager])

  useEffect(() => {
    if (selectedId && tenants.length > 0) {
      const tenant = tenants.find((t) => t.id === selectedId)
      if (tenant) {
        setSelectedTenant(tenant)
        setDrawerOpen(true)
      }
    }
  }, [selectedId, tenants])

  // Reset edit data when selected tenant changes
  useEffect(() => {
    resetData(toEditable(selectedTenant))
  }, [selectedTenant, resetData])

  const fetchTenants = async () => {
    const { data } = await supabase
      .from('c1_tenants')
      .select(`
        *,
        c1_properties(address)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .order('full_name')

    if (data) {
      const mapped = data.map((t) => ({
        ...t,
        address: (t.c1_properties as unknown as { address: string } | null)?.address,
      }))
      setTenants(mapped)
    }
    setLoading(false)
  }

  const fetchProperties = async () => {
    const { data } = await supabase
      .from('c1_properties')
      .select('id, address')
      .eq('property_manager_id', propertyManager!.id)
      .order('address')

    if (data) {
      setProperties(data)
    }
  }

  const handleRowClick = (tenant: Tenant) => {
    router.push(`/tenants?id=${tenant.id}`)
  }

  const handleCloseDrawer = () => {
    if (isEditing) {
      cancelEditing()
    }
    setValidationErrors({})
    setDrawerOpen(false)
    router.push('/tenants')
    setSelectedTenant(null)
  }

  const handleAddClick = () => {
    setSelectedTenant(null)
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
    if (!selectedTenant) return

    // Check for open tickets first
    const { count } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', selectedTenant.id)
      .neq('status', 'closed')

    if (count && count > 0) {
      throw new Error(`Cannot delete tenant with ${count} open ticket(s). Close or reassign tickets first.`)
    }

    const { error } = await supabase
      .from('c1_tenants')
      .delete()
      .eq('id', selectedTenant.id)

    if (error) throw error

    toast.success('Tenant deleted')
    setDeleteDialogOpen(false)
    handleCloseDrawer()
    await fetchTenants()
  }

  const columns: Column<Tenant>[] = [
    {
      key: 'full_name',
      header: 'Name',
      sortable: true,
      render: (t) => <span className="font-medium">{t.full_name || 'Unknown'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      render: (t) => (
        <span className="font-mono text-sm">{formatPhoneDisplay(t.phone) || '-'}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (t) => t.email || '-',
    },
    {
      key: 'address',
      header: 'Property',
      sortable: true,
      width: '25%',
      render: (t) => (
        <span className="truncate block max-w-xs">{t.address || '-'}</span>
      ),
    },
    {
      key: 'role_tag',
      header: 'Role',
      sortable: true,
      render: (t) => (
        <Badge variant="outline" className="capitalize">
          {t.role_tag || 'tenant'}
        </Badge>
      ),
    },
  ]

  // Render form fields (shared between edit and create modes)
  const renderFormFields = (
    data: TenantEditable,
    update: (field: keyof TenantEditable, value: unknown) => void
  ) => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">
          Full Name <span className="text-destructive">*</span>
        </label>
        <Input
          value={data.full_name}
          onChange={(e) => update('full_name', e.target.value)}
          placeholder="John Smith"
          className={`h-9 ${validationErrors.full_name ? 'border-destructive' : ''}`}
        />
        {validationErrors.full_name && (
          <p className="text-xs text-destructive">{validationErrors.full_name}</p>
        )}
      </div>

      <DetailSection title="Contact">
        <DetailGrid columns={2}>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Phone</label>
            <Input
              type="tel"
              value={data.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="07700 900123"
              className={`h-9 ${validationErrors.phone ? 'border-destructive' : ''}`}
            />
            {validationErrors.phone ? (
              <p className="text-xs text-destructive">{validationErrors.phone}</p>
            ) : (
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={data.email || ''}
              onChange={(e) => update('email', e.target.value || null)}
              placeholder="tenant@email.com"
              className={`h-9 ${validationErrors.email ? 'border-destructive' : ''}`}
            />
            {validationErrors.email && (
              <p className="text-xs text-destructive">{validationErrors.email}</p>
            )}
          </div>
        </DetailGrid>
      </DetailSection>

      <DetailDivider />

      <DetailSection title="Assignment">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Property <span className="text-destructive">*</span>
            </label>
            <Select
              value={data.property_id || ''}
              onValueChange={(v) => update('property_id', v || null)}
            >
              <SelectTrigger className={`h-9 ${validationErrors.property_id ? 'border-destructive' : ''}`}>
                <SelectValue placeholder="Select property..." />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {validationErrors.property_id && (
              <p className="text-xs text-destructive">{validationErrors.property_id}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Role</label>
            <Select
              value={data.role_tag}
              onValueChange={(v) => update('role_tag', v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DetailSection>
    </div>
  )

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tenants</h1>
          <p className="text-muted-foreground mt-1">
            Manage tenant contacts across your properties
          </p>
        </div>
        <Button onClick={handleAddClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Tenant
        </Button>
      </div>

      {/* Data Table */}
      <DataTable
        data={tenants}
        columns={columns}
        searchPlaceholder="Search tenants..."
        searchKeys={['full_name', 'phone', 'email', 'address']}
        onRowClick={handleRowClick}
        onViewClick={handleRowClick}
        getRowId={(t) => t.id}
        emptyMessage={
          <div className="text-center py-8">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium">No tenants yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add tenants manually or use the{' '}
              <Link href="/import" className="text-primary hover:underline">Import Wizard</Link>
            </p>
          </div>
        }
        loading={loading}
      />

      {/* Detail Drawer - View/Edit Mode */}
      {selectedTenant && !isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          title={isEditing ? 'Edit Tenant' : (selectedTenant.full_name || 'Tenant')}
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
              {/* Role badge - compact */}
              <div className="flex gap-2">
                <Badge variant="outline" className="capitalize">
                  {selectedTenant.role_tag || 'tenant'}
                </Badge>
                {selectedTenant.verified_by && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </div>

              {/* Contact - compact */}
              <DetailSection title="Contact">
                <div className="space-y-2">
                  {selectedTenant.phone && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-mono text-sm">{formatPhoneDisplay(selectedTenant.phone)}</p>
                      </div>
                    </div>
                  )}
                  {selectedTenant.email && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{selectedTenant.email}</p>
                      </div>
                    </div>
                  )}
                  {!selectedTenant.phone && !selectedTenant.email && (
                    <p className="text-xs text-muted-foreground">No contact info</p>
                  )}
                </div>
              </DetailSection>

              <DetailDivider />

              {/* Property - compact */}
              {selectedTenant.property_id && (
                <>
                  <DetailSection title="Property">
                    <Link
                      href={`/properties?id=${selectedTenant.property_id}`}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                      onClick={handleCloseDrawer}
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium truncate">{selectedTenant.address}</p>
                    </Link>
                  </DetailSection>
                  <DetailDivider />
                </>
              )}

              {/* Verification - compact, only show if unverified */}
              {!selectedTenant.verified_by && (
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Not verified</p>
                </div>
              )}
            </div>
          )}
        </DetailDrawer>
      )}

      {/* Create Drawer - New Tenant */}
      {isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseCreateDrawer}
          title="New Tenant"
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
        title="Delete Tenant"
        description="Are you sure you want to delete this tenant? This action cannot be undone. Any closed tickets will remain in history."
        itemName={selectedTenant?.full_name || undefined}
        onConfirm={handleDelete}
      />
    </div>
  )
}
