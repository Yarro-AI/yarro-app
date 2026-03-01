'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateProperty, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { PriorityDot } from '@/components/priority-dot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Trash2,
  Loader2,
  Banknote,
  Crown,
  Phone,
  KeyRound,
  Check,
  ChevronDown,
  Plus,
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
  require_landlord_approval: boolean
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
  require_landlord_approval: boolean
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
  property_ids: string[] | null
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
  require_landlord_approval: p.require_landlord_approval ?? true,
  access_instructions: p.access_instructions,
  emergency_access_contact: p.emergency_access_contact,
})

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return '—'
  return `£${amount.toFixed(0)}`
}

const displayStageMap: Record<string, string> = {
  pending_review: 'Needs Review',
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

const getDisplayStage = (reason: string | null, status: string, archived?: boolean | null) => {
  if (archived) return 'Archived'
  if (status?.toLowerCase() === 'closed') return 'Completed'
  if (reason && displayStageMap[reason]) return displayStageMap[reason]
  return 'Open'
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
  const [allTenants, setAllTenants] = useState<TenantRow[]>([])
  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [allContractors, setAllContractors] = useState<ContractorRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [landlordOptions, setLandlordOptions] = useState<LandlordOption[]>([])
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)

  const fetchProperty = useCallback(async () => {
    if (!propertyId) return
    const { data, error } = await supabase
      .from('c1_properties')
      .select('id, address, landlord_id, landlord_name, landlord_phone, landlord_email, auto_approve_limit, require_landlord_approval, access_instructions, emergency_access_contact')
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
    const [tenantsRes, allTenantsRes, contractorsRes, ticketsRes, landlordsRes] = await Promise.all([
      supabase.from('c1_tenants').select('id, full_name, phone, email, role_tag').eq('property_id', propertyId).order('full_name'),
      supabase.from('c1_tenants').select('id, full_name, phone, email, role_tag').eq('property_manager_id', propertyManager.id).order('full_name'),
      supabase.from('c1_contractors').select('id, contractor_name, category, categories, contractor_phone, property_ids').eq('property_manager_id', propertyManager.id).eq('active', true),
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, scheduled_date, archived').eq('property_id', propertyId).order('date_logged', { ascending: false }).limit(50),
      supabase.from('c1_landlords').select('id, full_name, phone, email').eq('property_manager_id', propertyManager.id).order('full_name'),
    ])
    if (tenantsRes.data) setTenants(tenantsRes.data as TenantRow[])
    if (allTenantsRes.data) setAllTenants(allTenantsRes.data as TenantRow[])
    if (contractorsRes.data) {
      setAllContractors(contractorsRes.data as ContractorRow[])
      const assigned = contractorsRes.data.filter((c: any) => Array.isArray(c.property_ids) && c.property_ids.includes(propertyId))
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

  const handleSave = useCallback(async (data: PropertyEditable, auditEntry: { at: string; by: string; changes: Record<string, { from: unknown; to: unknown }> }) => {
    const errors = validateProperty(data)
    if (hasErrors(errors)) { setValidationErrors(errors); throw new Error('Please fix the validation errors') }
    setValidationErrors({})
    const { data: current } = await supabase.from('c1_properties').select('_audit_log').eq('id', data.id).single()
    const existingLog = (current?._audit_log as unknown[] || [])
    const newLog = [...existingLog, auditEntry]
    const selectedLl = landlordOptions.find((l) => l.id === data.landlord_id)
    const normalized = normalizeRecord('properties', { address: data.address, auto_approve_limit: data.auto_approve_limit, require_landlord_approval: data.require_landlord_approval, access_instructions: data.access_instructions, emergency_access_contact: data.emergency_access_contact })
    const { error } = await supabase.from('c1_properties').update({ ...normalized, landlord_id: data.landlord_id, landlord_name: selectedLl?.full_name || null, landlord_phone: selectedLl?.phone || null, landlord_email: selectedLl?.email || null, _audit_log: newLog }).eq('id', data.id)
    if (error) throw error
    toast.success('Property updated')
    await fetchProperty()
  }, [supabase, landlordOptions, fetchProperty])

  const { isEditing, editedData, isSaving, error: editError, startEditing, cancelEditing, updateField, saveChanges, resetData } = useEditMode<PropertyEditable>({
    initialData: property ? toEditable(property) : null,
    onSave: handleSave,
    pmId: propertyManager?.id || '',
  })

  useEffect(() => { if (property) resetData(toEditable(property)) }, [property, resetData])

  const handleDelete = async () => {
    if (!property) return
    const { count: tenantCount } = await supabase.from('c1_tenants').select('id', { count: 'exact', head: true }).eq('property_id', property.id)
    if (tenantCount && tenantCount > 0) throw new Error(`Cannot delete property with ${tenantCount} tenant(s). Remove or reassign tenants first.`)
    const { count: ticketCount } = await supabase.from('c1_tickets').select('id', { count: 'exact', head: true }).eq('property_id', property.id).not('status', 'ilike', 'closed').neq('archived', true)
    if (ticketCount && ticketCount > 0) throw new Error(`Cannot delete property with ${ticketCount} open ticket(s). Close tickets first.`)
    const { error } = await supabase.from('c1_properties').delete().eq('id', property.id)
    if (error) throw error
    toast.success('Property deleted')
    router.push('/properties')
  }

  const handleContractorToggle = async (contractorId: string) => {
    const contractor = allContractors.find((c) => c.id === contractorId)
    if (!contractor) return
    const currentIds = contractor.property_ids || []
    const isAssigned = currentIds.includes(propertyId)
    const newIds = isAssigned ? currentIds.filter((id) => id !== propertyId) : [...currentIds, propertyId]
    const { error } = await supabase.from('c1_contractors').update({ property_ids: newIds }).eq('id', contractorId)
    if (error) { toast.error('Failed to update contractor'); return }
    await fetchRelated()
  }

  const handleTenantRemove = async (tenantId: string) => {
    const { error } = await supabase.from('c1_tenants').update({ property_id: null }).eq('id', tenantId)
    if (error) { toast.error('Failed to remove tenant'); return }
    await fetchRelated()
  }

  const handleTenantAdd = async (tenantId: string) => {
    const { error } = await supabase.from('c1_tenants').update({ property_id: propertyId }).eq('id', tenantId)
    if (error) { toast.error('Failed to add tenant'); return }
    await fetchRelated()
  }

  const openTickets = tickets.filter((t) => t.status?.toLowerCase() !== 'closed' && !t.archived)
  const completedTickets = tickets.filter((t) => t.status?.toLowerCase() === 'closed')

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  if (!property) {
    return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Property not found</p></div>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4">
        <button onClick={() => router.push('/properties')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight truncate">{property.address}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}><X className="h-4 w-4 mr-1" /> Cancel</Button>
              <Button size="sm" onClick={saveChanges} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
              </Button>
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
        <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col">
          {isEditing && editedData ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="mb-5 flex-shrink-0">
                <label className="text-xs text-muted-foreground mb-1.5 block">Address</label>
                <Input value={editedData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="123 Main Street, Manchester, M1 1AA" className={validationErrors.address ? 'border-destructive' : ''} />
                {validationErrors.address && <p className="text-xs text-destructive mt-1">{validationErrors.address}</p>}
              </div>
              <div className="grid grid-cols-[3fr_2fr] gap-x-8 gap-y-5 flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-muted-foreground">Require Landlord Approval</p>
                      <Switch checked={editedData.require_landlord_approval} onCheckedChange={(v) => updateField('require_landlord_approval', v)} />
                    </div>
                    <div className={cn(!editedData.require_landlord_approval && 'opacity-40 pointer-events-none')}>
                      <p className="text-xs text-muted-foreground mb-1">Auto-Approve Limit</p>
                      <Input type="number" value={editedData.auto_approve_limit ?? ''} onChange={(e) => updateField('auto_approve_limit', e.target.value ? parseFloat(e.target.value) : null)} placeholder="500" className={`h-8 ${validationErrors.auto_approve_limit ? 'border-destructive' : ''}`} />
                      {validationErrors.auto_approve_limit && <p className="text-xs text-destructive mt-1">{validationErrors.auto_approve_limit}</p>}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Crown className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Landlord</p>
                    <Select value={editedData.landlord_id || 'none'} onValueChange={(v) => updateField('landlord_id', v === 'none' ? null : v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select landlord..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No landlord</SelectItem>
                        {landlordOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}{l.phone ? ` (${formatPhoneDisplay(l.phone)})` : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Phone className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Emergency Contact</p>
                    <Input value={editedData.emergency_access_contact || ''} onChange={(e) => updateField('emergency_access_contact', e.target.value || null)} placeholder="Name / Phone" className="h-8" />
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Access Instructions</p>
                    <Textarea value={editedData.access_instructions || ''} onChange={(e) => updateField('access_instructions', e.target.value || null)} placeholder="Gate code, key safe, entry instructions..." rows={2} className="text-sm" />
                  </div>
                </div>
              </div>

              <div className="border-t border-border/40 mt-8 flex-shrink-0" />

              {/* Tenants — editable, same row layout as view */}
              <div className="mt-6 flex-shrink-0 max-h-[200px] flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3 flex-shrink-0">
                  Tenants
                  {tenants.length > 0 && <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">{tenants.length}</span>}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="ml-auto h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-1.5 max-h-64 overflow-y-auto" align="end">
                      {(() => {
                        const unassigned = allTenants.filter((t) => !tenants.some((at) => at.id === t.id))
                        if (unassigned.length === 0) return <p className="text-xs text-muted-foreground px-2 py-1.5">No available tenants</p>
                        return unassigned.map((t) => (
                          <button key={t.id} type="button" onClick={() => handleTenantAdd(t.id)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left">
                            <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{t.full_name}</span>
                            {t.phone && <span className="text-xs text-muted-foreground ml-auto truncate">{formatPhoneDisplay(t.phone)}</span>}
                          </button>
                        ))
                      })()}
                    </PopoverContent>
                  </Popover>
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  {tenants.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tenants assigned</p>
                  ) : (
                    <div className="space-y-0.5">
                      {tenants.map((t) => (
                        <div key={t.id} className="grid grid-cols-[3fr_2fr_auto] gap-x-8 items-center py-2.5 -mx-3 px-3 rounded-lg group hover:bg-muted/30 transition-colors">
                          <span className="text-[15px] truncate pl-11">{t.full_name}</span>
                          <span className="text-sm text-muted-foreground truncate pl-11">
                            {(t.role_tag || 'tenant').replace(/_/g, ' ')}
                            {t.phone && ` · ${formatPhoneDisplay(t.phone)}`}
                          </span>
                          <button type="button" onClick={() => handleTenantRemove(t.id)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Contractors — editable, same row layout as view */}
              <div className="mt-8 flex-1 min-h-0 flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3 flex-shrink-0">
                  Contractors
                  {contractors.length > 0 && <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">{contractors.length}</span>}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="ml-auto h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-1.5 max-h-64 overflow-y-auto" align="end">
                      {allContractors.map((c) => {
                        const isSel = contractors.some((ac) => ac.id === c.id)
                        return (
                          <button key={c.id} type="button" onClick={() => handleContractorToggle(c.id)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-muted/50 transition-colors text-left">
                            <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-primary border-primary' : 'border-input'}`}>{isSel && <Check className="h-3 w-3 text-primary-foreground" />}</div>
                            <span className="truncate">{c.contractor_name}</span>
                            <span className="text-xs text-muted-foreground ml-auto truncate">{(c.categories || (c.category ? [c.category] : [])).join(', ')}</span>
                          </button>
                        )
                      })}
                    </PopoverContent>
                  </Popover>
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  {contractors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No contractors assigned</p>
                  ) : (
                    <div className="space-y-0.5">
                      {contractors.map((c) => (
                        <div key={c.id} className="grid grid-cols-[3fr_2fr_auto] gap-x-8 items-center py-2.5 -mx-3 px-3 rounded-lg group hover:bg-muted/30 transition-colors">
                          <span className="text-[15px] truncate pl-11">{c.contractor_name}</span>
                          <span className="text-sm text-muted-foreground truncate pl-11">
                            {(c.categories || (c.category ? [c.category] : [])).join(', ')}
                            {c.contractor_phone && ` · ${formatPhoneDisplay(c.contractor_phone)}`}
                          </span>
                          <button type="button" onClick={() => handleContractorToggle(c.id)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Meta info — 2-column aligned layout, 60/40 split */}
              <div className="grid grid-cols-[3fr_2fr] gap-x-8 gap-y-5 flex-shrink-0">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Landlord Approval</p>
                    <p className="text-[15px] font-medium mt-0.5">
                      {property.require_landlord_approval
                        ? `Required (auto under ${formatCurrency(property.auto_approve_limit)})`
                        : 'Not required'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Crown className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Landlord</p>
                    {property.landlord_id ? (
                      <Link href={`/landlords/${property.landlord_id}`} className="text-[15px] font-medium mt-0.5 hover:underline block">{property.landlord_name}</Link>
                    ) : (
                      <p className="text-[15px] text-muted-foreground/50 mt-0.5">Not assigned</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Phone className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Emergency Contact</p>
                    <p className="text-[15px] font-medium mt-0.5">{property.emergency_access_contact ? formatPhoneDisplay(property.emergency_access_contact) : <span className="text-muted-foreground/50 font-normal">None</span>}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <KeyRound className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Access Instructions</p>
                    <p className="text-[15px] mt-0.5">{property.access_instructions || <span className="text-muted-foreground/50 font-normal">None</span>}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/40 mt-8 flex-shrink-0" />

              <div className="mt-6 flex-shrink-0">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3">
                  Tenants
                  {tenants.length > 0 && <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">{tenants.length}</span>}
                </h3>
                {tenants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tenants assigned</p>
                ) : (
                  <div className="space-y-0.5">
                    {tenants.map((t) => (
                      <Link key={t.id} href={`/tenants/${t.id}`} className="grid grid-cols-[3fr_2fr] gap-x-8 items-center py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors">
                        <span className="text-[15px] truncate pl-11">{t.full_name}</span>
                        <span className="text-sm text-muted-foreground truncate pl-11">
                          {(t.role_tag || 'tenant').replace(/_/g, ' ')}
                          {t.phone && ` · ${formatPhoneDisplay(t.phone)}`}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Contractors */}
              <div className="mt-8 flex-1 min-h-0 flex flex-col">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-3 flex-shrink-0">
                  Contractors
                  {contractors.length > 0 && <span className="text-xs font-normal normal-case tracking-normal bg-muted px-1.5 py-0.5 rounded">{contractors.length}</span>}
                </h3>
                {contractors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contractors assigned</p>
                ) : (
                  <div className="space-y-0.5 overflow-y-auto overflow-x-hidden min-h-0">
                    {contractors.map((c) => (
                      <Link key={c.id} href={`/contractors/${c.id}`} className="grid grid-cols-[3fr_2fr] gap-x-8 items-center py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors">
                        <span className="text-[15px] truncate pl-11">{c.contractor_name}</span>
                        <span className="text-sm text-muted-foreground truncate pl-11">
                          {(c.categories || (c.category ? [c.category] : [])).join(', ')}
                          {c.contractor_phone && ` · ${formatPhoneDisplay(c.contractor_phone)}`}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right: Tickets */}
        <div className="w-[540px] flex-shrink-0 border-l flex flex-col">
          <div className="px-6 py-5 flex-shrink-0">
            <h3 className="text-sm font-semibold">Tickets</h3>
            {(openTickets.length > 0 || completedTickets.length > 0) && (
              <p className="text-xs text-muted-foreground mt-1">
                {[openTickets.length > 0 && `${openTickets.length} open`, completedTickets.length > 0 && `${completedTickets.length} completed`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets</p>
            ) : (
              <div className="divide-y divide-border/50">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={cn(
                      "w-full text-left py-3 hover:bg-muted/30 -mx-3 px-3 transition-colors first:pt-0",
                      t.archived && "opacity-40"
                    )}
                  >
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
      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Property" description="Are you sure you want to delete this property? This action cannot be undone." itemName={property.address} onConfirm={handleDelete} />
    </div>
  )
}
