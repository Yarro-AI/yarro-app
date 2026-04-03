'use client'

import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import {
  CERTIFICATE_LABELS,
  CERT_TYPE_CONTRACTOR_CATEGORIES,
  type CertificateType,
} from '@/lib/constants'
import {
  partitionContractors,
  contractorMatchesCertType,
  type ContractorWithCategories,
} from '@/lib/contractor-utils'

interface ContractorSelectProps {
  /** PM ID for fetching contractors */
  pmId: string
  /** Certificate type — determines qualification matching */
  certType: CertificateType
  /** Currently selected contractor ID (empty string or null = none) */
  value: string | null
  /** Callback when contractor selection changes */
  onChange: (contractorId: string | null, contractorName: string | null) => void
  /** Label above the select (defaults to "Auto-dispatch contractor for renewal") */
  label?: string
  /** Placeholder when nothing selected (defaults to "None (notify me only)") */
  placeholder?: string
  /** Show "None" option (defaults to true) */
  showNone?: boolean
}

export function ContractorSelect({
  pmId,
  certType,
  value,
  onChange,
  label = 'Auto-dispatch contractor for renewal',
  placeholder = 'None (notify me only)',
  showNone = true,
}: ContractorSelectProps) {
  const supabase = createClient()
  const [contractors, setContractors] = useState<ContractorWithCategories[]>([])
  const [matchingContractors, setMatchingContractors] = useState<ContractorWithCategories[]>([])
  const [otherContractors, setOtherContractors] = useState<ContractorWithCategories[]>([])
  const [showMismatchWarning, setShowMismatchWarning] = useState(false)
  const [pendingContractorId, setPendingContractorId] = useState('')

  useEffect(() => {
    if (!certType || !pmId) {
      setContractors([])
      setMatchingContractors([])
      setOtherContractors([])
      return
    }

    const relevantCategories = CERT_TYPE_CONTRACTOR_CATEGORIES[certType]
    if (!relevantCategories) {
      setContractors([])
      setMatchingContractors([])
      setOtherContractors([])
      return
    }

    async function fetchContractors() {
      const { data } = await supabase
        .from('c1_contractors')
        .select('id, contractor_name, categories')
        .eq('property_manager_id', pmId)
        .eq('active', true)
        .order('contractor_name')

      if (!data) return

      const [matching, other] = partitionContractors(data, certType)
      setMatchingContractors(matching)
      setOtherContractors(other)
      setContractors([...matching, ...other])
    }

    fetchContractors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certType, pmId])

  const handleChange = (v: string) => {
    const selectedId = v === 'none' ? '' : v
    if (!selectedId) {
      onChange(null, null)
      setShowMismatchWarning(false)
      setPendingContractorId('')
      return
    }
    const selected = contractors.find(c => c.id === selectedId)
    if (selected && !contractorMatchesCertType(selected, certType)) {
      setPendingContractorId(selectedId)
      setShowMismatchWarning(true)
    } else {
      onChange(selectedId, selected?.contractor_name ?? null)
      setShowMismatchWarning(false)
      setPendingContractorId('')
    }
  }

  const confirmMismatch = () => {
    const selected = contractors.find(c => c.id === pendingContractorId)
    onChange(pendingContractorId, selected?.contractor_name ?? null)
    setShowMismatchWarning(false)
    setPendingContractorId('')
  }

  const cancelMismatch = () => {
    setShowMismatchWarning(false)
    setPendingContractorId('')
  }

  const certLabel = CERTIFICATE_LABELS[certType] || certType

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1.5">{label}</p>
      <Select value={value || 'none'} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {showNone && <SelectItem value="none">{placeholder}</SelectItem>}
          {matchingContractors.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
          ))}
          {matchingContractors.length > 0 && otherContractors.length > 0 && (
            <>
              <SelectSeparator />
              <p className="px-2 py-1 text-xs text-muted-foreground">Other contractors</p>
            </>
          )}
          {otherContractors.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.contractor_name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showMismatchWarning && (
        <div className="mt-2 bg-warning/10 border border-warning/30 px-3 py-2 rounded-md">
          <p className="text-sm font-medium">Contractor may not be qualified</p>
          <p className="text-xs text-muted-foreground mt-1">
            This contractor doesn&apos;t have the right qualifications for {certLabel}.
          </p>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={cancelMismatch}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmMismatch}>
              Continue anyway
            </Button>
          </div>
        </div>
      )}

      {!showMismatchWarning && contractors.length > 0 && matchingContractors.length === 0 && (
        <p className="mt-1.5 text-xs text-warning">
          No contractors with matching qualifications.{' '}
          <a href="/contractors" className="underline font-medium hover:text-foreground transition-colors">
            Add a contractor
          </a>
        </p>
      )}

      {!showMismatchWarning && contractors.length === 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          No contractors added yet.{' '}
          <a href="/contractors" className="underline font-medium hover:text-foreground transition-colors">
            Add a contractor
          </a>
        </p>
      )}
    </div>
  )
}
