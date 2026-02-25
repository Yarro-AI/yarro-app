'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateLandlord, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { PriorityDot } from '@/components/priority-dot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import Link from 'next/link'
import { ArrowLeft, Pencil, Save, X, Trash2, Loader2 } from 'lucide-react'

// --- Types ---

interface Landlord { id: string; full_name: string; phone: string | null; email: string | null; created_at: string }
interface LandlordEditable { id: string; full_name: string; phone: string | null; email: string | null }
interface PropertyRow { id: string; address: string }
interface TicketRow {
  id: string; issue_title: string | null; issue_description: string | null
  category: string | null; priority: string | null; status: string
  next_action_reason: string | null; date_logged: string; property_id: string; archived: boolean | null
}

// --- Helpers ---

const toEditable = (l: Landlord): LandlordEditable => ({ id: l.id, full_name: l.full_name || '', phone: l.phone, email: l.email })

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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

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
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, property_id, archived').in('property_id', propertyIds).order('date_logged', { ascending: false }).limit(50),
    ])
    if (tenantsRes.data) {
      const counts: Record<string, number> = {}
      tenantsRes.data.forEach((t: { property_id: string }) => { counts[t.property_id] = (counts[t.property_id] || 0) + 1 })
      setTenantCounts(counts)
    }
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
  }, [landlordId, supabase])

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
    const { error } = await supabase.from('c1_landlords').update({ ...normalized, _audit_log: newLog }).eq('id', data.id)
    if (error) throw error
    const { error: propError } = await supabase.from('c1_properties').update({ landlord_name: normalized.full_name, landlord_phone: normalized.phone, landlord_email: normalized.email }).eq('landlord_id', data.id)
    if (propError) console.error('Failed to sync landlord data to properties:', propError)
    toast.success('Landlord updated'); await fetchLandlord()
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

  const openTickets = tickets.filter((t) => t.status !== 'closed' && !t.archived)
  const closedTickets = tickets.filter((t) => t.status === 'closed')

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!landlord) return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Landlord not found</p></div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — aligned with sidebar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4">
        <button onClick={() => router.push('/landlords')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate">{landlord.full_name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[
              landlord.phone && formatPhoneDisplay(landlord.phone),
              landlord.email,
              properties.length > 0 && `${properties.length} propert${properties.length !== 1 ? 'ies' : 'y'}`,
            ].filter(Boolean).join(' · ')}
          </p>
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
        <div className="flex-1 overflow-y-auto px-10 py-8">
          {isEditing && editedData ? (
            <div className="space-y-6">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Full Name</label>
                <Input value={editedData.full_name} onChange={(e) => updateField('full_name', e.target.value)} placeholder="John Smith" className={validationErrors.full_name ? 'border-destructive' : ''} />
                {validationErrors.full_name && <p className="text-xs text-destructive mt-1">{validationErrors.full_name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Phone</label>
                  <Input value={editedData.phone || ''} onChange={(e) => updateField('phone', e.target.value || null)} placeholder="07123 456789" className={validationErrors.phone ? 'border-destructive' : ''} />
                  {validationErrors.phone && <p className="text-xs text-destructive mt-1">{validationErrors.phone}</p>}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Email</label>
                  <Input value={editedData.email || ''} onChange={(e) => updateField('email', e.target.value || null)} placeholder="john@example.com" className={validationErrors.email ? 'border-destructive' : ''} />
                  {validationErrors.email && <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  <p className="text-sm">{landlord.phone ? formatPhoneDisplay(landlord.phone) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email</p>
                  <p className="text-sm">{landlord.email || '—'}</p>
                </div>
              </div>
            </>
          )}

          {/* Properties */}
          <div className="mt-10">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Properties{properties.length > 0 && <span className="ml-2 normal-case font-normal text-muted-foreground/60">{properties.length}</span>}
            </h3>
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No properties linked</p>
            ) : (
              <div className="space-y-0.5">
                {properties.map((p) => (
                  <Link key={p.id} href={`/properties/${p.id}`} className="flex items-center justify-between py-2 hover:bg-muted/30 -mx-3 px-3 rounded transition-colors">
                    <span className="text-sm font-medium">{p.address}</span>
                    <span className="text-xs text-muted-foreground">{tenantCounts[p.id] || 0} tenant{(tenantCounts[p.id] || 0) !== 1 ? 's' : ''}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Tickets */}
        <div className="w-[400px] flex-shrink-0 border-l flex flex-col">
          <div className="px-6 py-5 flex-shrink-0">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tickets</h3>
            {(openTickets.length > 0 || closedTickets.length > 0) && (
              <p className="text-xs text-muted-foreground/60 mt-1">
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
                          {propertyAddressMap[t.property_id] && <> · {propertyAddressMap[t.property_id]}</>}
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
      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Landlord" description="Are you sure you want to delete this landlord? This action cannot be undone." itemName={landlord.full_name} onConfirm={handleDelete} />
    </div>
  )
}
