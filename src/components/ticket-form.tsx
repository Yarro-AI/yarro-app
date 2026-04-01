'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Combobox } from '@/components/ui/combobox'
import { MultiCombobox } from '@/components/ui/multi-combobox'
import { CONTRACTOR_CATEGORIES, TICKET_PRIORITIES, PRIORITY_DESCRIPTIONS } from '@/lib/constants'
import { normalizeRecord, validateTenant, validateContractor, hasErrors } from '@/lib/normalize'
import { Loader2, CheckCircle2, AlertTriangle, ClipboardList, Plus, ImagePlus, X, Phone, Mail, MessageSquare, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { ChatHistory } from '@/components/chat-message'

interface Property {
  id: string
  address: string
}

interface Tenant {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  property_id: string
}

interface ConversationMessage {
  direction: 'in' | 'out' | 'inbound' | 'outbound'
  message: string
  timestamp: string
  label?: string
}

interface Contractor {
  id: string
  contractor_name: string
  category: string
  categories: string[] | null
  property_ids: string[] | null
}

interface TicketFormData {
  property_id: string
  tenant_id: string
  issue_description: string
  category: string
  priority: string
  contractor_ids: string[]       // Array, required, ORDERED
  availability: string           // Optional
  access: string                 // Optional
  images: string[]               // Array of image URLs
}

interface PrefillData extends Partial<TicketFormData> {
  contractor_id?: string | null  // Legacy support
  conversation_id?: string       // For handoff tickets
}

interface TicketFormProps {
  open?: boolean                  // Sheet control — when provided, form renders inside Sheet
  onClose?: () => void            // Sheet close handler
  initialData?: PrefillData      // Legacy support
  prefill?: PrefillData          // Alias for initialData (clearer naming)
  onSubmit?: (data: TicketFormData) => Promise<void>  // External handler
  onSuccess?: () => void         // Simple callback when form handles creation
  onCancel?: () => void          // Close handler for non-Sheet usage (dashboard)
  onDismiss?: () => void         // Archive/dismiss handoff without completing
  onAllocateLandlord?: () => void // Allocate ticket to landlord instead of dispatching
  ticketId?: string | null       // Existing ticket ID (review/handoff mode)
  submitLabel?: string
  isHandoff?: boolean            // Visual styling for handoff tickets
  isReview?: boolean             // Visual styling for review mode tickets
}

const CATEGORY_OPTIONS = CONTRACTOR_CATEGORIES.map((c) => ({
  value: c,
  label: c,
}))

const PRIORITY_OPTIONS = TICKET_PRIORITIES.map((p) => ({
  value: p,
  label: p.charAt(0) + p.slice(1).toLowerCase(),
}))

export function TicketForm({
  open,
  onClose,
  initialData,
  prefill,
  onSubmit,
  onSuccess,
  onCancel,
  onDismiss,
  onAllocateLandlord,
  ticketId,
  submitLabel = 'Create Ticket',
  isHandoff = false,
  isReview = false,
}: TicketFormProps) {
  const { propertyManager } = usePM()
  const supabase = createClient()

  // Merge initialData and prefill (prefill takes precedence)
  const mergedPrefill = { ...initialData, ...prefill }

  // Default label based on mode
  const finalSubmitLabel = submitLabel || (isHandoff ? 'Create & Dispatch' : 'Create Ticket')

  // Convert legacy contractor_id to contractor_ids array if present
  const initialContractorIds = mergedPrefill?.contractor_ids ||
    (mergedPrefill?.contractor_id ? [mergedPrefill.contractor_id] : [])

  const [formData, setFormData] = useState<TicketFormData>({
    property_id: mergedPrefill?.property_id || '',
    tenant_id: mergedPrefill?.tenant_id || '',
    issue_description: mergedPrefill?.issue_description || '',
    category: mergedPrefill?.category || '',
    priority: mergedPrefill?.priority || 'Medium',
    contractor_ids: initialContractorIds,
    availability: mergedPrefill?.availability || '',
    access: mergedPrefill?.access || '',
    images: mergedPrefill?.images || [],
  })

  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([])
  const [filteredContractors, setFilteredContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Add New modals
  const [addTenantOpen, setAddTenantOpen] = useState(false)
  const [addContractorOpen, setAddContractorOpen] = useState(false)
  const [newTenant, setNewTenant] = useState({ full_name: '', phone: '', email: '' })
  const [newContractor, setNewContractor] = useState({ contractor_name: '', contractor_phone: '', category: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0) // Force input reset
  const [conversationLog, setConversationLog] = useState<ConversationMessage[]>([])
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [landlordName, setLandlordName] = useState<string | null>(null)
  const [landlordPhone, setLandlordPhone] = useState<string | null>(null)
  const [allocatingLandlord, setAllocatingLandlord] = useState(false)

  // Fetch properties, tenants, and contractors
  useEffect(() => {
    if (!propertyManager) return

    const fetchData = async () => {
      setLoading(true)

      const [propsRes, tenantsRes, contractorsRes] = await Promise.all([
        supabase
          .from('c1_properties')
          .select('id, address')
          .eq('property_manager_id', propertyManager.id)
          .order('address'),
        supabase
          .from('c1_tenants')
          .select('id, full_name, phone, email, property_id')
          .eq('property_manager_id', propertyManager.id)
          .order('full_name'),
        supabase
          .from('c1_contractors')
          .select('id, contractor_name, category, categories, property_ids')
          .eq('property_manager_id', propertyManager.id)
          .eq('active', true)
          .order('category')
          .order('contractor_name'),
      ])

      if (propsRes.data) setProperties(propsRes.data)
      if (tenantsRes.data) setTenants(tenantsRes.data)
      if (contractorsRes.data) setContractors(contractorsRes.data)

      setLoading(false)
    }

    fetchData()
  }, [propertyManager, supabase])

  // Filter tenants by selected property
  useEffect(() => {
    if (formData.property_id) {
      setFilteredTenants(tenants.filter((t) => t.property_id === formData.property_id))
    } else {
      setFilteredTenants([])
    }
    // Reset tenant if property changes
    if (formData.tenant_id && tenants.length > 0) {
      const validTenant = tenants.find(
        (t) => t.id === formData.tenant_id && t.property_id === formData.property_id
      )
      if (!validTenant) {
        setFormData((prev) => ({ ...prev, tenant_id: '' }))
      }
    }
  }, [formData.property_id, tenants, formData.tenant_id])

  // Fetch landlord for selected property (review/handoff mode)
  useEffect(() => {
    if (!formData.property_id || (!isReview && !isHandoff)) {
      setLandlordName(null)
      setLandlordPhone(null)
      return
    }
    const fetchLandlord = async () => {
      const { data } = await supabase
        .from('c1_properties')
        .select('landlord_id, c1_landlords(full_name, phone)')
        .eq('id', formData.property_id)
        .single()
      if (data?.c1_landlords) {
        const ll = data.c1_landlords as unknown as { full_name: string | null; phone: string | null }
        setLandlordName(ll.full_name)
        setLandlordPhone(ll.phone)
      } else {
        setLandlordName(null)
        setLandlordPhone(null)
      }
    }
    fetchLandlord()
  }, [formData.property_id, isReview, isHandoff, supabase])

  // Show ALL contractors (no property constraint) — manual tickets need flexibility
  // Sort order: property-assigned + category match first, then property-assigned, then others
  useEffect(() => {
    const isPropertyAssigned = (c: Contractor) =>
      c.property_ids === null || (formData.property_id && c.property_ids?.includes(formData.property_id))
    const isCategoryMatch = (c: Contractor) =>
      formData.category && (c.categories?.some(cat => cat.toLowerCase() === formData.category.toLowerCase()) || c.category?.toLowerCase() === formData.category.toLowerCase())

    // Sort: property-assigned first, then category matches, then alphabetically
    const sorted = [...contractors].sort((a, b) => {
      const aProp = isPropertyAssigned(a) ? 0 : 1
      const bProp = isPropertyAssigned(b) ? 0 : 1
      if (aProp !== bProp) return aProp - bProp
      const aCat = isCategoryMatch(a) ? 0 : 1
      const bCat = isCategoryMatch(b) ? 0 : 1
      if (aCat !== bCat) return aCat - bCat
      return a.contractor_name.localeCompare(b.contractor_name)
    })
    setFilteredContractors(sorted)
  }, [contractors, formData.property_id, formData.category])

  // Fetch conversation log for handoff tickets
  useEffect(() => {
    const convId = mergedPrefill?.conversation_id
    if ((!isHandoff && !isReview) || !convId) return

    const fetchConversation = async () => {
      setLoadingConversation(true)
      const { data } = await supabase
        .from('c1_conversations')
        .select('log')
        .eq('id', convId)
        .single()

      if (data?.log) {
        setConversationLog(
          (data.log as ConversationMessage[]).filter((m) => m.message)
        )
      }
      setLoadingConversation(false)
    }
    fetchConversation()
  }, [isHandoff, isReview, mergedPrefill?.conversation_id, supabase])

  // Helper to check if contractor is assigned to current property
  const isAssignedToProperty = (c: Contractor) =>
    c.property_ids === null || (formData.property_id && c.property_ids?.includes(formData.property_id))


  const updateField = useCallback((field: keyof TicketFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }, [])

  // Image upload handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploadingImages(true)
    const uploadedUrls: string[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast.error(`${file.name} is not an image`)
          continue
        }
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is too large (max 5MB)`)
          continue
        }

        // Generate unique filename
        const ext = file.name.split('.').pop() || 'jpg'
        const filename = `manual/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('ticket-images')
          .upload(filename, file)

        if (uploadError) {
          const errorMsg = uploadError.message || 'Unknown error'
          toast.error(`Failed to upload ${file.name}: ${errorMsg}`)
          console.error('Upload error:', uploadError)
          continue
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('ticket-images')
          .getPublicUrl(filename)

        if (urlData?.publicUrl) {
          uploadedUrls.push(urlData.publicUrl)
        }
      }

      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, ...uploadedUrls]
        }))
        toast.success(`${uploadedUrls.length} image(s) uploaded`)
      }
    } catch (err) {
      console.error('Image upload error:', err)
      toast.error('Failed to upload images')
    } finally {
      setUploadingImages(false)
      // Force file input to reset by changing key
      setFileInputKey(prev => prev + 1)
    }
  }

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }))
  }

  // Add new tenant handler
  const handleAddTenant = async () => {
    const errors = validateTenant({
      full_name: newTenant.full_name,
      phone: newTenant.phone,
      email: newTenant.email || null,
      property_id: formData.property_id,
    })
    if (hasErrors(errors)) {
      setError(Object.values(errors).filter(Boolean).join(', '))
      return
    }

    setSavingNew(true)
    try {
      const normalized = normalizeRecord('tenants', {
        full_name: newTenant.full_name,
        phone: newTenant.phone,
        email: newTenant.email || null,
      })

      const { data, error: insertError } = await supabase
        .from('c1_tenants')
        .insert({
          ...normalized,
          role_tag: 'tenant',
          property_id: formData.property_id,
          property_manager_id: propertyManager!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      // Add to local state and select it
      const newT: Tenant = {
        id: data.id,
        full_name: newTenant.full_name,
        phone: newTenant.phone || null,
        email: newTenant.email || null,
        property_id: formData.property_id,
      }
      setTenants((prev) => [...prev, newT])
      setFormData((prev) => ({ ...prev, tenant_id: data.id }))
      setAddTenantOpen(false)
      setNewTenant({ full_name: '', phone: '', email: '' })
      toast.success('Tenant added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tenant')
    } finally {
      setSavingNew(false)
    }
  }

  // Add new contractor handler
  const handleAddContractor = async () => {
    const errors = validateContractor({
      contractor_name: newContractor.contractor_name,
      contractor_phone: newContractor.contractor_phone,
      contractor_email: null,
      category: newContractor.category,
    })
    if (hasErrors(errors)) {
      setError(Object.values(errors).filter(Boolean).join(', '))
      return
    }

    setSavingNew(true)
    try {
      const normalized = normalizeRecord('contractors', {
        contractor_name: newContractor.contractor_name,
        contractor_phone: newContractor.contractor_phone,
        contractor_email: null,
      })

      const { data, error: insertError } = await supabase
        .from('c1_contractors')
        .insert({
          ...normalized,
          category: newContractor.category,
          categories: [newContractor.category],
          active: true,
          property_ids: formData.property_id ? [formData.property_id] : null,
          property_manager_id: propertyManager!.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      // Add to local state and select it
      const newC: Contractor = {
        id: data.id,
        contractor_name: newContractor.contractor_name,
        category: newContractor.category,
        categories: [newContractor.category],
        property_ids: formData.property_id ? [formData.property_id] : null,
      }
      setContractors((prev) => [...prev, newC])
      setFormData((prev) => ({ ...prev, contractor_ids: [...prev.contractor_ids, data.id] }))
      setAddContractorOpen(false)
      setNewContractor({ contractor_name: '', contractor_phone: '', category: '' })
      toast.success('Contractor added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contractor')
    } finally {
      setSavingNew(false)
    }
  }

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.property_id) {
      setError('Please select a property')
      return
    }
    if (!formData.issue_description.trim()) {
      setError('Please describe the issue')
      return
    }
    if (!formData.category) {
      setError('Please select a category')
      return
    }
    if (formData.contractor_ids.length === 0) {
      setError('Please select at least one contractor')
      return
    }

    setSubmitting(true)
    setError(null)

    const formatted = formData

    try {
      // If onSubmit provided, use external handler
      if (onSubmit) {
        await onSubmit(formatted)
        return
      }

      // Otherwise handle ticket creation internally (for handoff flow)
      const conversationId = mergedPrefill?.conversation_id

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('c1_tickets')
        .insert({
          property_id: formatted.property_id,
          tenant_id: formatted.tenant_id || null,
          issue_description: formatted.issue_description,
          category: formatted.category,
          priority: formatted.priority,
          availability: formatted.availability || null,
          access: formatted.access || null,
          status: 'OPEN',
          job_stage: 'logged',
          handoff: false,  // No longer a handoff once we create the ticket
          conversation_id: conversationId || null,
          property_manager_id: propertyManager!.id,
          date_logged: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (ticketError) throw ticketError

      // Create messages entry for dispatcher
      const firstContractor = contractors.find(c => c.id === formatted.contractor_ids[0])
      const { error: msgError } = await supabase
        .from('c1_messages')
        .insert({
          ticket_id: ticket.id,
          stage: 'contractor_notified',
          contractor_id: formatted.contractor_ids[0],
          contractor_queue: formatted.contractor_ids,
          contractor_queue_index: 0,
          property_manager_id: propertyManager!.id,
        })

      if (msgError) throw msgError

      // If there was a conversation, mark it as processed (close it)
      if (conversationId) {
        await supabase
          .from('c1_conversations')
          .update({ status: 'closed' })
          .eq('id', conversationId)
      }

      // Trigger dispatcher webhook to send SMS to contractor
      const property = properties.find(p => p.id === formatted.property_id)
      const tenant = formatted.tenant_id ? tenants.find(t => t.id === formatted.tenant_id) : null

      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/yarro-dispatcher`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: 'contractor-sms',
            ticket_id: ticket.id,
            contractor_id: formatted.contractor_ids[0],
            contractor_name: firstContractor?.contractor_name,
            issue_description: formatted.issue_description,
            category: formatted.category,
            priority: formatted.priority,
            address: property?.address,
            tenant_name: tenant?.full_name || null,
            availability: formatted.availability,
            access: formatted.access,
          }),
        })
      } catch (webhookErr) {
        console.error('Dispatcher webhook failed:', webhookErr)
        // Don't fail the whole operation if webhook fails
        toast.error('Ticket created but contractor notification may be delayed')
      }

      toast.success('Ticket created and contractor notified')
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
      setSubmitting(false)
    }
  }

  // Shared form body — fields + indicators
  const formFields = (
    <>
      {/* Handoff indicator */}
      {isHandoff && formData.priority === 'Emergency' && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-bold text-red-800 uppercase tracking-wide">EMERGENCY</p>
            <p className="text-xs text-red-700 mt-0.5">
              This conversation was flagged as an emergency. Review urgently and dispatch immediately.
            </p>
          </div>
        </div>
      )}
      {isHandoff && formData.priority !== 'Emergency' && (
        <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-red-800">Manual Review Required</p>
            <p className="text-xs text-red-700 mt-0.5">
              This conversation was handed off because it couldn&apos;t be fully automated.
              Please verify tenant details, review the issue description, and check any photos before dispatching.
            </p>
          </div>
        </div>
      )}

      {/* Conversation thread for handoff/review tickets — collapsible */}
      {(isHandoff || isReview) && (conversationLog.length > 0 || loadingConversation) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setShowConversation(!showConversation)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {showConversation ? 'Hide Conversation' : 'View Conversation'}
            </Button>
            {conversationLog.length > 0 && conversationLog[0].timestamp && (
              <span className="text-xs text-muted-foreground">
                Reported {format(new Date(conversationLog[0].timestamp), 'dd MMM, HH:mm')}
              </span>
            )}
          </div>
          {showConversation && loadingConversation && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading conversation...
            </div>
          )}
          {showConversation && conversationLog.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl bg-muted/30 p-4">
              <ChatHistory
                compact
                messages={conversationLog
                  .filter((msg) => msg.label !== 'HANDOFF')
                  .map((msg) => ({
                    role: (msg.direction === 'in' || msg.direction === 'inbound') ? 'tenant' : 'assistant',
                    text: msg.message,
                    timestamp: msg.timestamp,
                  }))}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Two column grid — CSS Grid with row-span for Issue Description */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 items-start">
        {/* Row 1 left: Property */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Property <span className="text-destructive">*</span>
          </label>
          <Combobox
            options={properties.map((p) => ({ value: p.id, label: p.address }))}
            value={formData.property_id}
            onValueChange={(v) => updateField('property_id', v)}
            placeholder="Search properties..."
            searchPlaceholder="Type to search..."
            emptyText="No properties found"
          />
        </div>

        {/* Row 1-2 right: Issue Description (tall, spans 2 rows) */}
        <div className="space-y-1.5 row-span-2">
          <label className="text-sm font-medium">
            Issue Description <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={formData.issue_description}
            onChange={(e) => updateField('issue_description', e.target.value)}
            placeholder="Describe the maintenance issue..."
            className="min-h-[120px]"
            rows={5}
          />
        </div>

        {/* Row 2 left: Tenant */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tenant</label>
          <Combobox
            options={filteredTenants.map((t) => ({ value: t.id, label: t.full_name }))}
            value={formData.tenant_id}
            onValueChange={(v) => updateField('tenant_id', v)}
            placeholder={formData.property_id ? 'Search tenants...' : 'Select property first'}
            searchPlaceholder="Type to search..."
            emptyText="No tenants found"
            disabled={!formData.property_id}
            onAddNew={formData.property_id ? () => setAddTenantOpen(true) : undefined}
            addNewLabel="Add new tenant"
          />
          {formData.property_id && filteredTenants.length === 0 && (
            <p className="text-xs text-amber-600">No tenants at this property. Click to add one.</p>
          )}
          {(isHandoff || isReview) && formData.tenant_id && (() => {
            const tenant = tenants.find(t => t.id === formData.tenant_id)
            if (!tenant) return null
            return (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {tenant.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {tenant.phone}
                  </span>
                )}
                {tenant.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {tenant.email}
                  </span>
                )}
              </div>
            )
          })()}
        </div>

        {/* Row 3 left: Category + Priority */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Category <span className="text-destructive">*</span>
            </label>
            <Select
              value={formData.category}
              onValueChange={(v) => updateField('category', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Priority <span className="text-destructive">*</span>
            </label>
            <Select
              value={formData.priority}
              onValueChange={(v) => updateField('priority', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} description={PRIORITY_DESCRIPTIONS[opt.value]}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3 right: Tenant Availability */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tenant Availability</label>
          <Input
            value={formData.availability}
            onChange={(e) => updateField('availability', e.target.value)}
            placeholder="e.g., Weekdays after 5pm"
          />
        </div>

        {/* Row 4 left: Contractors */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            Contractors <span className="text-destructive">*</span>
          </label>
          <MultiCombobox
            options={filteredContractors.map((c) => {
              const isCategoryMatch = formData.category && (c.categories?.some(cat => cat.toLowerCase() === formData.category.toLowerCase()) || c.category?.toLowerCase() === formData.category.toLowerCase())
              const isPropertyAssigned = isAssignedToProperty(c)
              const displayCats = c.categories?.length ? c.categories.join(', ') : c.category
              return {
                value: c.id,
                label: c.contractor_name,
                description: displayCats,
                badge: isCategoryMatch ? 'Match' : (!isPropertyAssigned && formData.property_id ? 'Not assigned' : undefined),
                badgeVariant: isCategoryMatch ? 'success' as const : (!isPropertyAssigned && formData.property_id ? 'warning' as const : 'default' as const),
              }
            })}
            values={formData.contractor_ids}
            onValuesChange={(values) => updateField('contractor_ids', values)}
            placeholder="Search contractors..."
            searchPlaceholder="Type to search..."
            emptyText="No contractors found"
            onAddNew={() => setAddContractorOpen(true)}
            addNewLabel="Add new contractor"
          />
          <p className="text-xs text-muted-foreground">
            First selected = contacted immediately, others after {Math.round((propertyManager?.contractor_timeout_minutes || 360) / 60)}h if no response.
          </p>
        </div>

        {/* Row 4 right: Access Details */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Access Details</label>
          <Input
            value={formData.access}
            onChange={(e) => updateField('access', e.target.value)}
            placeholder="e.g., Gate code 1234, key under mat"
          />
        </div>

        {/* Category mismatch warning — full width */}
        {formData.category && formData.contractor_ids.length > 0 && (() => {
          const mismatchedContractors = formData.contractor_ids
            .map(id => contractors.find(c => c.id === id))
            .filter(c => c && !(c.categories?.some(cat => cat.toLowerCase() === formData.category.toLowerCase()) || c.category?.toLowerCase() === formData.category.toLowerCase())) as Contractor[]
          if (mismatchedContractors.length === 0) return null
          return (
            <div className="col-span-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Category mismatch</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Job category is <span className="font-medium">&quot;{formData.category}&quot;</span> but{' '}
                    {mismatchedContractors.length === 1 ? (
                      <>
                        <span className="font-medium">{mismatchedContractors[0].contractor_name}</span> specialises in{' '}
                        <span className="font-medium">&quot;{(mismatchedContractors[0].categories || [mismatchedContractors[0].category]).join(', ')}&quot;</span>
                      </>
                    ) : (
                      <>
                        {mismatchedContractors.map((c, i) => (
                          <span key={c.id}>
                            {i > 0 && (i === mismatchedContractors.length - 1 ? ' and ' : ', ')}
                            <span className="font-medium">{c.contractor_name}</span> ({(c.categories || [c.category]).join(', ')})
                          </span>
                        ))}
                        {' '}don&apos;t match
                      </>
                    )}.
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Check this is intentional before proceeding.
                  </p>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Photos — full width */}
        <div className="col-span-2 space-y-1.5">
          <label className="text-sm font-medium">Photos</label>
          <div className="flex flex-wrap gap-2">
            {formData.images.map((url, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={url}
                  alt={`Upload ${idx + 1}`}
                  className={`object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${(isHandoff || isReview) ? 'w-28 h-28' : 'w-16 h-16'}`}
                  onClick={() => window.open(url, '_blank')}
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
              {uploadingImages ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              )}
              <input
                key={fileInputKey}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={uploadingImages}
                className="sr-only"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Add photos of the issue (max 5MB each)
          </p>
        </div>
      </div>
    </>
  )

  // Shared footer — action buttons
  const formFooter = (
    <div className="flex items-center gap-3">
      {(isReview || isHandoff) && landlordName && landlordPhone && ticketId && (
        <Button
          size="sm"
          variant="outline"
          className="border-purple-400 text-purple-700 hover:bg-purple-100 gap-1.5"
          disabled={allocatingLandlord || submitting}
          onClick={async () => {
            setAllocatingLandlord(true)
            const { data, error } = await supabase.rpc('c1_allocate_to_landlord', { p_ticket_id: ticketId })
            if (error) {
              toast.error(error.message || 'Failed to allocate to landlord')
              setAllocatingLandlord(false)
              return
            }
            toast.success(`Allocated to ${landlordName}`)
            setAllocatingLandlord(false)
            onAllocateLandlord?.()
          }}
        >
          {allocatingLandlord ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Building2 className="h-3.5 w-3.5" /> Allocate to Landlord</>}
        </Button>
      )}
      <div className="flex-1" />
      {(isHandoff || isReview) && onDismiss && (
        <InteractiveHoverButton
          text="Dismiss"
          variant="secondary"
          onClick={onDismiss}
          disabled={submitting || allocatingLandlord}
          size="sm"
        />
      )}
      <InteractiveHoverButton
        text={submitting ? 'Creating...' : finalSubmitLabel}
        onClick={handleSubmit}
        disabled={submitting || allocatingLandlord}
      />
    </div>
  )

  // Shared inline dialogs
  const inlineDialogs = (
    <>
      {/* Add Tenant Dialog */}
      <Dialog open={addTenantOpen} onOpenChange={setAddTenantOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription>
              Add a new tenant to the selected property.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 px-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Full Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={newTenant.full_name}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={newTenant.phone}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="07700 900123"
              />
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={newTenant.email}
                onChange={(e) => setNewTenant((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="tenant@email.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTenantOpen(false)} disabled={savingNew}>
              Cancel
            </Button>
            <InteractiveHoverButton
              text={savingNew ? 'Adding...' : 'Add Tenant'}
              onClick={handleAddTenant}
              disabled={savingNew}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contractor Dialog */}
      <Dialog open={addContractorOpen} onOpenChange={setAddContractorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Contractor</DialogTitle>
            <DialogDescription>
              This contractor will be assigned to the selected property only. You can edit their properties later in the Contractors section.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 px-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={newContractor.contractor_name}
                onChange={(e) => setNewContractor((prev) => ({ ...prev, contractor_name: e.target.value }))}
                placeholder="ABC Plumbing"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Phone <span className="text-destructive">*</span>
              </label>
              <Input
                type="tel"
                value={newContractor.contractor_phone}
                onChange={(e) => setNewContractor((prev) => ({ ...prev, contractor_phone: e.target.value }))}
                placeholder="07700 900123"
              />
              <p className="text-xs text-muted-foreground">UK mobile format</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Category <span className="text-destructive">*</span>
              </label>
              <Select
                value={newContractor.category}
                onValueChange={(v) => setNewContractor((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContractorOpen(false)} disabled={savingNew}>
              Cancel
            </Button>
            <InteractiveHoverButton
              text={savingNew ? 'Adding...' : 'Add Contractor'}
              onClick={handleAddContractor}
              disabled={savingNew}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )

  // Sheet mode — self-contained drawer
  if (open != null && onClose) {
    return (
      <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <SheetContent
          side="right"
          hideCloseButton={true}
          title={isReview ? 'Review & Dispatch' : isHandoff ? 'Complete Ticket' : 'New Ticket'}
          className="w-[50vw] min-w-[600px] max-w-none p-0 flex flex-col overflow-x-hidden"
        >
          {/* Header */}
          <div className="border-b border-border/40 px-6 py-5 flex-shrink-0 flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold text-foreground leading-snug">
              {isReview ? 'Review & Dispatch' : isHandoff ? 'Complete Ticket' : 'New Ticket'}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="-mt-1 -mr-2 flex-shrink-0 h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Scrollable form body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
                {formFields}
              </div>

              {/* Pinned footer */}
              <div className="border-t border-border/40 px-6 py-4 flex-shrink-0">
                {formFooter}
              </div>
            </>
          )}

          {inlineDialogs}
        </SheetContent>
      </Sheet>
    )
  }

  // Fallback — plain div wrapper (dashboard still uses this path)
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {formFields}

      {/* Footer */}
      <div className="pt-4 border-t">
        {formFooter}
      </div>

      {inlineDialogs}
    </div>
  )
}
