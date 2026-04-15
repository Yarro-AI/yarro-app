'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Wrench, Banknote, ShieldCheck, Loader2 } from 'lucide-react'
import { typography } from '@/lib/typography'

interface PainPointPickerProps {
  pmId: string
  onComplete: (segment: string) => void
}

const PAIN_POINTS = [
  {
    key: 'maintenance',
    icon: Wrench,
    title: 'Maintenance',
    subtitle: 'The boiler is leaking!',
  },
  {
    key: 'rent',
    icon: Banknote,
    title: 'Rent',
    subtitle: 'Tenants are late again!',
  },
  {
    key: 'compliance',
    icon: ShieldCheck,
    title: 'Compliance',
    subtitle: 'Legal certs are expiring!',
  },
] as const

export function PainPointPicker({ pmId, onComplete }: PainPointPickerProps) {
  const supabase = createClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSelect = async (segment: string) => {
    setSelected(segment)
    setSaving(true)

    try {
      // onboarding_segment/onboarding_step added by migration, not yet in generated types
      await supabase
        .from('c1_property_managers')
        .update({ onboarding_segment: segment, onboarding_step: 'tour' } as never)
        .eq('id', pmId)

      onComplete(segment)
    } catch {
      toast.error('Something went wrong. Please try again.')
      setSaving(false)
      setSelected(null)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className="px-8 py-8">
        <h2 className={`${typography.pageTitle} text-center`}>
          What&apos;s your biggest headache today?
        </h2>

        <div className="mt-8 space-y-3">
          {PAIN_POINTS.map((point) => {
            const Icon = point.icon
            const isSelected = selected === point.key
            const isDisabled = saving && !isSelected

            return (
              <button
                key={point.key}
                onClick={() => handleSelect(point.key)}
                disabled={saving}
                className={`w-full flex items-center gap-4 px-5 py-5 rounded-xl border transition-all bg-transparent ${
                  isSelected
                    ? 'border-primary text-primary'
                    : isDisabled
                      ? 'border-border/40 text-muted-foreground opacity-60'
                      : 'border-border/60 text-foreground hover:border-primary/30'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-primary/10' : 'bg-muted'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-left flex-1">
                  <span className="text-lg font-medium block">{point.title}</span>
                  <span className="text-sm text-muted-foreground">{point.subtitle}</span>
                </div>
                {isSelected && saving && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
