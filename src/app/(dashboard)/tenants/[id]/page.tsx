'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateTenant, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { PriorityDot } from '@/components/priority-dot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import { TENANT_ROLES } from '@/lib/constants'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Trash2,
  Loader2,
  Phone as PhoneIcon,
  Mail,
  Shield,
  BadgeCheck,
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

interface PropertyOption { id: string; address: string }

interface TicketRow {
  id: string
  issue_title: string | null
  issue_description: string | null
  category: string | null
  priority: string | null
  status: string
  next_action_reason: string | null
  date_logged: string
  archived: boolean | null
}

// --- Helpers ---

const toEditable = (t: TenantDetail): TenantEditable => ({
  id: t.id, full_name: t.full_name || '', phone: t.phone || '', email: t.email, role_tag: t.role_tag || 'tenant', property_id: t.property_id,
})

const ROLE_OPTIONS = TENANT_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }))

const displayStageMap: Record<string, string> = {
  handoff_review: 'Handoff', manager_approval: 'Awaiting Manager', no_contractors: 'No Contractors',
  landlord_declined: 'Landlord Declined', landlord_no_response: 'Landlord No Response', job_not_completed: 'Not Completed',
  awaiting_contractor: 'Awaiting Contractor', awaiting_landlord: 'Awaiting Landlord', awaiting_booking: 'Awaiting Booking',
  scheduled: 'Scheduled', completed: 'Completed', dismissed: 'Dismissed',
}
const getDisplayStage = (reason: string | null, status: string, archived?: boolean | null) => {
  if (archived) return 'Archived'
  if (status === 'closed') return 'Completed'
  if (reason && displayStageMap[reason]) return displayStageMap[reason]
  return 'Open'
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

  const fetchTenant = useCallback(async () => {
    if (!tenantId) return
    const { data, error } = await supabase.from('c1_tenants').select('*').eq('id', tenantId).single()
    if (error || !data) { toast.error('Tenant not found'); router.push('/tenants'); return }
    setTenant(data as TenantDetail)
  }, [tenantId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!tenantId || !propertyManager) return
    const [ticketsRes, propertiesRes] = await Promise.all([
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, archived').eq('tenant_id', tenantId).order('date_logged', { ascending: false }).limit(50),
      supabase.from('c1_properties').select('id, address').eq('property_manager_id', propertyManager.id).order('address'),
    ])
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
    if (propertiesRes.data) setAllProperties(propertiesRes.data as PropertyOption[])
  }, [tenantId, propertyManager, supabase])

  const fetchProperty = useCallback(async () => {
    if (!tenant?.property_id) { setProperty(null); return }
    const { data } = await supabase.from('c1_properties').select('id, address').eq('id', tenant.property_id).single()
    if (data) setProperty(data as PropertyOption); else setProperty(null)
  }, [tenant?.property_id, supabase])

  useEffect(() => {
    if (!propertyManager || !tenantId) return
    setLoading(true)
    Promise.all([fetchTenant(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, tenantId])

  useEffect(() => { fetchProperty() }, [tenant?.property_id])

  const handleSave = useCallback(async (data: TenantEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateTenant(data)
    if (hasErrors(errors)) { setValidationErrors(errors); throw new Error('Please fix the validation errors') }
    setValidationErrors({})
    const { data: current } = await supabase.from('c1_tenants').select('_audit_log').eq('id', data.id).single()
    const newLog = [...(current?._audit_log as unknown[] || []), auditEntry]
    const normalized = normalizeRecord('tenants', { full_name: data.full_name, phone: data.phone, email: data.email })
    const { error } = await supabase.from('c1_tenants').update({ ...normalized, role_tag: data.role_tag, property_id: data.property_id, _audit_log: newLog }).eq('id', data.id)
    if (error) throw error
    toast.success('Tenant updated')
    await fetchTenant()
  }, [supabase, fetchTenant])

  const { isEditing, editedData, isSaving, error: editError, startEditing, cancelEditing, updateField, saveChanges, resetData } = useEditMode<TenantEditable>({
    initialData: tenant ? toEditable(tenant) : null, onSave: handleSave, pmId: propertyManager?.id || '',
  })
  useEffect(() => { if (tenant) resetData(toEditable(tenant)) }, [tenant, resetData])

  const handleDelete = async () => {
    if (!tenant) return
    const { count } = await supabase.from('c1_tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).neq('status', 'closed').neq('archived', true)
    if (count && count > 0) throw new Error(`Cannot delete tenant with ${count} open ticket(s). Close or reassign tickets first.`)
    const { error } = await supabase.from('c1_tenants').delete().eq('id', tenant.id)
    if (error) throw error
    toast.success('Tenant deleted'); router.push('/tenants')
  }

  const openTickets = tickets.filter((t) => t.status !== 'closed' && !t.archived)
  const closedTickets = tickets.filter((t) => t.status === 'closed')

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!tenant) return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Tenant not found</p></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4">
        <button onClick={() => router.push('/tenants')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight truncate">{tenant.full_name || 'Unknown Tenant'}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={saveChanges} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={startEditing}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="h-4 w-4 mr-1" /> Delete</Button>
            </>
          )}
        </div>
      </div>
      {editError && <div className="px-8 py-2 bg-destructive/10 text-destructive text-sm">{editError}</div>}

      {/* Two-column content */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: Details */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {isEditing && editedData ? (
            <div className="space-y-6">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Full Name</label>
                <Input value={editedData.full_name} onChange={(e) => updateField('full_name', e.target.value)} placeholder="John Smith" className={validationErrors.full_name ? 'border-destructive' : ''} />
                {validationErrors.full_name && <p className="text-xs text-destructive mt-1">{validationErrors.full_name}</p>}
              </div>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
                  <Input type="tel" value={editedData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="07700 900123" className={validationErrors.phone ? 'border-destructive' : ''} />
                  {validationErrors.phone && <p className="text-xs text-destructive mt-1">{validationErrors.phone}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                  <Input type="email" value={editedData.email || ''} onChange={(e) => updateField('email', e.target.value || null)} placeholder="tenant@email.com" className={validationErrors.email ? 'border-destructive' : ''} />
                  {validationErrors.email && <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Role</label>
                  <Select value={editedData.role_tag} onValueChange={(v) => updateField('role_tag', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Property</label>
                <Select value={editedData.property_id || 'none'} onValueChange={(v) => updateField('property_id', v === 'none' ? null : v)}>
                  <SelectTrigger className={`max-w-md ${validationErrors.property_id ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No property</SelectItem>
                    {allProperties.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                  </SelectContent>
                </Select>
                {validationErrors.property_id && <p className="text-xs text-destructive mt-1">{validationErrors.property_id}</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[3fr_2fr] gap-x-8 gap-y-5">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <PhoneIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="text-[15px] font-medium mt-0.5">{tenant.phone ? formatPhoneDisplay(tenant.phone) : <span className="text-muted-foreground/50 font-normal">None</span>}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-[15px] font-medium mt-0.5">{tenant.email || <span className="text-muted-foreground/50 font-normal">None</span>}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Role</p>
                    <p className="text-[15px] font-medium capitalize mt-0.5">{(tenant.role_tag || 'tenant').replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Verified By</p>
                    <p className="text-[15px] font-medium capitalize mt-0.5">{tenant.verified_by || <span className="text-muted-foreground/50 font-normal">Unverified</span>}</p>
                  </div>
                </div>
              </div>

              {/* Property */}
              <div className="mt-8">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Property</h3>
                {property ? (
                  <Link href={`/properties/${property.id}`} className="flex items-center py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors">
                    <span className="text-[15px] hover:underline">{property.address}</span>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No property assigned</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right: Tickets */}
        <div className="w-[540px] flex-shrink-0 border-l flex flex-col">
          <div className="px-6 py-5 flex-shrink-0">
            <h3 className="text-sm font-semibold">Tickets</h3>
            {(openTickets.length > 0 || closedTickets.length > 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                {[openTickets.length > 0 && `${openTickets.length} open`, closedTickets.length > 0 && `${closedTickets.length} closed`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets</p>
            ) : (
              <div className="divide-y divide-border/50">
                {tickets.map((t) => (
                  <button key={t.id} onClick={() => setSelectedTicketId(t.id)} className={`w-full text-left py-3 hover:bg-muted/30 -mx-3 px-3 transition-colors first:pt-0 ${t.archived ? 'opacity-40' : ''}`}>
                    <div className="flex items-start gap-2">
                      {t.priority && <PriorityDot priority={t.priority} className="mt-1.5 flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.issue_title || t.issue_description || 'Maintenance request'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {getDisplayStage(t.next_action_reason, t.status, t.archived)}
                          {' · '}
                          {new Date(t.date_logged).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {t.category && <> · {t.category}</>}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <TicketDetailModal ticketId={selectedTicketId} open={!!selectedTicketId} onClose={() => setSelectedTicketId(null)} />
      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Tenant" description="Are you sure you want to delete this tenant? This action cannot be undone." itemName={tenant.full_name || undefined} onConfirm={handleDelete} />
    </div>
  )
}
