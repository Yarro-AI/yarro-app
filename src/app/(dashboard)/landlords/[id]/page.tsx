'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateLandlord, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { ProfilePageHeader, ProfileCard, KeyValueRow, TicketCard } from '@/components/profile'
import type { TicketRow } from '@/components/profile'
import { useOnTicketUpdated } from '@/components/ticket-drawer-provider'
import { Input } from '@/components/ui/input'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

// --- Types ---

interface Landlord { id: string; full_name: string; phone: string | null; email: string | null; created_at: string; contact_method: string }
interface LandlordEditable { id: string; full_name: string; phone: string | null; email: string | null; contact_method: string }
interface PropertyRow { id: string; address: string }

// --- Helpers ---

const toEditable = (l: Landlord): LandlordEditable => ({ id: l.id, full_name: l.full_name || '', phone: l.phone, email: l.email, contact_method: l.contact_method || 'whatsapp' })

// --- Component ---

export default function LandlordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const landlordId = params.id as string
  const { propertyManager } = usePM()
  const supabase = createClient()

  const [landlord, setLandlord] = useState<Landlord | null>(null)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [tenantCounts, setTenantCounts] = useState<Record<string, number>>({})
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [propertyAddressMap, setPropertyAddressMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const fetchLandlord = useCallback(async () => {
    if (!landlordId) return
    const { data, error } = await supabase.from('c1_landlords').select('*').eq('id', landlordId).single()
    if (error || !data) { toast.error('Landlord not found'); router.push('/landlords'); return }
    setLandlord(data as Landlord)
  }, [landlordId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!landlordId) return
    const { data: propertiesData } = await supabase.from('c1_properties').select('id, address').eq('landlord_id', landlordId).order('address')
    const props = (propertiesData || []) as PropertyRow[]
    setProperties(props)
    const addrMap: Record<string, string> = {}
    props.forEach((p) => { addrMap[p.id] = p.address })
    setPropertyAddressMap(addrMap)
    const propertyIds = props.map((p) => p.id)
    if (propertyIds.length === 0) { setTenantCounts({}); setTickets([]); return }
    const [tenantsRes, ticketsRes] = await Promise.all([
      supabase.from('c1_tenants').select('property_id').in('property_id', propertyIds),
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, property_id, archived').in('property_id', propertyIds).neq('archived', true).order('date_logged', { ascending: false }).limit(50),
    ])
    if (tenantsRes.data) {
      const counts: Record<string, number> = {}
      tenantsRes.data.forEach((t: { property_id: string }) => { counts[t.property_id] = (counts[t.property_id] || 0) + 1 })
      setTenantCounts(counts)
    }
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
  }, [landlordId, supabase])

  useOnTicketUpdated(fetchRelated)

  useEffect(() => {
    if (!propertyManager || !landlordId) return
    setLoading(true)
    Promise.all([fetchLandlord(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, landlordId])

  const handleSave = useCallback(async (data: LandlordEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateLandlord(data)
    if (hasErrors(errors)) { setValidationErrors(errors); throw new Error('Please fix the validation errors') }
    setValidationErrors({})
    const { data: current } = await supabase.from('c1_landlords').select('_audit_log').eq('id', data.id).single()
    const newLog = [...(current?._audit_log as unknown[] || []), auditEntry]
    const normalized = normalizeRecord('landlords', { full_name: data.full_name, phone: data.phone, email: data.email })
    const { error } = await supabase.from('c1_landlords').update({ ...normalized, contact_method: data.contact_method, _audit_log: newLog }).eq('id', data.id)
    if (error) throw error
    const { error: propError } = await supabase.from('c1_properties').update({ landlord_name: normalized.full_name, landlord_phone: normalized.phone, landlord_email: normalized.email }).eq('landlord_id', data.id)
    if (propError) toast.error('Landlord saved but failed to sync data to linked properties. Try again or contact support.')
    else toast.success('Landlord updated')
    await fetchLandlord()
  }, [supabase, fetchLandlord])

  const { isEditing, editedData, isSaving, error: editError, startEditing, cancelEditing, updateField, saveChanges, resetData } = useEditMode<LandlordEditable>({
    initialData: landlord ? toEditable(landlord) : null, onSave: handleSave, pmId: propertyManager?.id || '',
  })
  useEffect(() => { if (landlord) resetData(toEditable(landlord)) }, [landlord, resetData])

  const handleDelete = async () => {
    if (!landlord) return
    const { count } = await supabase.from('c1_properties').select('id', { count: 'exact', head: true }).eq('landlord_id', landlord.id)
    if (count && count > 0) throw new Error(`Cannot delete landlord with ${count} linked propert${count !== 1 ? 'ies' : 'y'}. Reassign properties first.`)
    const { error } = await supabase.from('c1_landlords').delete().eq('id', landlord.id)
    if (error) throw error
    toast.success('Landlord deleted'); router.push('/landlords')
  }

  const getInitials = (name: string) => name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!landlord) return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Landlord not found</p></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProfilePageHeader
        backHref="/landlords"
        title={landlord.full_name}
        avatarInitials={getInitials(landlord.full_name)}
        subtitle={`${properties.length} propert${properties.length !== 1 ? 'ies' : 'y'} managed`}
        badges={[{ label: 'Landlord', variant: 'muted' as const }]}
        isEditing={isEditing}
        isSaving={isSaving}
        editError={editError}
        onEdit={startEditing}
        onSave={saveChanges}
        onCancel={cancelEditing}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-6">
        {/* Two-column card grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Contact */}
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
                    <Input value={editedData.phone || ''} onChange={(e) => updateField('phone', e.target.value || null)} placeholder="07123 456789" className={validationErrors.phone ? 'border-destructive' : ''} />
                    {validationErrors.phone && <p className="text-xs text-destructive mt-1">{validationErrors.phone}</p>}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                    <Input value={editedData.email || ''} onChange={(e) => updateField('email', e.target.value || null)} placeholder="john@example.com" className={validationErrors.email ? 'border-destructive' : ''} />
                    {validationErrors.email && <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Contact Method</label>
                  <div className="flex rounded-md border border-input overflow-hidden w-fit">
                    <button type="button" onClick={() => updateField('contact_method', 'whatsapp')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${editedData.contact_method === 'whatsapp' ? 'bg-success text-success-foreground' : 'bg-background hover:bg-muted'}`}>WhatsApp</button>
                    <button type="button" onClick={() => updateField('contact_method', 'email')} className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-input ${editedData.contact_method === 'email' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>Email</button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <KeyValueRow label="Phone">
                  {landlord.phone ? formatPhoneDisplay(landlord.phone) : <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Email">
                  {landlord.email || <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Contact method">
                  {landlord.contact_method === 'email' ? 'Email' : 'WhatsApp'}
                </KeyValueRow>
              </>
            )}
          </ProfileCard>

          {/* Right: Properties */}
          <ProfileCard title="Properties" count={properties.length}>
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 italic">No properties linked</p>
            ) : (
              <div className="divide-y divide-border/50">
                {properties.map((p) => (
                  <Link key={p.id} href={`/properties/${p.id}`} className="flex items-center justify-between py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors">
                    <span className="text-[13px] font-medium truncate">{p.address}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">{tenantCounts[p.id] || 0} tenant{(tenantCounts[p.id] || 0) !== 1 ? 's' : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </ProfileCard>
        </div>

        {/* Reported tickets — full width */}
        <div className="mt-4">
          <TicketCard tickets={tickets} propertyAddressMap={propertyAddressMap} />
        </div>
      </div>

      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Landlord" description="Are you sure you want to delete this landlord? This action cannot be undone." itemName={landlord.full_name} onConfirm={handleDelete} />
    </div>
  )
}
