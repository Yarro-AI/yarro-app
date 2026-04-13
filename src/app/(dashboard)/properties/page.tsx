'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import { QueryError } from '@/components/query-error'
import {
  DetailDrawer,
  DetailSection,
  DetailGrid,
  DetailDivider,
} from '@/components/detail-drawer'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, Phone, Mail, Wrench, Ticket, Contact, MoreHorizontal, ShieldCheck, Download, Upload } from 'lucide-react'
import { BulkImportDialog } from '@/components/bulk-import/bulk-import-dialog'
import { exportToCSV, PROPERTY_EXPORT_COLUMNS } from '@/lib/export'
import { useOpenTicket } from '@/hooks/use-open-ticket'
import { PageShell } from '@/components/page-shell'
import { CommandSearchInput } from '@/components/command-search-input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { CollapsibleSection } from '@/components/collapsible-section'
import { useEditMode, useCreateMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateProperty, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import type { Json } from '@/types/database'

interface PropertyHub {
  property_id: string | null
  address: string | null
  landlord_id: string | null
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
  total_rooms: number | null
  occupied_rooms: number | null
}

interface LandlordOption {
  id: string
  full_name: string
  phone: string | null
  email: string | null
}

interface PropertyEditable {
  id: string
  address: string
  landlord_id: string | null
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
  date_logged: string
}

const defaultPropertyData: PropertyEditable = {
  id: '',
  address: '',
  landlord_id: null,
  auto_approve_limit: null,
  access_instructions: null,
  emergency_access_contact: null,
}

export default function PropertiesPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const openTicket = useOpenTicket()
  const [properties, setProperties] = useState<PropertyHub[]>([])
  const [selectedProperty, setSelectedProperty] = useState<PropertyHub | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const filteredProperties = useMemo(() => {
    if (!search) return properties
    const lower = search.toLowerCase()
    return properties.filter(p =>
      p.address?.toLowerCase().includes(lower) ||
      p.landlord_name?.toLowerCase().includes(lower)
    )
  }, [properties, search])
  const [landlordOptions, setLandlordOptions] = useState<LandlordOption[]>([])
  // Map of property_id → worst compliance status
  const [complianceByProperty, setComplianceByProperty] = useState<
    Map<string, 'valid' | 'expiring' | 'expired' | 'incomplete'>
  >(new Map())
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  // Convert PropertyHub to PropertyEditable
  const toEditable = (p: PropertyHub | null): PropertyEditable | null => {
    if (!p || !p.property_id) return null
    return {
      id: p.property_id,
      address: p.address || '',
      landlord_id: p.landlord_id,
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

    // Look up the selected landlord to sync denormalized fields
    const selectedLl = landlordOptions.find((l) => l.id === data.landlord_id)

    const normalized = normalizeRecord('properties', {
      address: data.address,
      auto_approve_limit: data.auto_approve_limit,
      access_instructions: data.access_instructions,
      emergency_access_contact: data.emergency_access_contact,
    })

    const { error } = await supabase
      .from('c1_properties')
      .update({
        ...normalized,
        landlord_id: data.landlord_id,
        landlord_name: selectedLl?.full_name || null,
        landlord_phone: selectedLl?.phone || null,
        landlord_email: selectedLl?.email || null,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Property updated')
    await fetchProperties()
  }, [supabase, landlordOptions])

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

    const selectedLl = landlordOptions.find((l) => l.id === data.landlord_id)

    const normalized = normalizeRecord('properties', {
      address: data.address,
      auto_approve_limit: data.auto_approve_limit,
      access_instructions: data.access_instructions,
      emergency_access_contact: data.emergency_access_contact,
    })

    const { error } = await supabase
      .from('c1_properties')
      .insert({
        ...normalized,
        landlord_id: data.landlord_id,
        landlord_name: selectedLl?.full_name || null,
        landlord_phone: selectedLl?.phone || null,
        landlord_email: selectedLl?.email || null,
        property_manager_id: propertyManager!.id,
      })

    if (error) throw error
    toast.success('Property added')
    await fetchProperties()
  }, [supabase, propertyManager, landlordOptions])

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

  const fetchLandlords = async () => {
    const { data, error } = await supabase
      .from('c1_landlords')
      .select('id, full_name, phone, email')
      .eq('property_manager_id', propertyManager!.id)
      .order('full_name')

    if (error) { toast.error('Failed to load landlords'); return }
    if (data) setLandlordOptions(data)
  }

  const fetchComplianceStatuses = async () => {
    const { data, error } = await supabase.rpc('compliance_get_all_statuses', {
      p_pm_id: propertyManager!.id,
    })

    if (error) { toast.error('Failed to load compliance statuses'); return }
    if (!data) return

    // Group by property_id and find the worst status per property
    const severityRank: Record<string, number> = {
      expired: 5, incomplete: 4, expiring_soon: 3, review: 2,
      renewal_requested: 1, renewal_scheduled: 1, valid: 0,
    }
    const statusMap = new Map<string, 'valid' | 'expiring' | 'expired' | 'incomplete'>()

    for (const row of data as unknown as Array<{ property_id: string; display_status: string; status_group: string }>) {
      // Use status_group (SSOT) for valid; display_status for specific attention type
      const mapped: 'valid' | 'expiring' | 'expired' | 'incomplete' =
        row.status_group === 'valid' ? 'valid'
        : row.display_status === 'expired' ? 'expired'
        : row.display_status === 'incomplete' ? 'incomplete'
        : 'expiring'
      const current = statusMap.get(row.property_id)
      const currentRank = current ? (severityRank[current] ?? 0) : -1
      if ((severityRank[row.display_status] ?? 0) > currentRank) {
        statusMap.set(row.property_id, mapped)
      }
    }
    setComplianceByProperty(statusMap)
  }

  useEffect(() => {
    if (!propertyManager) return
    fetchProperties()
    fetchLandlords()
    fetchComplianceStatuses()
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
    const { data, error } = await supabase
      .from('v_properties_hub')
      .select('*')
      .eq('property_manager_id', propertyManager!.id)
      .order('address')

    if (error) { setFetchError('Failed to load properties'); setLoading(false); return }
    setFetchError(null)
    if (data) {
      setProperties(data)
    }
    setLoading(false)
  }

  const handleRowClick = (property: PropertyHub) => {
    if (property.property_id) {
      router.push(`/properties/${property.property_id}`)
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

  // Auto-open create from global header ?create=true
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      handleAddClick()
      window.history.replaceState({}, '', '/properties')
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

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

    // Check for open tickets (exclude archived)
    const { count: ticketCount } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', selectedProperty.property_id)
      .neq('status', 'closed')
      .neq('archived', true)

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
      render: (p) => {
        const count = getTenants(p.tenants).length
        return (
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {count}
          </span>
        )
      },
    },
    {
      key: 'rooms',
      header: 'Rooms',
      render: (p) => {
        const total = p.total_rooms ?? 0
        if (total === 0) return <span className="text-muted-foreground">—</span>
        const occupied = p.occupied_rooms ?? 0
        return <span className="text-sm">{occupied}/{total}</span>
      },
    },
    {
      key: 'open_tickets',
      header: 'Open Tickets',
      render: (p) => {
        const count = getTickets(p.open_tickets).length
        return count > 0 ? (
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {count}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      key: 'compliance',
      header: 'Compliance',
      render: (p) => {
        if (!p.property_id) return null
        const status = complianceByProperty.get(p.property_id)
        if (!status) {
          return (
            <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              —
            </span>
          )
        }
        return <StatusBadge status={status} />
      },
    },
    {
      key: 'actions',
      header: '',
      width: 'w-12',
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                setSelectedProperty(row)
                startEditing()
                setDrawerOpen(true)
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-danger focus:text-danger"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedProperty(row)
                setDeleteDialogOpen(true)
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
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
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Select Landlord</label>
          <Select
            value={data.landlord_id || 'none'}
            onValueChange={(v) => update('landlord_id', v === 'none' ? null : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select landlord..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No landlord</SelectItem>
              {landlordOptions.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.full_name}{l.phone ? ` (${formatPhoneDisplay(l.phone)})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manage landlords from the{' '}
            <Link href="/landlords" className="text-primary hover:underline">Landlords page</Link>
          </p>
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
        <label className="text-xs text-muted-foreground">Access Details</label>
        <Textarea
          value={data.access_instructions || ''}
          onChange={(e) => update('access_instructions', e.target.value || null)}
          placeholder="Gate code, key safe number, entry instructions, etc."
          rows={3}
          className="text-sm"
        />
      </div>
    </div>
  )

  return (
    <PageShell
      title="Properties"
      count={filteredProperties.length}
      actions={
        <div className="flex items-center gap-2">
          <CommandSearchInput
            placeholder="Search properties..."
            value={search}
            onChange={setSearch}
            className="w-64"
          />
          <BulkImportDialog
            entityType="unified"
            open={importOpen}
            onOpenChange={(open) => {
              setImportOpen(open)
              if (!open) fetchProperties()
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCSV(filteredProperties, PROPERTY_EXPORT_COLUMNS, 'yarro-properties')}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      }
    >

      {/* Data Table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {fetchError ? (
          <QueryError message={fetchError} onRetry={fetchProperties} />
        ) : (
          <DataTable
            data={filteredProperties}
            columns={columns}
            onRowClick={handleRowClick}
            getRowId={(p) => p.property_id || ''}
            emptyMessage="No properties found"
            loading={loading}
            fillHeight
          />
        )}
      </div>

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
              {/* Landlord - compact, clickable link */}
              <DetailSection title="Landlord">
                {selectedProperty.landlord_id ? (
                  <Link
                    href={`/landlords/${selectedProperty.landlord_id}`}
                    className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Contact className="h-4 w-4 text-muted-foreground mt-0.5" />
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
                  </Link>
                ) : (
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                    <Contact className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <p className="text-sm text-muted-foreground">No landlord assigned</p>
                  </div>
                )}
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
                      <button
                        key={ticket.id}
                        onClick={() => { openTicket(ticket.id); handleCloseDrawer() }}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors w-full text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Ticket className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs truncate">
                            {ticket.issue_description || 'No description'}
                          </span>
                        </div>
                      </button>
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
                        href={`/tenants/${tenant.id}`}
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
                        href={`/contractors/${contractor.id}`}
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
    </PageShell>
  )
}
