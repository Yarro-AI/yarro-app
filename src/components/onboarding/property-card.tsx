'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, MapPin, Check, ChevronLeft } from 'lucide-react'
import { typography } from '@/lib/typography'

interface PropertyCardProps {
  pmId: string
  onComplete: () => void
}

type Stage = 'postcode' | 'address' | 'type' | 'rooms'

interface PostcodeResult {
  postcode: string
  city: string
  ward: string
  region: string
}

export function PropertyCard({ pmId, onComplete }: PropertyCardProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('postcode')

  const [postcode, setPostcode] = useState('')
  const [postcodeResult, setPostcodeResult] = useState<PostcodeResult | null>(null)
  const [streetAddress, setStreetAddress] = useState('')
  const [propertyType, setPropertyType] = useState<string | null>(null)
  const [roomCount, setRoomCount] = useState(5)

  const handlePostcodeLookup = async () => {
    const trimmed = postcode.trim()
    if (!trimmed) return

    setError(null)
    setLookingUp(true)

    try {
      const encoded = encodeURIComponent(trimmed)
      const response = await fetch(`https://api.postcodes.io/postcodes/${encoded}`)
      const data = await response.json()

      if (data.status === 200 && data.result) {
        const r = data.result
        setPostcodeResult({
          postcode: r.postcode,
          city: r.admin_district || r.admin_county || '',
          ward: r.admin_ward || '',
          region: r.region || '',
        })
        setPostcode(r.postcode)
        setStage('address')
      } else {
        setError('Postcode not found. Check and try again.')
      }
    } catch {
      setError('Could not look up postcode. Try again.')
    }
    setLookingUp(false)
  }

  const handlePostcodeKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePostcodeLookup()
    }
  }

  const handleConfirmAddress = () => {
    if (!streetAddress.trim()) {
      setError('Enter your street address')
      return
    }
    setError(null)
    setStage('type')
  }

  const handleSelectType = (type: string) => {
    setPropertyType(type)
    if (type === 'single_let') {
      // Single let — no room count needed, submit directly
      handleSubmit(type, 1)
    } else {
      // HMO — need room count
      setStage('rooms')
    }
  }

  const handleSubmit = async (type?: string, rooms?: number) => {
    setError(null)
    setSaving(true)

    const finalType = type || propertyType || 'hmo'
    const finalRooms = rooms || roomCount
    const fullAddress = `${streetAddress.trim()}, ${postcodeResult?.city || ''}, ${postcode}`

    try {
      const { error: rpcError } = await supabase.rpc('onboarding_create_property', {
        p_pm_id: pmId,
        p_address: fullAddress,
        p_city: postcodeResult?.city || '',
        p_postcode: postcode,
        p_room_count: finalRooms,
        p_property_type: finalType,
      })

      if (rpcError) {
        if (rpcError.message.includes('properties_address_key') || rpcError.message.includes('duplicate key')) {
          setError('This property has already been added. Try a different address.')
        } else {
          setError(rpcError.message)
        }
        setSaving(false)
        return
      }

      toast.success(finalType === 'hmo'
        ? `Property added with ${finalRooms} rooms`
        : 'Property added'
      )
      onComplete()
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (stage === 'rooms') setStage('type')
    else if (stage === 'type') setStage('address')
    else if (stage === 'address') { setStage('postcode'); setPostcodeResult(null) }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className="flex items-center px-6 pt-6 pb-2">
        {stage !== 'postcode' ? (
          <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-8" />
        )}
        <div className="flex-1">
          <ProgressDots current={2} total={2} />
        </div>
        <div className="w-8" />
      </div>

      <div className="px-10 pb-10 pt-4">
        <h2 className={`${typography.pageTitle} text-center`}>Add your first property</h2>
        <p className={`${typography.bodyText} text-center mt-1 mb-8`}>
          {stage === 'postcode' && "Start with your postcode"}
          {stage === 'address' && "Confirm your address"}
          {stage === 'type' && "What type of property is this?"}
          {stage === 'rooms' && "How many rooms?"}
        </p>

        {/* Stage: Postcode */}
        {stage === 'postcode' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                onKeyDown={handlePostcodeKeyDown}
                placeholder="e.g. SW2 1AA"
                className="flex-1 text-center !text-lg !font-medium h-14 rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
              />
              <Button
                variant="outline"
                onClick={handlePostcodeLookup}
                disabled={lookingUp || !postcode.trim()}
                className="h-14 w-14 rounded-xl"
              >
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        {/* Stage: Address confirmation */}
        {stage === 'address' && postcodeResult && (
          <div className="space-y-5">
            {/* Area badge */}
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-muted/50 border border-border">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className={typography.dataLabel}>
                  {postcodeResult.ward}{postcodeResult.ward && postcodeResult.city ? ', ' : ''}{postcodeResult.city}
                </p>
                <p className={typography.metaText}>{postcodeResult.postcode}</p>
              </div>
              <button
                onClick={() => { setStage('postcode'); setPostcodeResult(null) }}
                className={`${typography.actionLink} ml-auto text-xs`}
              >
                Change
              </button>
            </div>

            <Field label="Street address" required>
              <Input
                value={streetAddress}
                onChange={(e) => setStreetAddress(e.target.value.replace(/\b\w/g, (c) => c.toUpperCase()))}
                placeholder="e.g. 14 Brixton Hill"
                className="h-14 !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmAddress() } }}
              />
            </Field>

            <Button onClick={handleConfirmAddress} className="w-full" size="lg">
              Continue
            </Button>
          </div>
        )}

        {/* Stage: Property type */}
        {stage === 'type' && (
          <div className="space-y-3">
            <TypeOption
              label="HMO"
              description="Multiple tenants, each renting a room"
              selected={false}
              onClick={() => handleSelectType('hmo')}
            />
            <TypeOption
              label="Single let"
              description="One tenancy for the whole property"
              selected={false}
              onClick={() => handleSelectType('single_let')}
              loading={saving}
            />
          </div>
        )}

        {/* Stage: Room count (HMO only) */}
        {stage === 'rooms' && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-4">
                <button
                  onClick={() => setRoomCount(Math.max(1, roomCount - 1))}
                  className="w-10 h-10 rounded-full border border-primary/30 text-primary/70 flex items-center justify-center text-lg font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  −
                </button>
                <span className={`${typography.statValue} w-12 text-center`}>{roomCount}</span>
                <button
                  onClick={() => setRoomCount(Math.min(50, roomCount + 1))}
                  className="w-10 h-10 rounded-full border border-primary/30 text-primary/70 flex items-center justify-center text-lg font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  +
                </button>
              </div>
              <p className={`${typography.metaText} mt-2`}>rooms in this property</p>
            </div>

            <Button
              onClick={() => handleSubmit()}
              disabled={saving}
              className="w-full"
              size="lg"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add property
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive mt-4 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}

function TypeOption({ label, description, selected, onClick, loading }: {
  label: string
  description: string
  selected: boolean
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full text-left px-5 py-4 rounded-xl border transition-all bg-transparent ${
        selected
          ? 'border-primary'
          : 'border-border/60 hover:border-primary/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className={typography.dataLabel}>{label}</p>
          <p className={`${typography.metaText} mt-0.5`}>{description}</p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : selected ? (
          <Check className="w-4 h-4 text-primary" />
        ) : null}
      </div>
    </button>
  )
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${
            i + 1 === current ? 'w-6 bg-primary' : i + 1 < current ? 'w-6 bg-primary/30' : 'w-1.5 bg-border'
          }`}
        />
      ))}
    </div>
  )
}

function Field({ label, required, children }: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={`${typography.dataLabel} block mb-1.5`}>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
