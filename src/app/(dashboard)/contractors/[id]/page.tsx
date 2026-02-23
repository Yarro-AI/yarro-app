'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateContractor, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import Link from 'next/link'
import {
  ArrowLeft,
  Wrench,
  Phone,
  Mail,
  Building2,
  Ticket,
  Pencil,
  Save,
  X,
  Check,
  Trash2,
  Loader2,
  ChevronDown,
} from 'lucide-react'

// --- Types ---

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

interface PropertyOption {
  id: string
  address: string
}

interface TicketRow {
  id: string
  issue_title: string | null
  issue_description: string | null
  category: string | null
  priority: string | null
  status: string
  next_action_reason: string | null
  date_logged: string
}

// --- Helpers ---

const toEditable = (c: Contractor): ContractorEditable => ({
  id: c.id,
  contractor_name: c.contractor_name,
  categories: c.categories || (c.category ? [c.category] : []),
  contractor_phone: c.contractor_phone || '',
  contractor_email: c.contractor_email,
  active: c.active,
  property_ids: c.property_ids || [],
})

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

const displayStageMap: Record<string, string> = {
  handoff_review: 'Handoff',
  manager_approval: 'Awaiting Manager',
  no_contractors: 'No Contractors',
  landlord_declined: 'Landlord Declined',
  landlord_no_response: 'Landlord No Response',
  job_not_completed: 'Not Completed',
  awaiting_contractor: 'Awaiting Contractor',
  awaiting_landlord: 'Awaiting Landlord',
  awaiting_booking: 'Awaiting Booking',
  scheduled: 'Scheduled',
  completed: 'Completed',
  dismissed: 'Dismissed',
}

const getDisplayStage = (reason: string | null, status: string) => {
  if (status === 'closed') return 'Completed'
  if (reason && displayStageMap[reason]) return displayStageMap[reason]
  return 'Created'
}

// --- Component ---

export default function ContractorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contractorId = params.id as string
  const { propertyManager } = usePM()
  const supabase = createClient()

  const [contractor, setContractor] = useState<Contractor | null>(null)
  const [allProperties, setAllProperties] = useState<PropertyOption[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  // --- Data fetching ---

  const fetchContractor = useCallback(async () => {
    if (!contractorId) return

    const { data, error } = await supabase
      .from('c1_contractors')
      .select('*')
      .eq('id', contractorId)
      .single()

    if (error || !data) {
      toast.error('Contractor not found')
      router.push('/contractors')
      return
    }
    setContractor(data as Contractor)
  }, [contractorId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!contractorId || !propertyManager) return

    const [propertiesRes, ticketsRes] = await Promise.all([
      supabase
        .from('c1_properties')
        .select('id, address')
        .eq('property_manager_id', propertyManager.id)
        .order('address'),
      supabase
        .from('c1_tickets')
        .select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged')
        .eq('contractor_id', contractorId)
        .order('date_logged', { ascending: false })
        .limit(50),
    ])

    if (propertiesRes.data) setAllProperties(propertiesRes.data as PropertyOption[])
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
  }, [contractorId, propertyManager, supabase])

  useEffect(() => {
    if (!propertyManager || !contractorId) return
    setLoading(true)
    Promise.all([fetchContractor(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, contractorId])

  // --- Edit mode ---

  const handleSave = useCallback(async (data: ContractorEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
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
        category: data.categories[0] || '',
        categories: data.categories,
        active: data.active,
        property_ids: data.property_ids,
        _audit_log: newLog,
      })
      .eq('id', data.id)

    if (error) throw error
    toast.success('Contractor updated')
    await fetchContractor()
  }, [supabase, fetchContractor])

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
    initialData: contractor ? toEditable(contractor) : null,
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  useEffect(() => {
    if (contractor) resetData(toEditable(contractor))
  }, [contractor, resetData])

  // --- Delete (soft delete) ---

  const handleDelete = async () => {
    if (!contractor) return

    const { count } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('contractor_id', contractor.id)
      .neq('status', 'closed')
      .neq('archived', true)

    if (count && count > 0) {
      throw new Error(`Cannot deactivate contractor with ${count} open ticket(s). Close or reassign tickets first.`)
    }

    const { error } = await supabase
      .from('c1_contractors')
      .update({ active: false })
      .eq('id', contractor.id)

    if (error) throw error
    toast.success('Contractor deactivated')
    router.push('/contractors')
  }

  // --- Ticket counts ---

  const openTickets = tickets.filter((t) => t.status !== 'closed')
  const closedTickets = tickets.filter((t) => t.status === 'closed')

  // --- Assigned properties (resolved from IDs) ---

  const assignedProperties = (contractor?.property_ids || [])
    .map((id) => allProperties.find((p) => p.id === id))
    .filter(Boolean) as PropertyOption[]

  // --- Category toggle helper ---

  const handleCategoryToggle = (category: string) => {
    if (!editedData) return
    const current = editedData.categories
    if (current.includes(category)) {
      updateField('categories', current.filter((c) => c !== category))
    } else {
      updateField('categories', [...current, category])
    }
  }

  // --- Property toggle helper ---

  const handlePropertyToggle = (propertyId: string) => {
    if (!editedData) return
    const current = editedData.property_ids
    if (current.includes(propertyId)) {
      updateField('property_ids', current.filter((id) => id !== propertyId))
    } else {
      updateField('property_ids', [...current, propertyId])
    }
  }

  // --- Loading / Not found ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!contractor) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Contractor not found</p>
      </div>
    )
  }

  // --- Render ---

  const categories = contractor.categories?.length ? contractor.categories : (contractor.category ? [contractor.category] : [])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/contractors')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold">{contractor.contractor_name}</h1>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  {categories.map((cat) => (
                    <Badge key={cat} variant="outline" className="text-xs">
                      {cat}
                    </Badge>
                  ))}
                </div>
                {contractor.contractor_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {formatPhoneDisplay(contractor.contractor_phone)}
                  </span>
                )}
                <Badge variant={contractor.active ? 'default' : 'secondary'} className="text-xs">
                  {contractor.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={saveChanges} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 className="h-4 w-4 mr-1" /> Deactivate
                </Button>
              </>
            )}
          </div>
        </div>

        {editError && (
          <div className="mt-3 p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
            {editError}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">

          {/* Contact Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={editedData.contractor_name}
                      onChange={(e) => updateField('contractor_name', e.target.value)}
                      placeholder="ABC Plumbing"
                      className={validationErrors.contractor_name ? 'border-destructive' : ''}
                    />
                    {validationErrors.contractor_name && (
                      <p className="text-xs text-destructive">{validationErrors.contractor_name}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Phone</label>
                      <Input
                        type="tel"
                        value={editedData.contractor_phone}
                        onChange={(e) => updateField('contractor_phone', e.target.value)}
                        placeholder="07700 900123"
                        className={validationErrors.contractor_phone ? 'border-destructive' : ''}
                      />
                      {validationErrors.contractor_phone && (
                        <p className="text-xs text-destructive">{validationErrors.contractor_phone}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        type="email"
                        value={editedData.contractor_email || ''}
                        onChange={(e) => updateField('contractor_email', e.target.value || null)}
                        placeholder="contractor@email.com"
                        className={validationErrors.contractor_email ? 'border-destructive' : ''}
                      />
                      {validationErrors.contractor_email && (
                        <p className="text-xs text-destructive">{validationErrors.contractor_email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium">Active</label>
                    <Switch
                      checked={editedData.active}
                      onCheckedChange={(checked) => updateField('active', checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {editedData.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="text-sm font-medium mt-0.5">{contractor.contractor_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="text-sm font-medium mt-0.5">
                      <Badge variant={contractor.active ? 'default' : 'secondary'}>
                        {contractor.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium mt-0.5 flex items-center gap-1">
                      {contractor.contractor_phone ? (
                        <>
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatPhoneDisplay(contractor.contractor_phone)}
                        </>
                      ) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-sm font-medium mt-0.5 flex items-center gap-1">
                      {contractor.contractor_email ? (
                        <>
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          {contractor.contractor_email}
                        </>
                      ) : '-'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Categories Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-3">
                  {editedData.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {editedData.categories.map((cat) => (
                        <Badge key={cat} variant="secondary" className="gap-1 pr-1">
                          {cat}
                          <button
                            type="button"
                            onClick={() => handleCategoryToggle(cat)}
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
                          {editedData.categories.length === 0 ? 'Select categories...' : 'Add more...'}
                        </span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1.5 max-h-64 overflow-y-auto" align="start">
                      {CATEGORY_OPTIONS.map((opt) => {
                        const isSelected = editedData.categories.includes(opt.value)
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleCategoryToggle(opt.value)}
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
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {categories.length > 0 ? categories.map((cat) => (
                    <Badge key={cat} variant="outline">
                      <Wrench className="h-3 w-3 mr-1" />
                      {cat}
                    </Badge>
                  )) : (
                    <p className="text-sm text-muted-foreground">No categories assigned</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Properties Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Properties
                <Badge variant="outline" className="ml-1">{assignedProperties.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-3">
                  {editedData.property_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {editedData.property_ids.map((id) => {
                        const prop = allProperties.find((p) => p.id === id)
                        return prop ? (
                          <Badge key={id} variant="secondary" className="gap-1 pr-1">
                            <span className="truncate max-w-[200px]">{prop.address}</span>
                            <button
                              type="button"
                              onClick={() => handlePropertyToggle(id)}
                              className="hover:bg-muted rounded p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ) : null
                      })}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-between w-full h-9 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left"
                      >
                        <span className="text-muted-foreground">
                          {editedData.property_ids.length === 0 ? 'Select properties...' : 'Add more...'}
                        </span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-1.5 max-h-64 overflow-y-auto" align="start">
                      {allProperties.map((prop) => {
                        const isSelected = editedData.property_ids.includes(prop.id)
                        return (
                          <button
                            key={prop.id}
                            type="button"
                            onClick={() => handlePropertyToggle(prop.id)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              isSelected ? 'bg-primary border-primary' : 'border-input'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className="truncate">{prop.address}</span>
                          </button>
                        )
                      })}
                      {allProperties.length === 0 && (
                        <p className="text-xs text-muted-foreground p-2">No properties available</p>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              ) : assignedProperties.length === 0 ? (
                <p className="text-sm text-muted-foreground">No properties assigned</p>
              ) : (
                <div className="space-y-2">
                  {assignedProperties.map((prop) => (
                    <Link
                      key={prop.id}
                      href={`/properties/${prop.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <p className="text-sm font-medium truncate">{prop.address}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tickets Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Ticket className="h-4 w-4" /> Tickets
                {openTickets.length > 0 && (
                  <Badge className="bg-primary text-xs ml-1">{openTickets.length} open</Badge>
                )}
                {closedTickets.length > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">{closedTickets.length} closed</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tickets for this contractor</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {t.issue_title || t.issue_description || 'Maintenance request'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{new Date(t.date_logged).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          {t.category && <span>{t.category}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {t.priority && <StatusBadge status={t.priority} />}
                        <StatusBadge status={getDisplayStage(t.next_action_reason, t.status)} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticketId={selectedTicketId}
        open={!!selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />

      {/* Delete Dialog */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Deactivate Contractor"
        description="Are you sure you want to deactivate this contractor? They will no longer appear in selection lists but historical data will be preserved."
        itemName={contractor.contractor_name}
        onConfirm={handleDelete}
      />
    </div>
  )
}
