'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_LABELS,
  type CertificateType,
} from '@/lib/constants'

interface CertificateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CertificateFormData) => Promise<void>
  /** Certificate types already on this property (for duplicate detection) */
  existingTypes: CertificateType[]
}

export interface CertificateFormData {
  certificate_type: CertificateType
  issued_date: string | null
  expiry_date: string
  certificate_number: string | null
  issued_by: string | null
  notes: string | null
}

export function CertificateFormDialog({
  open,
  onOpenChange,
  onSubmit,
  existingTypes,
}: CertificateFormDialogProps) {
  const [certificateType, setCertificateType] = useState<CertificateType | ''>('')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [certificateNumber, setCertificateNumber] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReplace, setShowReplace] = useState(false)

  const resetForm = () => {
    setCertificateType('')
    setIssuedDate('')
    setExpiryDate('')
    setCertificateNumber('')
    setIssuedBy('')
    setNotes('')
    setError(null)
    setShowReplace(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const validate = (): string | null => {
    if (!certificateType) return 'Certificate type is required'
    if (!expiryDate) return 'Expiry date is required'
    if (issuedDate && expiryDate && new Date(expiryDate) <= new Date(issuedDate)) {
      return 'Expiry date must be after issued date'
    }
    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    // Check for duplicate — show confirmation before replacing
    if (existingTypes.includes(certificateType as CertificateType) && !showReplace) {
      setShowReplace(true)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        certificate_type: certificateType as CertificateType,
        issued_date: issuedDate || null,
        expiry_date: expiryDate,
        certificate_number: certificateNumber || null,
        issued_by: issuedBy || null,
        notes: notes || null,
      })
      handleOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save certificate')
    } finally {
      setSaving(false)
    }
  }

  const duplicateLabel = certificateType
    ? CERTIFICATE_LABELS[certificateType as CertificateType]
    : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Certificate</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          {showReplace && (
            <div className="bg-warning/10 border border-warning/30 px-3 py-2 rounded-md">
              <p className="text-sm font-medium">Replace existing certificate?</p>
              <p className="text-xs text-muted-foreground mt-1">
                This property already has a {duplicateLabel} certificate. Adding this one will replace it.
              </p>
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-1.5">Certificate Type *</p>
            <Select
              value={certificateType}
              onValueChange={(v) => {
                setCertificateType(v as CertificateType)
                setShowReplace(false)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select certificate type..." />
              </SelectTrigger>
              <SelectContent>
                {CERTIFICATE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CERTIFICATE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Issued Date</p>
              <Input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Expiry Date *</p>
              <Input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={!expiryDate && error ? 'border-destructive' : ''}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Certificate Number</p>
              <Input
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="e.g. GS-2026-001"
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Issued By</p>
              <Input
                value={issuedBy}
                onChange={(e) => setIssuedBy(e.target.value)}
                placeholder="e.g. British Gas"
              />
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1.5">Notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              rows={2}
              className="text-sm"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {showReplace ? 'Replace Certificate' : 'Add Certificate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
