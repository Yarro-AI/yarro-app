'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateProperty, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Contact,
  Users,
  Wrench,
  Ticket,
  Phone,
  Mail,
  Pencil,
  Save,
  X,
  Trash2,
  Loader2,
} from 'lucide-react'

// --- Types ---

interface PropertyDetail {
  id: string
  address: string
  landlord_id: string | null
  landlord_name: string | null
  landlord_phone: string | null
  landlord_email: string | null
  auto_approve_limit: number | null
  access_instructions: string | null
  emergency_access_contact: string | null
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

interface TenantRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  role_tag: string | null
}

interface ContractorRow {
  id: string
  contractor_name: string
  category: string | null
  categories: string[] | null
  contractor_phone: string | null
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
  scheduled_date: string | null
  archived: boolean | null
}

// --- Helpers ---

const toEditable = (p: PropertyDetail): PropertyEditable => ({
  id: p.id,
  address: p.address || '',
  landlord_id: p.landlord_id,
  auto_approve_limit: p.auto_approve_limit,
  access_instructions: p.access_instructions,
  emergency_access_contact: p.emergency_access_contact,
})

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return '-'
  return `£${amount.toFixed(0)}`
}

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

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.id as string
  const { propertyManager } = usePM()
  const supabase = createClient()

  const [property, setProperty] = useState<PropertyDetail | null>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [landlordOptions, setLandlordOptions] = useState<LandlordOption[]>([])
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  // --- Data fetching ---

  const fetchProperty = useCallback(async () => {
    if (!propertyId) return

    const { data, error } = await supabase
      .from('c1_properties')
      .select('id, address, landlord_id, landlord_name, landlord_phone, landlord_email, auto_approve_limit, access_instructions, emergency_access_contact')
      .eq('id', propertyId)
      .single()

    if (error || !data) {
      toast.error('Property not found')
      router.push('/properties')
      return
    }
    setProperty(data as PropertyDetail)
  }, [propertyId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!propertyId || !propertyManager) return

    const [tenantsRes, contractorsRes, ticketsRes, landlordsRes] = await Promise.all([
      supabase
        .from('c1_tenants')
        .select('id, full_name, phone, email, role_tag')
        .eq('property_id', propertyId)
        .order('full_name'),
      supabase
        .from('c1_contractors')
        .select('id, contractor_name, category, categories, contractor_phone, property_ids')
        .eq('property_manager_id', propertyManager.id)
        .eq('active', true),
      supabase
        .from('c1_tickets')
        .select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, scheduled_date, archived')
        .eq('property_id', propertyId)
        .order('date_logged', { ascending: false })
        .limit(50),
      supabase
        .from('c1_landlords')
        .select('id, full_name, phone, email')
        .eq('property_manager_id', propertyManager.id)
        .order('full_name'),
    ])

    if (tenantsRes.data) setTenants(tenantsRes.data as TenantRow[])

    // Filter contractors to only those assigned to this property
    if (contractorsRes.data) {
      const assigned = contractorsRes.data.filter((c: any) =>
        Array.isArray(c.property_ids) && c.property_ids.includes(propertyId)
      )
      setContractors(assigned as ContractorRow[])
    }

    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
    if (landlordsRes.data) setLandlordOptions(landlordsRes.data as LandlordOption[])
  }, [propertyId, propertyManager, supabase])

  useEffect(() => {
    if (!propertyManager || !propertyId) return
    setLoading(true)
    Promise.all([fetchProperty(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, propertyId])

  // --- Edit mode ---

  const handleSave = useCallback(async (data: PropertyEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateProperty(data)
    if (hasErrors(errors)) {
      setValidationErrors(errors)
      throw new Error('Please fix the validation errors')
    }
    setValidationErrors({})

    const { data: current } = await supabase
      .from('c1_properties')
      .select('_audit_log')
      .eq('id', data.id)
      .single()

    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]

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
    await fetchProperty()
  }, [supabase, landlordOptions, fetchProperty])

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
    initialData: property ? toEditable(property) : null,
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  useEffect(() => {
    if (property) resetData(toEditable(property))
  }, [property, resetData])

  // --- Delete ---

  const handleDelete = async () => {
    if (!property) return

    const { count: tenantCount } = await supabase
      .from('c1_tenants')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', property.id)

    if (tenantCount && tenantCount > 0) {
      throw new Error(`Cannot delete property with ${tenantCount} tenant(s). Remove or reassign tenants first.`)
    }

    const { count: ticketCount } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', property.id)
      .neq('status', 'closed')
      .neq('archived', true)

    if (ticketCount && ticketCount > 0) {
      throw new Error(`Cannot delete property with ${ticketCount} open ticket(s). Close tickets first.`)
    }

    const { error } = await supabase
      .from('c1_properties')
      .delete()
      .eq('id', property.id)

    if (error) throw error
    toast.success('Property deleted')
    router.push('/properties')
  }

  // --- Ticket counts ---

  const openTickets = tickets.filter((t) => t.status !== 'closed' && !t.archived)
  const completedTickets = tickets.filter((t) => t.status === 'closed' || t.next_action_reason === 'completed')

  // --- Loading / Not found ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Property not found</p>
      </div>
    )
  }

  // --- Render ---

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background px-8 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/properties')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold">{property.address}</h1>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {property.landlord_name && (
                  <span className="flex items-center gap-1">
                    <Contact className="h-3.5 w-3.5" />
                    {property.landlord_name}
                  </span>
                )}
                <span>{formatCurrency(property.auto_approve_limit)} auto-approve</span>
                {openTickets.length > 0 && (
                  <Badge className="bg-primary text-xs">{openTickets.length} open ticket{openTickets.length !== 1 ? 's' : ''}</Badge>
                )}
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
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="overflow-y-auto flex-shrink-0 max-h-[50%]">
          <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">

          {/* Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Property Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Address</label>
                    <Input
                      value={editedData.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      placeholder="123 Main Street, Manchester, M1 1AA"
                      className={validationErrors.address ? 'border-destructive' : ''}
                    />
                    {validationErrors.address && (
                      <p className="text-xs text-destructive">{validationErrors.address}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Auto-Approve Limit</label>
                      <Input
                        type="number"
                        value={editedData.auto_approve_limit ?? ''}
                        onChange={(e) => updateField('auto_approve_limit', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="500"
                        className={validationErrors.auto_approve_limit ? 'border-destructive' : ''}
                      />
                      {validationErrors.auto_approve_limit && (
                        <p className="text-xs text-destructive">{validationErrors.auto_approve_limit}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Emergency Contact</label>
                      <Input
                        value={editedData.emergency_access_contact || ''}
                        onChange={(e) => updateField('emergency_access_contact', e.target.value || null)}
                        placeholder="Name / Phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Access Instructions</label>
                    <Textarea
                      value={editedData.access_instructions || ''}
                      onChange={(e) => updateField('access_instructions', e.target.value || null)}
                      placeholder="Gate code, key safe number, entry instructions..."
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="text-sm font-medium mt-0.5">{property.address}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Auto-Approve Limit</p>
                    <p className="text-sm font-medium mt-0.5">{formatCurrency(property.auto_approve_limit)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Emergency Contact</p>
                    <p className="text-sm font-medium mt-0.5">{property.emergency_access_contact || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Access Instructions</p>
                    <p className="text-sm font-medium mt-0.5">{property.access_instructions || '-'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Landlord Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Contact className="h-4 w-4" /> Landlord
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Select Landlord</label>
                  <Select
                    value={editedData.landlord_id || 'none'}
                    onValueChange={(v) => updateField('landlord_id', v === 'none' ? null : v)}
                  >
                    <SelectTrigger>
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
              ) : property.landlord_id ? (
                <Link
                  href={`/landlords/${property.landlord_id}`}
                  className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-background border">
                    <Contact className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{property.landlord_name}</p>
                    <div className="flex items-center gap-4 mt-0.5 text-sm text-muted-foreground">
                      {property.landlord_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhoneDisplay(property.landlord_phone)}
                        </span>
                      )}
                      {property.landlord_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {property.landlord_email}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">No landlord assigned</p>
              )}
            </CardContent>
          </Card>

          {/* Tenants Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Tenants
                <Badge variant="outline" className="ml-1">{tenants.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenants assigned to this property</p>
              ) : (
                <div className="space-y-2">
                  {tenants.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tenants/${t.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{t.full_name}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {t.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {formatPhoneDisplay(t.phone)}
                            </span>
                          )}
                          {t.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {t.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">{t.role_tag || 'tenant'}</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contractors Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Contractors
                <Badge variant="outline" className="ml-1">{contractors.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contractors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contractors assigned to this property</p>
              ) : (
                <div className="space-y-2">
                  {contractors.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contractors/${c.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{c.contractor_name}</p>
                        {c.contractor_phone && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatPhoneDisplay(c.contractor_phone)}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {(c.categories || (c.category ? [c.category] : [])).map((cat) => (
                          <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          </div>
        </div>

        {/* Tickets Card — fills remaining screen */}
        <div className="flex-1 min-h-0 flex flex-col px-8 pb-6">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Ticket className="h-4 w-4" /> Tickets
                {openTickets.length > 0 && (
                  <Badge className="bg-primary text-xs ml-1">{openTickets.length} open</Badge>
                )}
                {completedTickets.length > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">{completedTickets.length} completed</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto">
              {tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tickets for this property</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left",
                        t.archived && "opacity-50"
                      )}
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
        title="Delete Property"
        description="Are you sure you want to delete this property? This action cannot be undone."
        itemName={property.address}
        onConfirm={handleDelete}
      />
    </div>
  )
}
