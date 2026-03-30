'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  DetailField,
} from '@/components/detail-drawer'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import Link from 'next/link'
import { Building2, Contact, MoreHorizontal } from 'lucide-react'
import { EditableField } from '@/components/editable-field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageShell } from '@/components/page-shell'
import { CommandSearchInput } from '@/components/command-search-input'
import { Button } from '@/components/ui/button'
import { useEditMode, useCreateMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateLandlord, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'

interface Landlord {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  created_at: string
  property_count: number
  properties: { id: string; address: string }[]
  contact_method: string
}

interface LandlordEditable {
  id: string
  full_name: string
  phone: string
  email: string | null
  contact_method: string
}

const defaultLandlordData: LandlordEditable = {
  id: '',
  full_name: '',
  phone: '',
  email: null,
  contact_method: 'whatsapp',
}

export default function LandlordsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filteredLandlords = useMemo(() => {
    if (!search) return landlords
    const lower = search.toLowerCase()
    return landlords.filter(l =>
      l.full_name?.toLowerCase().includes(lower) ||
      l.phone?.toLowerCase().includes(lower) ||
      l.email?.toLowerCase().includes(lower)
    )
  }, [landlords, search])
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  const toEditable = (l: Landlord | null): LandlordEditable | null => {
    if (!l) return null
    return {
      id: l.id,
      full_name: l.full_name || '',
      phone: l.phone || '',
      email: l.email,
      contact_method: l.contact_method || 'whatsapp',
    }
  }

  const handleSave = useCallback(async (data: LandlordEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateLandlord(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const { data: current } = await supabase
      .from('c1_landlords')
      .select('_audit_log')
      .eq('id', data.id)
      .single()

    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]

    const normalized = normalizeRecord('landlords', {
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
    })

    const { error } = await supabase
      .from('c1_landlords')
      .update({
        ...normalized,
        contact_method: data.contact_method,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Landlord updated')
    await fetchLandlords()
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
  } = useEditMode<LandlordEditable>({
    initialData: toEditable(selectedLandlord),
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  const handleCreate = useCallback(async (data: LandlordEditable) => {
    const errors = validateLandlord(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const normalized = normalizeRecord('landlords', {
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
    })

    const { error } = await supabase
      .from('c1_landlords')
      .insert({
        ...normalized,
        property_manager_id: propertyManager!.id,
      })

    if (error) throw error
    toast.success('Landlord added')
    await fetchLandlords()
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
  } = useCreateMode<LandlordEditable>({
    defaultData: defaultLandlordData,
    onCreate: handleCreate,
  })

  useEffect(() => {
    if (!propertyManager) return
    fetchLandlords()
  }, [propertyManager])

  useEffect(() => {
    if (selectedId && landlords.length > 0) {
      const landlord = landlords.find((l) => l.id === selectedId)
      if (landlord) {
        setSelectedLandlord(landlord)
        setDrawerOpen(true)
      }
    }
  }, [selectedId, landlords])

  useEffect(() => {
    resetData(toEditable(selectedLandlord))
  }, [selectedLandlord, resetData])

  const fetchLandlords = async () => {
    const { data } = await supabase
      .from('c1_landlords')
      .select(`
        *,
        c1_properties!landlord_id(id, address)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .order('full_name')

    if (data) {
      const mapped = data.map((l) => {
        const props = (l.c1_properties as unknown as { id: string; address: string }[] | null) || []
        return {
          ...l,
          property_count: props.length,
          properties: props,
        }
      })
      setLandlords(mapped)
    }
    setLoading(false)
  }

  const handleRowClick = (landlord: Landlord) => {
    router.push(`/landlords/${landlord.id}`)
  }

  const handleCloseDrawer = () => {
    if (isEditing) {
      cancelEditing()
    }
    setValidationErrors({})
    setDrawerOpen(false)
    setSelectedLandlord(null)
  }

  const handleAddClick = () => {
    setSelectedLandlord(null)
    setValidationErrors({})
    startCreating()
    setDrawerOpen(true)
  }

  // Auto-open create from global header ?create=true
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      handleAddClick()
      window.history.replaceState({}, '', '/landlords')
    }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCloseCreateDrawer = () => {
    cancelCreating()
    setValidationErrors({})
    setDrawerOpen(false)
  }

  const handleDelete = async () => {
    if (!selectedLandlord) return

    // Check for linked properties
    if (selectedLandlord.property_count > 0) {
      throw new Error(`Cannot delete landlord with ${selectedLandlord.property_count} linked property/properties. Reassign properties first.`)
    }

    const { error } = await supabase
      .from('c1_landlords')
      .delete()
      .eq('id', selectedLandlord.id)

    if (error) throw error

    toast.success('Landlord deleted')
    setDeleteDialogOpen(false)
    handleCloseDrawer()
    await fetchLandlords()
  }

  const columns: Column<Landlord>[] = [
    {
      key: 'full_name',
      header: 'Name',
      sortable: true,
      render: (row) => <span className="font-medium text-foreground">{row.full_name}</span>,
      getValue: (row) => row.full_name,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => <span className="font-mono text-sm">{formatPhoneDisplay(row.phone) || '—'}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (row) => <span className="text-muted-foreground">{row.email ?? '—'}</span>,
    },
    {
      key: 'contact_method',
      header: 'Contact Method',
      sortable: true,
      render: (row) => {
        if (row.contact_method === 'whatsapp') return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success border border-success/20">
            WhatsApp
          </span>
        )
        if (row.contact_method === 'email') return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            Email
          </span>
        )
        return <span className="text-muted-foreground">—</span>
      },
      getValue: (row) => row.contact_method,
    },
    {
      key: 'property_count',
      header: 'Properties',
      sortable: true,
      render: (row) => <span className="text-muted-foreground">{row.property_count}</span>,
      getValue: (row) => row.property_count,
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
                setSelectedLandlord(row)
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
                setSelectedLandlord(row)
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

  const renderFormFields = (
    data: LandlordEditable,
    update: (field: keyof LandlordEditable, value: unknown) => void
  ) => (
    <div className="space-y-4">
      <EditableField
        type="text"
        label="Full Name"
        value={data.full_name}
        onChange={(v) => update('full_name', v)}
        isEditing={true}
        required
      />
      <DetailSection title="Contact">
        <DetailGrid columns={2}>
          <EditableField
            type="phone"
            label="Phone"
            value={data.phone ?? ''}
            onChange={(v) => update('phone', v)}
            isEditing={true}
            required
          />
          <EditableField
            type="email"
            label="Email"
            value={data.email ?? ''}
            onChange={(v) => update('email', v || null)}
            isEditing={true}
          />
        </DetailGrid>
      </DetailSection>
      <EditableField
        type="select"
        label="Contact Method"
        value={data.contact_method}
        onChange={(v) => update('contact_method', v)}
        isEditing={true}
        options={[
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'email', label: 'Email' },
        ]}
      />
    </div>
  )

  return (
    <PageShell
      title="Landlords"
      count={filteredLandlords.length}
      actions={
        <CommandSearchInput
          placeholder="Search landlords..."
          value={search}
          onChange={setSearch}
          className="w-64"
        />
      }
    >

      {/* Data Table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DataTable
          data={filteredLandlords}
          columns={columns}
          onRowClick={handleRowClick}
          getRowId={(l) => l.id}
          fillHeight
          emptyMessage={
            <div className="text-center py-8">
              <Contact className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="font-medium">No landlords yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add landlords manually or use the{' '}
                <Link href="/import" className="text-primary hover:underline">Import Wizard</Link>
              </p>
            </div>
          }
          loading={loading}
        />
      </div>

      {/* Detail Drawer - View/Edit Mode */}
      {selectedLandlord && !isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          title={isEditing ? 'Edit Landlord' : (selectedLandlord.full_name || 'Landlord')}
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
              {/* Contact */}
              <DetailSection title="Contact">
                <DetailGrid columns={2}>
                  <DetailField label="Phone">
                    {selectedLandlord.phone ? formatPhoneDisplay(selectedLandlord.phone) : '—'}
                  </DetailField>
                  <DetailField label="Email">
                    {selectedLandlord.email ?? '—'}
                  </DetailField>
                </DetailGrid>
                <DetailField label="Contact Method">
                  {selectedLandlord.contact_method === 'whatsapp' ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success border border-success/20">
                      WhatsApp
                    </span>
                  ) : selectedLandlord.contact_method === 'email' ? (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                      Email
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </DetailField>
              </DetailSection>

              <DetailDivider />

              {/* Properties */}
              <DetailSection title={`Properties (${selectedLandlord.properties.length})`}>
                {selectedLandlord.properties.length > 0 ? (
                  <div className="space-y-2">
                    {selectedLandlord.properties.map((p) => (
                      <Link
                        key={p.id}
                        href={`/properties/${p.id}`}
                        className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                        onClick={handleCloseDrawer}
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium truncate">{p.address}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No properties linked</p>
                )}
              </DetailSection>
            </div>
          )}
        </DetailDrawer>
      )}

      {/* Create Drawer - New Landlord */}
      {isCreating && (
        <DetailDrawer
          open={drawerOpen}
          onClose={handleCloseCreateDrawer}
          title="New Landlord"
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
        title="Delete Landlord"
        description="Are you sure you want to delete this landlord? This action cannot be undone."
        itemName={selectedLandlord?.full_name || undefined}
        onConfirm={handleDelete}
      />
    </PageShell>
  )
}
