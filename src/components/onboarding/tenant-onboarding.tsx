'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, SkipForward, Users, Upload, MessageCircle, Mail, Send, CheckCircle, ExternalLink } from 'lucide-react'
import { BulkImportDialog } from '@/components/bulk-import/bulk-import-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

// Keep OptionButton consistent with account-card.tsx onboarding style
function OnboardingOptionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-center px-5 py-5 rounded-xl border transition-all bg-transparent border-border/60 text-foreground hover:border-primary/30"
    >
      <span className="text-lg font-medium">{label}</span>
    </button>
  )
}
import { typography } from '@/lib/typography'

interface Room {
  id: string
  room_name: string
  room_number: string
}

interface TenantEntry {
  room_id: string
  room_name: string
  name: string
  contactMethod: 'whatsapp' | 'email'
  phone: string
  email: string
  skipped: boolean
}

type Step = 'name' | 'contact-method' | 'contact-detail'
type Stage = 'intro' | 'rooms' | 'summary'

export function TenantOnboarding() {
  const { propertyManager, refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [refetchKey, setRefetchKey] = useState(0)

  const [onboardDialogOpen, setOnboardDialogOpen] = useState(false)
  const [onboardSending, setOnboardSending] = useState(false)
  const [onboardSent, setOnboardSent] = useState(false)

  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [propertyAddress, setPropertyAddress] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [entries, setEntries] = useState<TenantEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [step, setStep] = useState<Step>('name')
  const [stage, setStage] = useState<Stage>('intro')

  // Fetch first property + its rooms
  useEffect(() => {
    if (!propertyManager) return

    async function fetchData() {
      const { data: props } = await supabase
        .from('c1_properties')
        .select('id, address')
        .eq('property_manager_id', propertyManager!.id)
        .order('created_at', { ascending: true })
        .limit(1)

      if (!props || props.length === 0) {
        setLoading(false)
        return
      }

      const prop = props[0]
      setPropertyId(prop.id)
      setPropertyAddress(prop.address)

      const { data: roomData } = await supabase.rpc('get_rooms_for_property', {
        p_property_id: prop.id,
        p_pm_id: propertyManager!.id,
      })

      if (roomData) {
        const sortedRooms = (roomData as Room[]).sort((a, b) =>
          a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
        )
        setRooms(sortedRooms)
        setEntries(sortedRooms.map(r => ({
          room_id: r.id,
          room_name: r.room_name || `Room ${r.room_number}`,
          name: '',
          contactMethod: 'whatsapp',
          phone: '',
          email: '',
          skipped: false,
        })))
      }

      setLoading(false)
    }

    fetchData()
  }, [propertyManager, supabase, refetchKey])

  const current = entries[currentIndex]
  const isLast = currentIndex === entries.length - 1
  const filledCount = entries.filter(e => !e.skipped && e.name.trim()).length
  const isSingleLet = rooms.length === 1

  const updateField = <K extends keyof TenantEntry>(field: K, value: TenantEntry[K]) => {
    setEntries(prev => prev.map((e, i) =>
      i === currentIndex ? { ...e, [field]: value } : e
    ))
  }

  const handleNameNext = () => {
    if (!current.name.trim()) {
      setError('Enter a name or mark as vacant')
      return
    }
    setError(null)
    setStep('contact-method')
  }

  const handleContactMethodSelect = (method: 'whatsapp' | 'email') => {
    updateField('contactMethod', method)
    setStep('contact-detail')
  }

  const handleContactDetailNext = () => {
    if (current.contactMethod === 'whatsapp') {
      if (!current.phone.trim()) {
        setError('Enter their WhatsApp number')
        return
      }
      if (!isValidUKPhone(current.phone)) {
        setError('Enter a valid UK phone number')
        return
      }
    } else {
      if (!current.email.trim()) {
        setError('Enter their email address')
        return
      }
    }
    setError(null)
    advanceToNextRoom()
  }

  const advanceToNextRoom = () => {
    if (isLast) {
      handleSubmit()
    } else {
      setCurrentIndex(currentIndex + 1)
      setStep('name')
    }
  }

  const handleSkip = () => {
    setEntries(prev => prev.map((e, i) =>
      i === currentIndex ? { ...e, skipped: true, name: '', phone: '', email: '' } : e
    ))
    setError(null)
    if (isLast) {
      handleSubmit()
    } else {
      setCurrentIndex(currentIndex + 1)
      setStep('name')
    }
  }

  const handleBack = () => {
    if (step === 'contact-detail') {
      setStep('contact-method')
      setError(null)
    } else if (step === 'contact-method') {
      setStep('name')
      setError(null)
    } else if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setStep('name')
      setError(null)
    } else {
      setStage('intro')
    }
  }

  const handleSubmit = async () => {
    if (!propertyId || !propertyManager) return

    const tenantsToCreate = entries
      .filter(e => !e.skipped && e.name.trim())
      .map(e => ({
        room_id: e.room_id,
        name: e.name.trim(),
        phone: e.contactMethod === 'whatsapp' ? normalizePhone(e.phone) : '',
        email: e.contactMethod === 'email' ? e.email.trim().toLowerCase() : '',
      }))

    if (tenantsToCreate.length === 0) {
      handleDismiss()
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { error: rpcError } = await supabase.rpc('onboarding_create_tenants', {
        p_pm_id: propertyManager.id,
        p_property_id: propertyId,
        p_tenants: tenantsToCreate,
      })

      if (rpcError) {
        setError(rpcError.message)
        setSaving(false)
        return
      }

      toast.success(`${tenantsToCreate.length} tenant${tenantsToCreate.length > 1 ? 's' : ''} added`)
      setStage('summary')
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const whatsappTenants = entries.filter(e => !e.skipped && e.name.trim() && e.contactMethod === 'whatsapp' && e.phone.trim())

  const handleSendOnboarding = async () => {
    if (!propertyManager) return
    setOnboardSending(true)

    try {
      // Fetch the tenant IDs that were just created (match by phone + PM)
      const phones = whatsappTenants.map(e => normalizePhone(e.phone))
      const { data: tenants } = await supabase
        .from('c1_tenants')
        .select('id')
        .eq('property_manager_id', propertyManager.id)
        .in('phone', phones)

      if (!tenants || tenants.length === 0) {
        toast.error('No matching tenants found')
        setOnboardSending(false)
        return
      }

      const { data, error: fnError } = await supabase.functions.invoke('yarro-onboarding-send', {
        body: {
          entity_type: 'tenant',
          entity_ids: tenants.map(t => t.id),
          pm_id: propertyManager.id,
        },
      })

      if (fnError) {
        toast.error(`Failed to send: ${fnError.message}`)
      } else {
        const resp = data as { sent: number; failed: number; warning?: string }
        if (resp.warning) {
          toast.warning(resp.warning)
        } else if (resp.sent > 0) {
          toast.success(`Sent ${resp.sent} onboarding message${resp.sent > 1 ? 's' : ''}`)
        }
        setOnboardSent(true)
      }
    } catch {
      toast.error('Failed to send onboarding messages')
    } finally {
      setOnboardSending(false)
      setOnboardDialogOpen(false)
    }
  }

  const handleDismiss = async () => {
    await refreshPM()
    setDismissing(true)
    setTimeout(() => {
      router.push('/')
    }, 600)
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <Loader2 className="w-6 h-6 animate-spin text-white" />
      </div>
    )
  }

  if (rooms.length === 0) return null

  const streetAddress = propertyAddress.split(',')[0]

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing ? 'bg-black/0 backdrop-blur-0' : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-lg px-4 transition-all duration-500 ${
          dismissing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Intro card */}
        {stage === 'intro' && (
          <div className="bg-card rounded-2xl border border-border p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h2 className={`${typography.pageTitle} text-center`}>
              Who lives at {streetAddress}?
            </h2>
            <p className={`${typography.bodyText} text-center mt-3 mb-8 max-w-xs mx-auto`}>
              {isSingleLet
                ? 'Add your tenant so Yarro can manage communications.'
                : `Add tenants to your ${rooms.length} rooms. You can skip any that are vacant.`
              }
            </p>
            <Button onClick={() => setStage('rooms')} size="lg" className="w-full">
              Start now
            </Button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center justify-center gap-2 mt-6 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Upload className="w-4 h-4" />
              Bulk upload from CSV
            </button>
            <BulkImportDialog
              entityType="tenants"
              open={importOpen}
              onOpenChange={setImportOpen}
              onComplete={() => window.location.reload()}
            />
          </div>
        )}

        {/* Room-by-room cards */}
        {stage === 'rooms' && current && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            {/* Header: back + progress + vacant */}
            <div className="flex items-center px-6 pt-6 pb-2">
              <button
                onClick={handleBack}
                className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1">
                <RoomProgress current={currentIndex + 1} entries={entries} />
              </div>
              {step === 'name' && !current.skipped ? (
                <button
                  onClick={handleSkip}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-8" />
              )}
            </div>

            <div className="px-10 pb-10 pt-4">
              {/* Step: Name */}
              {step === 'name' && !current.skipped && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    {isSingleLet
                      ? "Who's your tenant?"
                      : `Who stays in ${current.room_name}?`
                    }
                  </h2>
                  <div className="mt-8">
                    <Input
                      value={current.name}
                      onChange={(e) => updateField('name', e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                      placeholder="Full name"
                      className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNameNext() } }}
                    />
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button onClick={handleNameNext} className="w-full mt-8" size="lg">
                    Continue
                  </Button>
                </>
              )}

              {/* Step: Contact method */}
              {step === 'contact-method' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    How should we contact {current.name.split(' ')[0]}?
                  </h2>
                  <div className="mt-8 space-y-3">
                    <OnboardingOptionButton label="WhatsApp" onClick={() => handleContactMethodSelect('whatsapp')} />
                    <OnboardingOptionButton label="Email" onClick={() => handleContactMethodSelect('email')} />
                  </div>
                </>
              )}

              {/* Step: Contact detail */}
              {step === 'contact-detail' && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    {current.contactMethod === 'whatsapp'
                      ? `What's ${current.name.split(' ')[0]}'s number?`
                      : `What's ${current.name.split(' ')[0]}'s email?`
                    }
                  </h2>
                  <div className="mt-8">
                    {current.contactMethod === 'whatsapp' ? (
                      <Input
                        value={current.phone}
                        onChange={(e) => updateField('phone', e.target.value)}
                        placeholder="e.g. 07456789123"
                        className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleContactDetailNext() } }}
                      />
                    ) : (
                      <Input
                        value={current.email}
                        onChange={(e) => updateField('email', e.target.value)}
                        placeholder="e.g. tenant@email.com"
                        type="email"
                        className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleContactDetailNext() } }}
                      />
                    )}
                  </div>
                  {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
                  <Button
                    onClick={handleContactDetailNext}
                    disabled={saving}
                    className="w-full mt-8"
                    size="lg"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {isLast
                      ? (filledCount > 0 ? `Add ${filledCount} tenant${filledCount !== 1 ? 's' : ''}` : 'Add tenant')
                      : 'Continue'
                    }
                  </Button>
                </>
              )}

              {current.skipped && (
                <>
                  <h2 className={`${typography.pageTitle} text-center`}>
                    {current.room_name}
                  </h2>
                  <div className="text-center py-8">
                    <p className={typography.bodyText}>This room will be left vacant.</p>
                  </div>
                  <Button onClick={advanceToNextRoom} className="w-full" size="lg" disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {isLast
                      ? (filledCount > 0 ? `Add ${filledCount} tenant${filledCount !== 1 ? 's' : ''}` : 'Finish')
                      : 'Continue'
                    }
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Summary */}
        {stage === 'summary' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="px-10 pt-8 pb-2">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </div>
            <div className="px-10 pb-10 pt-4">
              <h2 className={`${typography.pageTitle} text-center`}>
                {filledCount} tenant{filledCount !== 1 ? 's' : ''} added
              </h2>
              <p className={`${typography.bodyText} text-center mt-1 mb-6`}>
                at {streetAddress}
              </p>

              {/* Tenant list — scrollable after 5 items */}
              <div className="space-y-2 mb-8 max-h-[280px] overflow-y-auto">
                {entries.filter(e => !e.skipped && e.name.trim()).map((entry) => (
                  <div key={entry.room_id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {isSingleLet ? 'Tenant' : entry.room_name} · {entry.contactMethod === 'whatsapp' ? entry.phone : entry.email}
                      </p>
                    </div>
                    {entry.contactMethod === 'whatsapp'
                      ? <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    }
                  </div>
                ))}
                {entries.filter(e => e.skipped).length > 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    {entries.filter(e => e.skipped).length} room{entries.filter(e => e.skipped).length !== 1 ? 's' : ''} left vacant
                  </p>
                )}
              </div>

              {/* Send onboarding message */}
              {whatsappTenants.length > 0 && !onboardSent && (
                <Button
                  variant="outline"
                  className="w-full mb-3"
                  size="lg"
                  disabled={onboardSending}
                  onClick={() => setOnboardDialogOpen(true)}
                >
                  {onboardSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Onboarding Message ({whatsappTenants.length})
                    </>
                  )}
                </Button>
              )}

              {onboardSent && (
                <Button
                  variant="outline"
                  className="w-full mb-3"
                  size="lg"
                  onClick={() => {
                    setDismissing(true)
                    setTimeout(() => router.push('/tenants'), 600)
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Tenants
                </Button>
              )}

              <Button onClick={handleDismiss} className="w-full" size="lg">
                Done
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Onboarding message preview dialog */}
      <Dialog open={onboardDialogOpen} onOpenChange={setOnboardDialogOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Send Onboarding Message</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground mb-4">
            The following WhatsApp message will be sent to {whatsappTenants.length} tenant{whatsappTenants.length !== 1 ? 's' : ''}:
          </p>

          {/* Message preview */}
          <div className="rounded-xl bg-muted/50 border border-border p-4 text-sm space-y-2">
            <p>Hi <span className="font-medium">[First name]</span>, Adam from Yarro here.</p>
            <p><span className="font-medium">{propertyManager?.business_name || propertyManager?.name || 'Your property manager'}</span> has added you as a tenant at <span className="font-medium">{streetAddress}</span>.</p>
            <p>When you need to report a maintenance issue, send a WhatsApp message to <span className="font-mono font-medium">+44 7446 904822</span> describing the problem.</p>
            <p>We&apos;ll log it, and your property manager will be notified straight away.</p>
            <p>No sign-up required!</p>
          </div>

          {/* Recipient list */}
          <div className="max-h-40 overflow-y-auto space-y-1.5 mt-2">
            {whatsappTenants.map((entry) => (
              <div
                key={entry.room_id}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm"
              >
                <span className="font-medium truncate">{entry.name}</span>
                <span className="font-mono text-xs text-muted-foreground ml-2">{entry.phone}</span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOnboardDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendOnboarding} disabled={onboardSending} className="gap-2">
              {onboardSending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Onboarding Message ({whatsappTenants.length})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RoomProgress({ current, entries }: { current: number; entries: TenantEntry[] }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${
            i + 1 === current
              ? 'w-6 bg-primary'
              : i + 1 < current
                ? entry.skipped
                  ? 'w-6 bg-muted-foreground/20'
                  : 'w-6 bg-primary/30'
                : 'w-1.5 bg-border'
          }`}
        />
      ))}
    </div>
  )
}
