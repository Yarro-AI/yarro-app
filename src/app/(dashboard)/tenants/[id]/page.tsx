'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateTenant, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { ProfilePageHeader, ProfileCard, KeyValueRow, TicketCard } from '@/components/profile'
import type { TicketRow } from '@/components/profile'
import { useOnTicketUpdated } from '@/components/ticket-drawer-provider'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { SendBlastDialog } from '@/components/onboarding/send-blast-dialog'
import { Button } from '@/components/ui/button'
import { TENANT_ROLES } from '@/lib/constants'
import Link from 'next/link'
import { Loader2, Send, CheckCircle } from 'lucide-react'

// --- Types ---

interface TenantDetail {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role_tag: string | null
  verified_by: string | null
  verification_sent_at: string | null
  verified_at: string | null
  property_id: string | null
  room_id: string | null
  contact_method: string
  created_at: string
}

interface TenantEditable {
  id: string
  full_name: string
  phone: string
  email: string | null
  role_tag: string
  property_id: string | null
  contact_method: string
}

interface PropertyOption { id: string; address: string }

// --- Helpers ---

const toEditable = (t: TenantDetail): TenantEditable => ({
  id: t.id, full_name: t.full_name || '', phone: t.phone || '', email: t.email, role_tag: t.role_tag || 'tenant', property_id: t.property_id, contact_method: t.contact_method || 'whatsapp',
})

const ROLE_OPTIONS = TENANT_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }))

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
  const [blastDialogOpen, setBlastDialogOpen] = useState(false)
  const [room, setRoom] = useState<{ id: string; room_number: string; room_name: string | null; monthly_rent: number | null; tenancy_start_date: string | null; tenancy_end_date: string | null; tenancy_status: string | null } | null>(null)

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

  useOnTicketUpdated(fetchRelated)

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

  useEffect(() => {
    if (!tenant?.room_id) { setRoom(null); return }
    supabase.from('c1_rooms').select('id, room_number, room_name, monthly_rent, tenancy_start_date, tenancy_end_date, tenancy_status').eq('id', tenant.room_id).single()
      .then(({ data }) => { if (data) setRoom(data); else setRoom(null) })
  }, [tenant?.room_id, supabase])

  const handleSave = useCallback(async (data: TenantEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateTenant(data)
    if (hasErrors(errors)) { setValidationErrors(errors); throw new Error('Please fix the validation errors') }
    setValidationErrors({})
    const { data: current } = await supabase.from('c1_tenants').select('_audit_log').eq('id', data.id).single()
    const newLog = [...(current?._audit_log as unknown[] || []), auditEntry]
    const normalized = normalizeRecord('tenants', { full_name: data.full_name, phone: data.phone, email: data.email })
    const { error } = await supabase.from('c1_tenants').update({ ...normalized, role_tag: data.role_tag, property_id: data.property_id, contact_method: data.contact_method, _audit_log: newLog }).eq('id', data.id)
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

  // Build hero data
  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }
  const subtitleParts: string[] = []
  if (room) subtitleParts.push(`Room ${room.room_number}${room.room_name ? ` \u2014 ${room.room_name}` : ''}`)
  if (property) subtitleParts.push(property.address)

  // SSOT: tenant is active if they have a room_id (assigned to a room)
  const isActiveTenant = !!tenant?.room_id
  const badges: { label: string; variant: 'success' | 'warning' | 'muted' }[] = [
    isActiveTenant
      ? { label: 'Active tenant', variant: 'success' as const }
      : { label: 'Former tenant', variant: 'muted' as const },
  ]
  if (!tenant?.verified_by) badges.push({ label: 'Identity unverified', variant: 'warning' as const })

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!tenant) return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Tenant not found</p></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProfilePageHeader
        backHref="/tenants"
        title={tenant.full_name || 'Unknown Tenant'}
        avatarInitials={getInitials(tenant.full_name)}
        subtitle={subtitleParts.join(' \u00b7 ') || undefined}
        badges={badges}
        isEditing={isEditing}
        isSaving={isSaving}
        editError={editError}
        onEdit={startEditing}
        onSave={saveChanges}
        onCancel={cancelEditing}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      {/* Onboarding / verification banner */}
      {!isEditing && (
        <>
          {tenant.verification_sent_at && !tenant.verified_at && (
            <div className="mx-8 mb-4 flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
                <p className="text-[13px] text-muted-foreground">
                  Onboarding message sent {new Date(tenant.verification_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} — awaiting verification.
                </p>
              </div>
            </div>
          )}
          {!tenant.verification_sent_at && tenant.phone && (
            <div className="mx-8 mb-4 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
              <p className="text-[13px] text-warning">
                Onboarding message not sent yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBlastDialogOpen(true)}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Send Onboarding Message
              </Button>
            </div>
          )}
          {tenant.verified_at && (
            <div className="mx-8 mb-4 flex items-center justify-between rounded-xl border border-success/30 bg-success/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <p className="text-[13px] text-success">
                  Verified on {new Date(tenant.verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-6">
        {/* Two-column card grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Contact details */}
          <ProfileCard title="Contact details">
            {isEditing && editedData ? (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Full Name</label>
                  <Input value={editedData.full_name} onChange={(e) => updateField('full_name', e.target.value)} placeholder="John Smith" className={validationErrors.full_name ? 'border-destructive' : ''} />
                  {validationErrors.full_name && <p className="text-xs text-destructive mt-1">{validationErrors.full_name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Phone</label>
                    <Input type="tel" value={editedData.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="07700 900123" className={validationErrors.phone ? 'border-destructive' : ''} />
                    {validationErrors.phone && <p className="text-xs text-destructive mt-1">{validationErrors.phone}</p>}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                    <Input type="email" value={editedData.email || ''} onChange={(e) => updateField('email', e.target.value || null)} placeholder="tenant@email.com" className={validationErrors.email ? 'border-destructive' : ''} />
                    {validationErrors.email && <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Preferred Contact</label>
                  <div className="flex rounded-lg border border-input overflow-hidden w-fit">
                    <button type="button" onClick={() => updateField('contact_method', 'whatsapp')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${editedData.contact_method === 'whatsapp' ? 'bg-success text-success-foreground' : 'bg-background hover:bg-muted'}`}>WhatsApp</button>
                    <button type="button" onClick={() => updateField('contact_method', 'email')} className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-input ${editedData.contact_method === 'email' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>Email</button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Role</label>
                  <Select value={editedData.role_tag} onValueChange={(v) => updateField('role_tag', v)}>
                    <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <>
                <KeyValueRow label="Phone">
                  {tenant.phone ? formatPhoneDisplay(tenant.phone) : <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Email">
                  {tenant.email || <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Preferred Contact">
                  {tenant.contact_method === 'email' ? 'Email' : 'WhatsApp'}
                </KeyValueRow>
                <KeyValueRow label="Role">
                  <span className="capitalize">{(tenant.role_tag || 'tenant').replace(/_/g, ' ')}</span>
                </KeyValueRow>
                <KeyValueRow label="Verified by">
                  {tenant.verified_by ? (
                    <span className="capitalize">{tenant.verified_by}</span>
                  ) : (
                    <span className="text-muted-foreground/50 font-normal">Unverified</span>
                  )}
                </KeyValueRow>
              </>
            )}
          </ProfileCard>

          {/* Right: Tenancy */}
          <ProfileCard title="Tenancy">
            <KeyValueRow label="Property">
              {property ? (
                <Link href={`/properties/${property.id}`} className="text-primary hover:underline">
                  {property.address}
                </Link>
              ) : (
                <span className="text-muted-foreground/50 font-normal italic">Not set</span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Room">
              {room ? (
                <span>{room.room_number}{room.room_name ? ` \u2014 ${room.room_name}` : ''}</span>
              ) : (
                <span className="text-muted-foreground/50 font-normal italic">Not assigned</span>
              )}
            </KeyValueRow>
            {isEditing && editedData && (
              <div className="pt-3 border-t border-border/50 mt-1">
                <label className="text-sm text-muted-foreground mb-1.5 block">Property</label>
                <Select value={editedData.property_id || 'none'} onValueChange={(v) => updateField('property_id', v === 'none' ? null : v)}>
                  <SelectTrigger className={validationErrors.property_id ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No property</SelectItem>
                    {allProperties.map((p) => <SelectItem key={p.id} value={p.id}>{p.address}</SelectItem>)}
                  </SelectContent>
                </Select>
                {validationErrors.property_id && <p className="text-xs text-destructive mt-1">{validationErrors.property_id}</p>}
              </div>
            )}
            <KeyValueRow label="Start date">
              {room?.tenancy_start_date ? (
                <span>{new Date(room.tenancy_start_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              ) : (
                <span className="text-muted-foreground/50 font-normal italic">Not set</span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Rent">
              {room?.monthly_rent ? (
                <span>&pound;{room.monthly_rent.toLocaleString('en-GB')}/mo</span>
              ) : (
                <span className="text-muted-foreground/50 font-normal italic">Not set</span>
              )}
            </KeyValueRow>
            <KeyValueRow label="Lease end">
              {room?.tenancy_end_date ? (
                <span>{new Date(room.tenancy_end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              ) : (
                <span className="text-muted-foreground/50 font-normal italic">Not set</span>
              )}
            </KeyValueRow>
          </ProfileCard>
        </div>

        {/* Reported tickets — full width */}
        <div className="mt-4">
          <TicketCard tickets={tickets} />
        </div>
      </div>

      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Tenant" description="Are you sure you want to delete this tenant? This action cannot be undone." itemName={tenant.full_name || undefined} onConfirm={handleDelete} />

      <SendBlastDialog
        open={blastDialogOpen}
        onOpenChange={setBlastDialogOpen}
        entityType="tenant"
        targets={(tenant.phone || (tenant.contact_method === 'email' && tenant.email)) ? [{
          id: tenant.id,
          name: tenant.full_name,
          phone: tenant.phone,
          email: tenant.email,
          contact_method: tenant.contact_method || 'whatsapp',
          verification_sent_at: tenant.verification_sent_at,
          verified_at: tenant.verified_at,
        }] : []}
        onComplete={fetchTenant}
      />
    </div>
  )
}
