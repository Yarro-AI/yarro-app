'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { useEditMode } from '@/hooks/use-edit-mode'
import { normalizeRecord, validateProperty, validateContractor, hasErrors, formatPhoneDisplay, type ValidationErrors } from '@/lib/normalize'
import { CONTRACTOR_CATEGORIES } from '@/lib/constants'
import { ProfilePageHeader, ProfileCard, KeyValueRow, TicketCard } from '@/components/profile'
import type { TicketRow } from '@/components/profile'
import { useOnTicketUpdated } from '@/components/ticket-drawer-provider'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { PropertyComplianceSection } from '@/components/property-compliance-section'
import { PropertyRoomsSection } from '@/components/property-rooms-section'
import { PropertyRentSection } from '@/components/property-rent-section'
import Link from 'next/link'
import {
  Loader2,
  Check,
  Plus,
  X,
  Building2,
  Users,
  ShieldCheck,
  BedDouble,
  Banknote,
  TicketIcon,
} from 'lucide-react'

// --- Types ---

interface PropertyDetail {
  id: string
  address: string
  property_type: string | null
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
  property_type: string
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

// --- Helpers ---

const toEditable = (p: PropertyDetail): PropertyEditable => ({
  id: p.id,
  address: p.address || '',
  property_type: p.property_type || 'hmo',
  landlord_id: p.landlord_id,
  auto_approve_limit: p.auto_approve_limit,
  require_landlord_approval: p.require_landlord_approval ?? true,
  access_instructions: p.access_instructions,
  emergency_access_contact: p.emergency_access_contact,
})

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return '\u2014'
  return `\u00a3${amount.toFixed(0)}`
}

const VALID_TABS = ['overview', 'people', 'compliance', 'rooms', 'rent', 'tickets'] as const
type TabValue = (typeof VALID_TABS)[number]

const TAB_CONFIG: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: 'overview', label: 'Overview', icon: Building2 },
  { value: 'people', label: 'People', icon: Users },
  { value: 'compliance', label: 'Compliance', icon: ShieldCheck },
  { value: 'rooms', label: 'Rooms', icon: BedDouble },
  { value: 'rent', label: 'Rent', icon: Banknote },
  { value: 'tickets', label: 'Tickets', icon: TicketIcon },
]

// --- Inner component (uses useSearchParams) ---

function PropertyDetailInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const propertyId = params.id as string
  const { propertyManager } = usePM()
  const supabase = createClient()

  // Tab state from URL
  const tabParam = searchParams.get('tab') as TabValue | null
  const activeTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview'

  const setActiveTab = (tab: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const [property, setProperty] = useState<PropertyDetail | null>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [allTenants, setAllTenants] = useState<TenantRow[]>([])
  const [contractors, setContractors] = useState<ContractorRow[]>([])
  const [allContractors, setAllContractors] = useState<ContractorRow[]>([])
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [rooms, setRooms] = useState<{ id: string; current_tenant_id: string | null; is_vacant: boolean | null; monthly_rent: number | null }[]>([])
  const [landlordOptions, setLandlordOptions] = useState<LandlordOption[]>([])
  const [loading, setLoading] = useState(true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Inline create dialogs
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [newTenant, setNewTenant] = useState({ full_name: '', phone: '', email: '' })
  const [savingNewTenant, setSavingNewTenant] = useState(false)

  const [addContractorOpen, setAddContractorOpen] = useState(false)
  const [newContractor, setNewContractor] = useState({ contractor_name: '', contractor_phone: '', category: '' })
  const [savingNewContractor, setSavingNewContractor] = useState(false)

  const [addLandlordOpen, setAddLandlordOpen] = useState(false)
  const [newLandlord, setNewLandlord] = useState({ full_name: '', phone: '', email: '', contact_method: 'whatsapp' })
  const [savingNewLandlord, setSavingNewLandlord] = useState(false)
  const [confirmRemoveTenant, setConfirmRemoveTenant] = useState<TenantRow | null>(null)
  const [confirmRemoveContractor, setConfirmRemoveContractor] = useState<ContractorRow | null>(null)

  const fetchProperty = useCallback(async () => {
    if (!propertyId) return
    const { data, error } = await supabase
      .from('c1_properties')
      .select('id, address, property_type, landlord_id, landlord_name, landlord_phone, landlord_email, auto_approve_limit, require_landlord_approval, access_instructions, emergency_access_contact')
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
    const [tenantsRes, allTenantsRes, contractorsRes, ticketsRes, landlordsRes, roomsRes] = await Promise.all([
      supabase.from('c1_tenants').select('id, full_name, phone, email, role_tag').eq('property_id', propertyId).order('full_name'),
      supabase.from('c1_tenants').select('id, full_name, phone, email, role_tag').eq('property_manager_id', propertyManager.id).order('full_name'),
      supabase.from('c1_contractors').select('id, contractor_name, category, categories, contractor_phone, property_ids').eq('property_manager_id', propertyManager.id).eq('active', true),
      supabase.from('c1_tickets').select('id, issue_title, issue_description, category, priority, status, next_action_reason, date_logged, archived').eq('property_id', propertyId).order('date_logged', { ascending: false }).limit(50),
      supabase.from('c1_landlords').select('id, full_name, phone, email').eq('property_manager_id', propertyManager.id).order('full_name'),
      supabase.from('c1_rooms').select('id, current_tenant_id, is_vacant, monthly_rent').eq('property_id', propertyId),
    ])
    if (tenantsRes.data) setTenants(tenantsRes.data as TenantRow[])
    if (allTenantsRes.data) setAllTenants(allTenantsRes.data as TenantRow[])
    if (contractorsRes.data) {
      setAllContractors(contractorsRes.data as ContractorRow[])
      const assigned = contractorsRes.data.filter((c: ContractorRow) => Array.isArray(c.property_ids) && c.property_ids.includes(propertyId))
      setContractors(assigned as ContractorRow[])
    }
    if (ticketsRes.data) setTickets(ticketsRes.data as TicketRow[])
    if (landlordsRes.data) setLandlordOptions(landlordsRes.data as LandlordOption[])
    if (roomsRes.data) setRooms(roomsRes.data)
  }, [propertyId, propertyManager, supabase])

  useOnTicketUpdated(fetchRelated)

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
  }, [supabase, landlordOptions, fetchProperty, property, propertyManager])

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
    const { error } = await supabase.rpc('c1_toggle_contractor_property', {
      p_contractor_id: contractorId,
      p_property_id: propertyId,
      p_pm_id: propertyManager!.id,
    })
    if (error) { toast.error('Failed to update contractor'); return }
    await fetchRelated()
  }

  const handleTenantRemove = async (tenantId: string) => {
    const { error } = await supabase.rpc('c1_unlink_tenant_from_property', {
      p_tenant_id: tenantId,
      p_pm_id: propertyManager!.id,
    })
    if (error) { toast.error('Failed to remove tenant'); return }
    await fetchRelated()
  }

  const handleTenantAdd = async (tenantId: string) => {
    const { error } = await supabase.rpc('c1_link_tenant_to_property', {
      p_tenant_id: tenantId,
      p_property_id: propertyId,
      p_pm_id: propertyManager!.id,
    })
    if (error) { toast.error('Failed to add tenant'); return }
    await fetchRelated()
  }

  const handleCreateTenant = async () => {
    if (!newTenant.full_name.trim()) { toast.error('Name is required'); return }
    const normalized = normalizeRecord('tenants', { full_name: newTenant.full_name, phone: newTenant.phone, email: newTenant.email })
    setSavingNewTenant(true)
    const { error } = await supabase.from('c1_tenants').insert({
      ...normalized, property_id: propertyId, property_manager_id: propertyManager!.id,
    })
    setSavingNewTenant(false)
    if (error) { toast.error('Failed to create tenant'); return }
    toast.success('Tenant created and added to property')
    setNewTenant({ full_name: '', phone: '', email: '' })
    setAddTenantOpen(false)
    await fetchRelated()
  }

  const handleCreateContractor = async () => {
    if (!newContractor.contractor_name.trim()) { toast.error('Name is required'); return }
    if (!newContractor.contractor_phone.trim()) { toast.error('Phone is required'); return }
    const normalized = normalizeRecord('contractors', { contractor_name: newContractor.contractor_name, contractor_phone: newContractor.contractor_phone })
    setSavingNewContractor(true)
    const { error } = await supabase.from('c1_contractors').insert({
      ...normalized, category: newContractor.category || null, categories: newContractor.category ? [newContractor.category] : [],
      property_ids: [propertyId], property_manager_id: propertyManager!.id, active: true,
    })
    setSavingNewContractor(false)
    if (error) { toast.error('Failed to create contractor'); return }
    toast.success('Contractor created and added to property')
    setNewContractor({ contractor_name: '', contractor_phone: '', category: '' })
    setAddContractorOpen(false)
    await fetchRelated()
  }

  const handleCreateLandlord = async () => {
    if (!newLandlord.full_name.trim()) { toast.error('Name is required'); return }
    setSavingNewLandlord(true)
    const normalized = normalizeRecord('landlords', { full_name: newLandlord.full_name, phone: newLandlord.phone, email: newLandlord.email })
    const { data: ll, error: llErr } = await supabase.from('c1_landlords').insert({
      ...normalized, contact_method: newLandlord.contact_method, property_manager_id: propertyManager!.id,
    }).select('id, full_name, phone, email').single()
    if (llErr || !ll) { setSavingNewLandlord(false); toast.error('Failed to create landlord'); return }
    const { error: propErr } = await supabase.from('c1_properties').update({
      landlord_id: ll.id, landlord_name: ll.full_name, landlord_phone: ll.phone, landlord_email: ll.email,
    }).eq('id', propertyId)
    setSavingNewLandlord(false)
    if (propErr) { toast.error('Landlord created but failed to link to property'); return }
    toast.success('Landlord created and linked to property')
    setNewLandlord({ full_name: '', phone: '', email: '', contact_method: 'whatsapp' })
    setAddLandlordOpen(false)
    await Promise.all([fetchProperty(), fetchRelated()])
  }

  const handleTabChange = (tab: string) => {
    if (isEditing) {
      toast.error('Save or cancel your changes before switching tabs')
      return
    }
    setActiveTab(tab)
  }

  // Determine if Edit button should show (only for overview + people tabs)
  const showEditControls = activeTab === 'overview' || activeTab === 'people'

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  if (!property) {
    return <div className="flex items-center justify-center h-full"><p className="text-muted-foreground">Property not found</p></div>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ProfilePageHeader
        backHref="/properties"
        title={property.address}
        isEditing={isEditing}
        isSaving={isSaving}
        editError={editError}
        onEdit={startEditing}
        onSave={saveChanges}
        onCancel={cancelEditing}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 min-h-0 flex flex-col">
        {/* Horizontal tab bar with icons + underline */}
        <TabsList className="flex overflow-x-auto bg-transparent border-b rounded-none px-8 py-0 h-auto gap-0 w-full shrink-0">
          {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-1.5 px-3.5 py-2.5 rounded-none border-b-2 border-transparent shadow-none data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent text-[13px] text-muted-foreground data-[state=active]:text-primary data-[state=active]:font-medium shrink-0 -mb-[0.5px]"
            >
              <Icon className="h-[13px] w-[13px]" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <div className="space-y-6">
              {/* Stat strip */}
              {(() => {
                const totalRooms = rooms.length
                const occupiedRooms = rooms.filter((r) => !r.is_vacant).length
                const vacantRooms = totalRooms - occupiedRooms
                const occupancyPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0
                const monthlyRent = rooms.reduce((sum, r) => sum + (r.monthly_rent || 0), 0)
                const openTickets = tickets.filter((t) => t.status !== 'closed' && !t.archived)
                const urgentTickets = openTickets.filter((t) => t.priority === 'urgent')
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-card rounded-2xl border border-border p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Rooms</p>
                      <p className="text-2xl font-semibold">{totalRooms}</p>
                      <p className="text-xs text-muted-foreground mt-1">{occupiedRooms} occupied</p>
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Occupancy</p>
                      <p className="text-2xl font-semibold">{occupancyPct}%</p>
                      <p className="text-xs text-muted-foreground mt-1">{vacantRooms} vacant</p>
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Monthly rent</p>
                      <p className="text-2xl font-semibold">{monthlyRent > 0 ? `\u00a3${monthlyRent.toLocaleString()}` : '\u2014'}</p>
                      {monthlyRent > 0 && <p className="text-xs text-muted-foreground mt-1">expected</p>}
                    </div>
                    <div className="bg-card rounded-2xl border border-border p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Open tickets</p>
                      <p className="text-2xl font-semibold">{openTickets.length}</p>
                      {urgentTickets.length > 0 ? <p className="text-xs text-destructive mt-1">{urgentTickets.length} urgent</p> : <p className="text-xs text-muted-foreground mt-1">&nbsp;</p>}
                    </div>
                  </div>
                )
              })()}

              <ProfileCard title="Property details">
                {isEditing && editedData ? (
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">Address</label>
                      <Input value={editedData.address} onChange={(e) => updateField('address', e.target.value)} placeholder="123 Main Street, Manchester, M1 1AA" className={validationErrors.address ? 'border-destructive' : ''} />
                      {validationErrors.address && <p className="text-xs text-destructive mt-1">{validationErrors.address}</p>}
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">Property Type</label>
                      <Select value={editedData.property_type} onValueChange={(v) => updateField('property_type', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hmo">HMO</SelectItem>
                          <SelectItem value="single_let">Single Let</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">Landlord</label>
                      <Select value={editedData.landlord_id || 'none'} onValueChange={(v) => updateField('landlord_id', v === 'none' ? null : v)}>
                        <SelectTrigger><SelectValue placeholder="Select landlord..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No landlord</SelectItem>
                          {landlordOptions.map((l) => <SelectItem key={l.id} value={l.id}>{l.full_name}{l.phone ? ` (${formatPhoneDisplay(l.phone)})` : ''}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-sm text-muted-foreground">Require Landlord Approval</label>
                          <Switch checked={editedData.require_landlord_approval} onCheckedChange={(v) => updateField('require_landlord_approval', v)} />
                        </div>
                        <div className={cn(!editedData.require_landlord_approval && 'opacity-40 pointer-events-none')}>
                          <label className="text-xs text-muted-foreground mb-1 block">Auto-Approve Limit</label>
                          <Input type="number" value={editedData.auto_approve_limit ?? ''} onChange={(e) => updateField('auto_approve_limit', e.target.value ? parseFloat(e.target.value) : null)} placeholder="500" className={validationErrors.auto_approve_limit ? 'border-destructive' : ''} />
                          {validationErrors.auto_approve_limit && <p className="text-xs text-destructive mt-1">{validationErrors.auto_approve_limit}</p>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">Emergency Contact</label>
                        <Input value={editedData.emergency_access_contact || ''} onChange={(e) => updateField('emergency_access_contact', e.target.value || null)} placeholder="Name / Phone" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1.5 block">Access Instructions</label>
                      <Textarea value={editedData.access_instructions || ''} onChange={(e) => updateField('access_instructions', e.target.value || null)} placeholder="Gate code, key safe, entry instructions..." rows={2} className="text-sm" />
                    </div>
                  </div>
                ) : (
                  <>
                    <KeyValueRow label="Property Type">
                      {property.property_type === 'single_let' ? 'Single Let' : 'HMO'}
                    </KeyValueRow>
                    <KeyValueRow label="Landlord Approval">
                      {property.require_landlord_approval
                        ? `Required (auto under ${formatCurrency(property.auto_approve_limit)})`
                        : 'Not required'}
                    </KeyValueRow>
                    <KeyValueRow label="Landlord">
                      {property.landlord_id ? (
                        <Link href={`/landlords/${property.landlord_id}`} className="text-primary hover:underline">{property.landlord_name}</Link>
                      ) : (
                        <span className="text-muted-foreground/50 font-normal">Not assigned</span>
                      )}
                    </KeyValueRow>
                    <KeyValueRow label="Emergency Contact">
                      {property.emergency_access_contact ? formatPhoneDisplay(property.emergency_access_contact) : <span className="text-muted-foreground/50 font-normal">None</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Access Instructions">
                      {property.access_instructions || <span className="text-muted-foreground/50 font-normal">None</span>}
                    </KeyValueRow>
                  </>
                )}
              </ProfileCard>
            </div>
          </TabsContent>

          {/* People Tab */}
          <TabsContent value="people" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Tenants */}
              <ProfileCard
                title="Tenants"
                count={tenants.length}
                action={
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
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
                      <div className="border-t border-border mt-1 pt-1">
                        <button type="button" onClick={() => setAddTenantOpen(true)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-primary/5 transition-colors text-left text-primary font-medium">
                          <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                          Create new tenant
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                }
              >
                {tenants.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">No tenants assigned</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {tenants.map((t) => (
                      isEditing ? (
                        <div key={t.id} className="flex items-center gap-3 py-2.5">
                          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate">
                              {t.full_name}
                              {!rooms.some(r => r.current_tenant_id === t.id) && (
                                <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Former</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(t.role_tag || 'tenant').replace(/_/g, ' ')}
                            </p>
                          </div>
                          <button type="button" onClick={() => setConfirmRemoveTenant(t)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Link key={t.id} href={`/tenants/${t.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors">
                          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Users className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate">
                              {t.full_name}
                              {!rooms.some(r => r.current_tenant_id === t.id) && (
                                <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Former</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(t.role_tag || 'tenant').replace(/_/g, ' ')}
                            </p>
                          </div>
                        </Link>
                      )
                    ))}
                  </div>
                )}
              </ProfileCard>

              {/* Contractors */}
              <ProfileCard
                title="Contractors"
                count={contractors.length}
                action={
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
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
                      <div className="border-t border-border mt-1 pt-1">
                        <button type="button" onClick={() => setAddContractorOpen(true)} className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-primary/5 transition-colors text-left text-primary font-medium">
                          <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                          Create new contractor
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                }
              >
                {contractors.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3">No contractors assigned</p>
                ) : (
                  <div className="divide-y divide-border/50">
                    {contractors.map((c) => (
                      isEditing ? (
                        <div key={c.id} className="flex items-center justify-between py-3 gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{c.contractor_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(c.categories || (c.category ? [c.category] : [])).join(', ')}
                              {c.contractor_phone && ` \u00b7 ${formatPhoneDisplay(c.contractor_phone)}`}
                            </p>
                          </div>
                          <button type="button" onClick={() => setConfirmRemoveContractor(c)} className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Link key={c.id} href={`/contractors/${c.id}`} className="flex items-center justify-between py-2.5 hover:bg-muted/30 -mx-3 px-3 rounded-lg transition-colors gap-4">
                          <span className="text-[13px] font-medium truncate">{c.contractor_name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {(c.categories || (c.category ? [c.category] : [])).join(', ')}
                          </span>
                        </Link>
                      )
                    ))}
                  </div>
                )}
              </ProfileCard>
              {/* Landlord detail card */}
              <ProfileCard
                title="Landlord"
                action={!property.landlord_id ? (
                  <Button variant="outline" size="sm" onClick={() => setAddLandlordOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                ) : undefined}
              >
                {property.landlord_id ? (
                  <>
                    <KeyValueRow label="Name">
                      <Link href={`/landlords/${property.landlord_id}`} className="text-primary hover:underline">{property.landlord_name}</Link>
                    </KeyValueRow>
                    <KeyValueRow label="Phone">
                      {property.landlord_phone ? formatPhoneDisplay(property.landlord_phone) : <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Email">
                      {property.landlord_email || <span className="text-muted-foreground/50 font-normal italic">Not set</span>}
                    </KeyValueRow>
                    <KeyValueRow label="Approval threshold">
                      {property.require_landlord_approval
                        ? `Auto under ${formatCurrency(property.auto_approve_limit)}`
                        : 'Not required'}
                    </KeyValueRow>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-3">No landlord linked to this property yet.</p>
                )}
              </ProfileCard>
            </div>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="mt-0">
            {propertyManager && (
              <div className="bg-card rounded-2xl border border-border p-6">
                <PropertyComplianceSection propertyId={propertyId} pmId={propertyManager.id} />
              </div>
            )}
          </TabsContent>

          {/* Rooms Tab */}
          <TabsContent value="rooms" className="mt-0">
            {propertyManager && (
              <div className="bg-card rounded-2xl border border-border p-6">
                <PropertyRoomsSection propertyId={propertyId} pmId={propertyManager.id} />
              </div>
            )}
          </TabsContent>

          {/* Rent Tab */}
          <TabsContent value="rent" className="mt-0">
            {propertyManager && (
              <div className="bg-card rounded-2xl border border-border p-6">
                <PropertyRentSection propertyId={propertyId} pmId={propertyManager.id} />
              </div>
            )}
          </TabsContent>

          {/* Tickets Tab */}
          <TabsContent value="tickets" className="mt-0">
            <div>
              <TicketCard tickets={tickets} />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <ConfirmDeleteDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} title="Delete Property" description="Are you sure you want to delete this property? This action cannot be undone." itemName={property.address} onConfirm={handleDelete} />

      {/* Confirm Remove: Tenant */}
      <ConfirmDeleteDialog
        open={!!confirmRemoveTenant}
        onOpenChange={(open) => { if (!open) setConfirmRemoveTenant(null) }}
        title="Remove Tenant"
        description={`Remove ${confirmRemoveTenant?.full_name || 'this tenant'} from ${property.address}? They won't be deleted — just unlinked from this property.`}
        itemName={confirmRemoveTenant?.full_name || undefined}
        onConfirm={async () => { if (confirmRemoveTenant) { await handleTenantRemove(confirmRemoveTenant.id); setConfirmRemoveTenant(null) } }}
      />

      {/* Confirm Remove: Contractor */}
      <ConfirmDeleteDialog
        open={!!confirmRemoveContractor}
        onOpenChange={(open) => { if (!open) setConfirmRemoveContractor(null) }}
        title="Remove Contractor"
        description={`Remove ${confirmRemoveContractor?.contractor_name || 'this contractor'} from ${property.address}? They won't be deleted — just unlinked from this property.`}
        itemName={confirmRemoveContractor?.contractor_name || undefined}
        onConfirm={async () => { if (confirmRemoveContractor) { await handleContractorToggle(confirmRemoveContractor.id); setConfirmRemoveContractor(null) } }}
      />

      {/* Inline Create: Tenant */}
      <Dialog open={addTenantOpen} onOpenChange={setAddTenantOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Tenant to {property.address}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Full Name <span className="text-destructive">*</span></label>
              <Input value={newTenant.full_name} onChange={(e) => setNewTenant((p) => ({ ...p, full_name: e.target.value }))} placeholder="John Smith" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Phone</label>
                <Input type="tel" value={newTenant.phone} onChange={(e) => setNewTenant((p) => ({ ...p, phone: e.target.value }))} placeholder="07700 900123" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                <Input type="email" value={newTenant.email} onChange={(e) => setNewTenant((p) => ({ ...p, email: e.target.value }))} placeholder="tenant@email.com" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTenantOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTenant} disabled={savingNewTenant}>
              {savingNewTenant && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Tenant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Create: Contractor */}
      <Dialog open={addContractorOpen} onOpenChange={setAddContractorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Contractor to {property.address}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Name <span className="text-destructive">*</span></label>
              <Input value={newContractor.contractor_name} onChange={(e) => setNewContractor((p) => ({ ...p, contractor_name: e.target.value }))} placeholder="Contractor name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Phone <span className="text-destructive">*</span></label>
                <Input type="tel" value={newContractor.contractor_phone} onChange={(e) => setNewContractor((p) => ({ ...p, contractor_phone: e.target.value }))} placeholder="07700 900123" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Trade</label>
                <Select value={newContractor.category} onValueChange={(v) => setNewContractor((p) => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select trade..." /></SelectTrigger>
                  <SelectContent>
                    {CONTRACTOR_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContractorOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateContractor} disabled={savingNewContractor}>
              {savingNewContractor && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Contractor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Create: Landlord */}
      <Dialog open={addLandlordOpen} onOpenChange={setAddLandlordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Landlord to {property.address}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Full Name <span className="text-destructive">*</span></label>
              <Input value={newLandlord.full_name} onChange={(e) => setNewLandlord((p) => ({ ...p, full_name: e.target.value }))} placeholder="Landlord name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Phone</label>
                <Input type="tel" value={newLandlord.phone} onChange={(e) => setNewLandlord((p) => ({ ...p, phone: e.target.value }))} placeholder="07700 900123" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1.5 block">Email</label>
                <Input type="email" value={newLandlord.email} onChange={(e) => setNewLandlord((p) => ({ ...p, email: e.target.value }))} placeholder="landlord@email.com" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1.5 block">Preferred Contact</label>
              <div className="flex rounded-lg border border-input overflow-hidden w-fit">
                <button type="button" onClick={() => setNewLandlord((p) => ({ ...p, contact_method: 'whatsapp' }))} className={`px-3 py-1.5 text-xs font-medium transition-colors ${newLandlord.contact_method === 'whatsapp' ? 'bg-success text-success-foreground' : 'bg-background hover:bg-muted'}`}>WhatsApp</button>
                <button type="button" onClick={() => setNewLandlord((p) => ({ ...p, contact_method: 'email' }))} className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-input ${newLandlord.contact_method === 'email' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>Email</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLandlordOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateLandlord} disabled={savingNewLandlord}>
              {savingNewLandlord && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Landlord
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Page wrapper with Suspense (required for useSearchParams) ---

export default function PropertyDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <PropertyDetailInner />
    </Suspense>
  )
}
