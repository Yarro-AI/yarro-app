'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateTenant, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { StatusBadge } from '@/components/status-badge'
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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import { TENANT_ROLES } from '@/lib/constants'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Users,
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

interface TenantDetail {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role_tag: string | null
  verified_by: string | null
  property_id: string | null
  created_at: string
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

const toEditable = (t: TenantDetail): TenantEditable => ({
  id: t.id,
  full_name: t.full_name || '',
  phone: t.phone || '',
  email: t.email,
  role_tag: t.role_tag || 'tenant',
  property_id: t.property_id,
})

const ROLE_OPTIONS = TENANT_ROLES.map((r) => ({
  value: r,
  label: r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
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

export default function TenantDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tenantId = params.id as string
  const { propertyManager } = usePM()
  const supabase = createClient()

  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [property, setProperty] = useState<PropertyOption | null>(null)
  const [allProperties, setAllProperties] = useState<PropertyOption[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  // --- Data fetching ---

  const fetchTenant = useCallback(async () => {
    if (!tenantId) return

    const { data, error } = await supabase
      .from('c1_tenants')
      .select('*')
      .eq('id', tenantId)
      .single()

    if (error || !data) {
      toast.error('Tenant not found')
      router.push('/tenants')
      return
    }
    setTenant(data as TenantDetail)
  }, [tenantId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!tenantId || !propertyManager) return

    const [ticketsRes, propertiesRes] = await Promise.all([
      supabase
        .from('c1_tickets')
        .select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged')
        .eq('tenant_id', tenantId)
        .order('date_logged', { ascending: false })
        .limit(50),
      supabase
        .from('c1_properties')
        .select('id, address')
        .eq('property_manager_id', propertyManager.id)
        .order('address'),
    ])

    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
    if (propertiesRes.data) setAllProperties(propertiesRes.data as PropertyOption[])
  }, [tenantId, propertyManager, supabase])

  const fetchProperty = useCallback(async () => {
    if (!tenant?.property_id) {
      setProperty(null)
      return
    }

    const { data } = await supabase
      .from('c1_properties')
      .select('id, address')
      .eq('id', tenant.property_id)
      .single()

    if (data) setProperty(data as PropertyOption)
    else setProperty(null)
  }, [tenant?.property_id, supabase])

  useEffect(() => {
    if (!propertyManager || !tenantId) return
    setLoading(true)
    Promise.all([fetchTenant(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, tenantId])

  useEffect(() => {
    fetchProperty()
  }, [tenant?.property_id])

  // --- Edit mode ---

  const handleSave = useCallback(async (data: TenantEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
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
    await fetchTenant()
  }, [supabase, fetchTenant])

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
    initialData: tenant ? toEditable(tenant) : null,
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  useEffect(() => {
    if (tenant) resetData(toEditable(tenant))
  }, [tenant, resetData])

  // --- Delete ---

  const handleDelete = async () => {
    if (!tenant) return

    const { count: ticketCount } = await supabase
      .from('c1_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .neq('status', 'closed')
      .neq('archived', true)

    if (ticketCount && ticketCount > 0) {
      throw new Error(`Cannot delete tenant with ${ticketCount} open ticket(s). Close or reassign tickets first.`)
    }

    const { error } = await supabase
      .from('c1_tenants')
      .delete()
      .eq('id', tenant.id)

    if (error) throw error
    toast.success('Tenant deleted')
    router.push('/tenants')
  }

  // --- Ticket counts ---

  const openTickets = tickets.filter((t) => t.status !== 'closed')
  const closedTickets = tickets.filter((t) => t.status === 'closed')

  // --- Loading / Not found ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Tenant not found</p>
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
            <Button variant="ghost" size="icon" onClick={() => router.push('/tenants')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-xl font-semibold">{tenant.full_name || 'Unknown Tenant'}</h1>
                <Badge variant="outline" className="capitalize">
                  {(tenant.role_tag || 'tenant').replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {property && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {property.address}
                  </span>
                )}
                {tenant.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {formatPhoneDisplay(tenant.phone)}
                  </span>
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
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      value={editedData.full_name}
                      onChange={(e) => updateField('full_name', e.target.value)}
                      placeholder="John Smith"
                      className={validationErrors.full_name ? 'border-destructive' : ''}
                    />
                    {validationErrors.full_name && (
                      <p className="text-xs text-destructive">{validationErrors.full_name}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Phone</label>
                      <Input
                        type="tel"
                        value={editedData.phone}
                        onChange={(e) => updateField('phone', e.target.value)}
                        placeholder="07700 900123"
                        className={validationErrors.phone ? 'border-destructive' : ''}
                      />
                      {validationErrors.phone && (
                        <p className="text-xs text-destructive">{validationErrors.phone}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        type="email"
                        value={editedData.email || ''}
                        onChange={(e) => updateField('email', e.target.value || null)}
                        placeholder="tenant@email.com"
                        className={validationErrors.email ? 'border-destructive' : ''}
                      />
                      {validationErrors.email && (
                        <p className="text-xs text-destructive">{validationErrors.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Role</label>
                    <Select
                      value={editedData.role_tag}
                      onValueChange={(v) => updateField('role_tag', v)}
                    >
                      <SelectTrigger>
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
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Full Name</p>
                    <p className="text-sm font-medium mt-0.5">{tenant.full_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <p className="text-sm font-medium mt-0.5 capitalize">
                      {(tenant.role_tag || 'tenant').replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium mt-0.5">
                      {tenant.phone ? formatPhoneDisplay(tenant.phone) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-sm font-medium mt-0.5">{tenant.email || '-'}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Property Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Property
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing && editedData ? (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Select Property</label>
                  <Select
                    value={editedData.property_id || 'none'}
                    onValueChange={(v) => updateField('property_id', v === 'none' ? null : v)}
                  >
                    <SelectTrigger className={validationErrors.property_id ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Select property..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No property</SelectItem>
                      {allProperties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {validationErrors.property_id && (
                    <p className="text-xs text-destructive">{validationErrors.property_id}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Manage properties from the{' '}
                    <Link href="/properties" className="text-primary hover:underline">Properties page</Link>
                  </p>
                </div>
              ) : property ? (
                <Link
                  href={`/properties/${property.id}`}
                  className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-background border">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{property.address}</p>
                  </div>
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">No property assigned</p>
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
                <p className="text-sm text-muted-foreground">No tickets for this tenant</p>
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
        title="Delete Tenant"
        description="Are you sure you want to delete this tenant? This action cannot be undone. Any closed tickets will remain in history."
        itemName={tenant.full_name || undefined}
        onConfirm={handleDelete}
      />
    </div>
  )
}
