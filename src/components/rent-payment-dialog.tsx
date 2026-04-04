'use client'

import { useState, useEffect } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface RentEntry {
  rent_ledger_id: string | null
  room_number: string
  tenant_name: string | null
  amount_due: number | null
}

interface RentPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: RentEntry | null
  pmId: string
  onSuccess: () => void
}

const PAYMENT_METHODS = [
  'Bank transfer',
  'Cash',
  'Standing order',
  'Other',
]

export function RentPaymentDialog({ open, onOpenChange, entry, pmId, onSuccess }: RentPaymentDialogProps) {
  const supabase = createClient()
  const [amountPaid, setAmountPaid] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens with a new entry
  useEffect(() => {
    if (open && entry) {
      setAmountPaid(entry.amount_due?.toString() ?? '')
      setPaymentMethod('')
      setNotes('')
      setError(null)
    }
  }, [open, entry])

  const validate = (): string | null => {
    const amount = parseFloat(amountPaid)
    if (isNaN(amount) || amount <= 0) return 'Amount must be greater than zero'
    if (!paymentMethod) return 'Payment method is required'
    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    if (!entry?.rent_ledger_id) return

    setSaving(true)
    setError(null)

    const { error: rpcError } = await supabase.rpc('record_rent_payment', {
      p_rent_ledger_id: entry.rent_ledger_id,
      p_pm_id: pmId,
      p_amount: parseFloat(amountPaid),
      p_payment_method: paymentMethod,
      p_notes: notes || null,
    })

    if (rpcError) {
      setError(rpcError.message)
      setSaving(false)
      return
    }

    toast.success(`Payment recorded for Room ${entry.room_number}`)
    setSaving(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          {entry && (
            <p className="text-sm text-muted-foreground">
              Room {entry.room_number} — {entry.tenant_name || 'Unknown tenant'}
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Amount Paid</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">£</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="pl-7"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Payment Method</label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. paid early, reference number..."
              disabled={saving}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
