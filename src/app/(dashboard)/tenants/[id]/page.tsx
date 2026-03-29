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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TENANT_ROLES } from '@/lib/constants'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

// --- Types ---

interface TenantDetail {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  role_tag: string | null
  verified_by: string | null
  property_id: string | null
  room_id: string | null
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

// --- Helpers ---

const toEditable = (t: TenantDetail): TenantEditable => ({
  id: t.id, full_name: t.full_name || '', phone: t.phone || '', email: t.email, role_tag: t.role_tag || 'tenant', property_id: t.property_id,
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
  const [room, setRoom] = useState<{ id: string; room_number: string; room_name: string | null } | null>(null)

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

  useEffect(() => {
    if (!tenant?.room_id) { setRoom(null); return }
    supabase.from('c1_rooms').select('id, room_number, room_name').eq('id', tenant.room_id).single()
      .then(({ data }) => { if (data) setRoom(data); else setRoom(null) })
  }, [tenant?.room_id, supabase])

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

  // Build hero data
  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }
  const subtitleParts: string[] = []
  if (room) subtitleParts.push(`Room ${room.room_number}${room.room_name ? ` \u2014 ${room.room_name}` : ''}`)
  if (property) subtitleParts.push(property.address)

  const badges: { label: string; variant: 'success' | 'warning' | 'muted' }[] = [
    { label: 'Active tenant', variant: 'success' as const },
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

      {/* Verification banner */}
      {!tenant.verified_by && !isEditing && (
        <div className="mx-8 mb-4 flex items-center justify-between rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
          <p className="text-[13px] text-warning">
            Identity not verified. Send {tenant.full_name} a verification link to complete their profile.
          </p>
        </div>
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
                <span className="text-muted-foreground/50 font-normal italic">Not set</span>
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
              <span className="text-muted-foreground/50 font-normal italic">Not set</span>
            </KeyValueRow>
            <KeyValueRow label="Rent">
              <span className="text-muted-foreground/50 font-normal italic">Not set</span>
            </KeyValueRow>
            <KeyValueRow label="Lease end">
              <span className="text-muted-foreground/50 font-normal italic">Not set</span>
            </KeyValueRow>
          </ProfileCard>
        </div>

        {/* Reported tickets — full width */}
        <div className="mt-4">
          <TicketCard tickets={tickets} onTicketUpdated={() => fetchRelated()} />
        </div>
      </div>

      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Tenant" description="Are you sure you want to delete this tenant? This action cannot be undone." itemName={tenant.full_name || undefined} onConfirm={handleDelete} />
    </div>
  )
}
