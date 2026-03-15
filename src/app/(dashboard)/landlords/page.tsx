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
} from '@/components/detail-drawer'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { Badge } from '@/components/ui/badge'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { Phone, Mail, Building2, Contact, RefreshCw } from 'lucide-react'
import { PageShell } from '@/components/page-shell'
import { cn } from '@/lib/utils'
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
}

interface LandlordEditable {
  id: string
  full_name: string
  phone: string
  email: string | null
}

const defaultLandlordData: LandlordEditable = {
  id: '',
  full_name: '',
  phone: '',
  email: null,
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
    router.push('/landlords')
    setSelectedLandlord(null)
  }

  const handleAddClick = () => {
    setSelectedLandlord(null)
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
      render: (l) => <span className="font-medium">{l.full_name || 'Unknown'}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      render: (l) => (
        <span className="font-mono text-sm">{formatPhoneDisplay(l.phone) || '-'}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortable: true,
      render: (l) => l.email || '-',
    },
    {
      key: 'property_count',
      header: 'Properties',
      sortable: true,
      render: (l) => (
        <Badge variant="outline">{l.property_count}</Badge>
      ),
    },
  ]

  const renderFormFields = (
    data: LandlordEditable,
    update: (field: keyof LandlordEditable, value: unknown) => void
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
            <label className="text-xs text-muted-foreground">
              Phone <span className="text-destructive">*</span>
            </label>
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
              placeholder="landlord@email.com"
              className={`h-9 ${validationErrors.email ? 'border-destructive' : ''}`}
            />
            {validationErrors.email && (
              <p className="text-xs text-destructive">{validationErrors.email}</p>
            )}
          </div>
        </DetailGrid>
      </DetailSection>
    </div>
  )

  return (
    <PageShell
      title="Landlords"
      topBar={
        <>
          {/* TODO: replace with shared SearchInput component */}
          <input
            type="text"
            placeholder="Search landlords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 px-3 rounded-lg border border-border bg-background text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </>
      }
      actions={
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fetchLandlords()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <InteractiveHoverButton text="Add Landlord" onClick={handleAddClick} className="w-36 text-sm h-10" />
        </>
      }
    >

      {/* Data Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={filteredLandlords}
          columns={columns}
          hideToolbar
          onRowClick={handleRowClick}
          onViewClick={handleRowClick}
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
                <div className="space-y-2">
                  {selectedLandlord.phone && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-mono text-sm">{formatPhoneDisplay(selectedLandlord.phone)}</p>
                      </div>
                    </div>
                  )}
                  {selectedLandlord.email && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="text-sm">{selectedLandlord.email}</p>
                      </div>
                    </div>
                  )}
                  {!selectedLandlord.phone && !selectedLandlord.email && (
                    <p className="text-xs text-muted-foreground">No contact info</p>
                  )}
                </div>
              </DetailSection>

              <DetailDivider />

              {/* Properties */}
              <DetailSection title={`Properties (${selectedLandlord.property_count})`}>
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
