'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateContractor, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { ProfilePageHeader, ProfileCard, KeyValueRow, TicketCard } from '@/components/profile'
import type { TicketRow } from '@/components/profile'
import { useOnTicketUpdated } from '@/components/ticket-drawer-provider'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import Link from 'next/link'
import { Loader2, X, Check, ChevronDown } from 'lucide-react'

// --- Types ---

interface Contractor {
  id: string; contractor_name: string; category: string; categories: string[] | null
  contractor_phone: string | null; contractor_email: string | null; active: boolean
  property_ids: string[] | null; created_at: string; contact_method: string
}
interface ContractorEditable {
  id: string; contractor_name: string; categories: string[]; contractor_phone: string
  contractor_email: string | null; active: boolean; property_ids: string[]; contact_method: string
}
interface PropertyOption { id: string; address: string }

// --- Helpers ---

const toEditable = (c: Contractor): ContractorEditable => ({
  id: c.id, contractor_name: c.contractor_name,
  categories: c.categories || (c.category ? [c.category] : []),
  contractor_phone: c.contractor_phone || '', contractor_email: c.contractor_email,
  active: c.active, property_ids: c.property_ids || [], contact_method: c.contact_method || 'whatsapp',
})
const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({ value: c, label: c }))

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

  const fetchContractor = useCallback(async () => {
    if (!contractorId) return
    const { data, error } = await supabase.from('c1_contractors').select('*').eq('id', contractorId).single()
    if (error || !data) { toast.error('Contractor not found'); router.push('/contractors'); return }
    setContractor(data as Contractor)
  }, [contractorId, supabase, router])

  const fetchRelated = useCallback(async () => {
    if (!contractorId || !propertyManager) return
    const [propertiesRes, ticketsRes] = await Promise.all([
      supabase.from('c1_properties').select('id, address').eq('property_manager_id', propertyManager.id).order('address'),
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, archived').eq('contractor_id', contractorId).order('date_logged', { ascending: false }).limit(50),
    ])
    if (propertiesRes.data) setAllProperties(propertiesRes.data as PropertyOption[])
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
  }, [contractorId, propertyManager, supabase])

  useOnTicketUpdated(fetchRelated)

  useEffect(() => {
    if (!propertyManager || !contractorId) return
    setLoading(true)
    Promise.all([fetchContractor(), fetchRelated()]).finally(() => setLoading(false))
  }, [propertyManager, contractorId])

  const handleSave = useCallback(async (data: ContractorEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateContractor(data)
    if (hasErrors(errors)) { setValidationErrors(errors); throw new Error('Please fix the validation errors') }
    setValidationErrors({})
    const { data: current } = await supabase.from('c1_contractors').select('_audit_log').eq('id', data.id).single()
    const newLog = [...(current?._audit_log as unknown[] || []), auditEntry]
    const normalized = normalizeRecord('contractors', { contractor_name: data.contractor_name, contractor_phone: data.contractor_phone, contractor_email: data.contractor_email })
    const { error } = await supabase.from('c1_contractors').update({ ...normalized, category: data.categories[0] || '', categories: data.categories, active: data.active, property_ids: data.property_ids, contact_method: data.contact_method, _audit_log: newLog }).eq('id', data.id)
    if (error) throw error
    toast.success('Contractor updated'); await fetchContractor()
  }, [supabase, fetchContractor])

  const { isEditing, editedData, isSaving, error: editError, startEditing, cancelEditing, updateField, saveChanges, resetData } = useEditMode<ContractorEditable>({
    initialData: contractor ? toEditable(contractor) : null, onSave: handleSave, pmId: propertyManager?.id || '',
  })
  useEffect(() => { if (contractor) resetData(toEditable(contractor)) }, [contractor, resetData])

  const handleDelete = async () => {
    if (!contractor) return
    const { count } = await supabase.from('c1_tickets').select('id', { count: 'exact', head: true }).eq('contractor_id', contractor.id).neq('status', 'closed').neq('archived', true)
    if (count && count > 0) throw new Error(`Cannot deactivate contractor with ${count} open ticket(s). Close or reassign tickets first.`)
    const { error } = await supabase.from('c1_contractors').update({ active: false }).eq('id', contractor.id)
    if (error) throw error
    toast.success('Contractor deactivated'); router.push('/contractors')
  }

  const assignedProperties = (contractor?.property_ids || []).map((id) => allProperties.find((p) => p.id === id)).filter(Boolean) as PropertyOption[]

  const handleCategoryToggle = (category: string) => {
    if (!editedData) return
    const c = editedData.categories
    updateField('categories', c.includes(category) ? c.filter((x) => x !== category) : [...c, category])
  }
  const handlePropertyToggle = (propertyId: string) => {
    if (!editedData) return
    const c = editedData.property_ids
    updateField('property_ids', c.includes(propertyId) ? c.filter((x) => x !== propertyId) : [...c, propertyId])
  }

  const getInitials = (name: string) => name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!contractor) return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Contractor not found</p></div>

  const categories = contractor.categories?.length ? contractor.categories : (contractor.category ? [contractor.category] : [])
  const heroBadges: { label: string; variant: 'success' | 'warning' | 'muted' }[] = [
    contractor.active
      ? { label: 'Active', variant: 'success' as const }
      : { label: 'Inactive', variant: 'warning' as const },
  ]
  if (categories.length > 0) heroBadges.push({ label: categories.join(', '), variant: 'muted' as const })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProfilePageHeader
        backHref="/contractors"
        title={contractor.contractor_name}
        avatarInitials={getInitials(contractor.contractor_name)}
        subtitle={`${assignedProperties.length} propert${assignedProperties.length !== 1 ? 'ies' : 'y'} assigned`}
        badges={heroBadges}
        isEditing={isEditing}
        isSaving={isSaving}
        editError={editError}
        onEdit={startEditing}
        onSave={saveChanges}
        onCancel={cancelEditing}
        onDelete={() => setDeleteDialogOpen(true)}
        deleteLabel="Deactivate"
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-6">
        {/* Two-column card grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Contact */}
          <ProfileCard title="Contact details">
            {isEditing && editedData ? (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Name</label>
                  <Input value={editedData.contractor_name} onChange={(e) => updateField('contractor_name', e.target.value)} placeholder="ABC Plumbing" className={validationErrors.contractor_name ? 'border-destructive' : ''} />
                  {validationErrors.contractor_name && <p className="text-xs text-destructive mt-1">{validationErrors.contractor_name}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Phone</label>
                    <Input type="tel" value={editedData.contractor_phone} onChange={(e) => updateField('contractor_phone', e.target.value)} placeholder="07700 900123" className={validationErrors.contractor_phone ? 'border-destructive' : ''} />
                    {validationErrors.contractor_phone && <p className="text-xs text-destructive mt-1">{validationErrors.contractor_phone}</p>}
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                    <Input type="email" value={editedData.contractor_email || ''} onChange={(e) => updateField('contractor_email', e.target.value || null)} placeholder="contractor@email.com" className={validationErrors.contractor_email ? 'border-destructive' : ''} />
                    {validationErrors.contractor_email && <p className="text-xs text-destructive mt-1">{validationErrors.contractor_email}</p>}
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
                  {contractor.contractor_phone ? formatPhoneDisplay(contractor.contractor_phone) : <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Email">
                  {contractor.contractor_email || <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                </KeyValueRow>
                <KeyValueRow label="Contact method">
                  {contractor.contact_method === 'email' ? 'Email' : 'WhatsApp'}
                </KeyValueRow>
              </>
            )}
          </ProfileCard>

          {/* Right: Work details */}
          <ProfileCard title="Work details">
            {isEditing && editedData ? (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Categories</label>
                  {editedData.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {editedData.categories.map((cat) => (
                        <span key={cat} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-foreground">
                          {cat}
                          <button type="button" onClick={() => handleCategoryToggle(cat)} className="hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className={`flex items-center justify-between w-full max-w-sm h-8 px-3 text-sm rounded-md border bg-background hover:bg-accent/50 transition-colors text-left ${validationErrors.category ? 'border-destructive' : 'border-input'}`}>
                        <span className="text-muted-foreground text-xs">{editedData.categories.length === 0 ? 'Select categories...' : 'Add more...'}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1.5 max-h-64 overflow-y-auto" align="start">
                      {CATEGORY_OPTIONS.map((opt) => {
                        const isSel = editedData.categories.includes(opt.value)
                        return (
                          <button key={opt.value} type="button" onClick={() => handleCategoryToggle(opt.value)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left">
                            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-primary border-primary' : 'border-input'}`}>{isSel && <Check className="h-3 w-3 text-primary-foreground" />}</div>
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </PopoverContent>
                  </Popover>
                  {validationErrors.category && <p className="text-xs text-destructive mt-1">{validationErrors.category}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-muted-foreground">Status</label>
                  <Switch checked={editedData.active} onCheckedChange={(checked) => updateField('active', checked)} />
                  <span className="text-sm">{editedData.active ? 'Active' : 'Inactive'}</span>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">Properties</label>
                  {editedData.property_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {editedData.property_ids.map((id) => {
                        const prop = allProperties.find((p) => p.id === id)
                        return prop ? (
                          <span key={id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-muted text-foreground">
                            <span className="truncate max-w-[200px]">{prop.address}</span>
                            <button type="button" onClick={() => handlePropertyToggle(id)} className="hover:text-destructive transition-colors"><X className="h-3 w-3" /></button>
                          </span>
                        ) : null
                      })}
                    </div>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="flex items-center justify-between w-full max-w-sm h-8 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent/50 transition-colors text-left">
                        <span className="text-muted-foreground text-xs">{editedData.property_ids.length === 0 ? 'Select properties...' : 'Add more...'}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-1.5 max-h-64 overflow-y-auto" align="start">
                      {allProperties.map((prop) => {
                        const isSel = editedData.property_ids.includes(prop.id)
                        return (
                          <button key={prop.id} type="button" onClick={() => handlePropertyToggle(prop.id)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left">
                            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-primary border-primary' : 'border-input'}`}>{isSel && <Check className="h-3 w-3 text-primary-foreground" />}</div>
                            <span className="truncate">{prop.address}</span>
                          </button>
                        )
                      })}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : (
              <>
                <KeyValueRow label="Categories">
                  {categories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {categories.map((cat) => (
                        <span key={cat} className="px-2 py-0.5 rounded text-xs bg-muted text-foreground">{cat}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 font-normal italic">Not set</span>
                  )}
                </KeyValueRow>
                <KeyValueRow label="Status">
                  <span className={`inline-flex items-center gap-1.5 ${contractor.active ? 'text-success' : 'text-danger'}`}>
                    <span className={`h-2 w-2 rounded-full ${contractor.active ? 'bg-success' : 'bg-danger'}`} />
                    {contractor.active ? 'Active' : 'Inactive'}
                  </span>
                </KeyValueRow>
                <KeyValueRow label="Properties">
                  {assignedProperties.length > 0 ? (
                    <span>{assignedProperties.length} assigned</span>
                  ) : (
                    <span className="text-muted-foreground/50 font-normal italic">None</span>
                  )}
                </KeyValueRow>
              </>
            )}
          </ProfileCard>
        </div>

        {/* Reported tickets — full width */}
        <div className="mt-4">
          <TicketCard tickets={tickets} />
        </div>
      </div>

      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Deactivate Contractor" description="Are you sure you want to deactivate this contractor? Historical data will be preserved." itemName={contractor.contractor_name} onConfirm={handleDelete} />
    </div>
  )
}
