'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Building2, ArrowLeft } from 'lucide-react'
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_LABELS,
  type CertificateType,
} from '@/lib/constants'

interface PropertyRequirements {
  id: string
  address: string
  currentRequirements: CertificateType[]
}

interface SelectTypesStepProps {
  properties: PropertyRequirements[]
  onContinue: (selections: Map<string, CertificateType[]>) => void
  onBack: () => void
}

function ToggleOptionButton({ label, selected, onClick }: {
  label: string; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-center px-4 py-3.5 rounded-xl border transition-all ${
        selected
          ? 'border-primary bg-primary/5 text-primary'
          : 'bg-transparent border-border/60 text-foreground hover:border-primary/30'
      }`}
    >
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

export function SelectTypesStep({ properties, onContinue, onBack }: SelectTypesStepProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // Initialize selections from existing requirements
  const [selections, setSelections] = useState<Map<string, CertificateType[]>>(() => {
    const map = new Map<string, CertificateType[]>()
    for (const prop of properties) {
      map.set(prop.id, [...prop.currentRequirements])
    }
    return map
  })

  const property = properties[currentIndex]
  const selected = selections.get(property.id) || []
  const isLast = currentIndex === properties.length - 1

  const toggleType = (certType: CertificateType) => {
    setSelections(prev => {
      const next = new Map(prev)
      const current = next.get(property.id) || []
      if (current.includes(certType)) {
        next.set(property.id, current.filter(t => t !== certType))
      } else {
        next.set(property.id, [...current, certType])
      }
      return next
    })
  }

  const handleContinue = () => {
    if (selected.length === 0) return
    if (isLast) {
      onContinue(selections)
    } else {
      setCurrentIndex(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    } else {
      onBack()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-lg mx-auto px-6">
      {/* Progress for multiple properties */}
      {properties.length > 1 && (
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Property {currentIndex + 1} of {properties.length}
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / properties.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Property header */}
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground truncate">{property.address}</span>
      </div>

      <h1 className="text-2xl font-bold text-center mb-2">
        Which certificates does this property need?
      </h1>
      <p className="text-muted-foreground text-center mb-6 text-sm">
        We&apos;ve pre-selected the legally required ones. Toggle any extras on or off.
      </p>

      {/* Cert type grid */}
      <div className="w-full grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto mb-6">
        {CERTIFICATE_TYPES.map(ct => (
          <ToggleOptionButton
            key={ct}
            label={CERTIFICATE_LABELS[ct]}
            selected={selected.includes(ct)}
            onClick={() => toggleType(ct)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between w-full">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {selected.length} selected
          </span>
          <Button onClick={handleContinue} disabled={selected.length === 0}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
