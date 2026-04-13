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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

export interface RoomFormData {
  room_number: string
  room_name: string | null
  floor: string | null
  monthly_rent: number | null
  rent_frequency: string
  rent_due_day: number | null
}

interface RoomFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: RoomFormData) => Promise<void>
  initialData?: RoomFormData | null
}

export function RoomFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: RoomFormDialogProps) {
  const [roomNumber, setRoomNumber] = useState('')
  const [roomName, setRoomName] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [rentFrequency, setRentFrequency] = useState('monthly')
  const [rentDueDay, setRentDueDay] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = !!initialData

  // Populate form when editing
  useEffect(() => {
    if (initialData) {
      setRoomNumber(initialData.room_number)
      setRoomName(initialData.room_name || '')
      setMonthlyRent(initialData.monthly_rent != null ? String(initialData.monthly_rent) : '')
      setRentFrequency(initialData.rent_frequency)
      setRentDueDay(initialData.rent_due_day != null ? String(initialData.rent_due_day) : '')
    }
  }, [initialData])

  const resetForm = () => {
    setRoomNumber('')
    setRoomName('')
    setMonthlyRent('')
    setRentFrequency('monthly')
    setRentDueDay('')
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const validate = (): string | null => {
    if (!roomNumber.trim()) return 'Room number is required'

    if (monthlyRent) {
      const rent = parseFloat(monthlyRent)
      if (isNaN(rent) || rent < 0) return 'Monthly rent must be a positive number'
    }

    if (rentDueDay && rentDueDay !== '0') {
      const day = parseInt(rentDueDay, 10)
      if (isNaN(day) || day < 1 || day > 31) return 'Rent due day must be between 1 and 31 (or 0 for last day of month)'
    }

    // If rent is set, due day is required
    if (monthlyRent && !rentDueDay) return 'Due day is required when rent is set'

    return null
  }

  const handleSubmit = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        room_number: roomNumber.trim(),
        room_name: roomName.trim() || null,
        floor: null,
        monthly_rent: monthlyRent ? parseFloat(monthlyRent) : null,
        rent_frequency: rentFrequency,
        rent_due_day: rentDueDay ? parseInt(rentDueDay, 10) : null,
      })
      handleOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save room')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Room' : 'Add Room'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Room Number *</p>
              <Input
                type="number"
                min="1"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                placeholder="1"
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Nickname</p>
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Garden Room"
              />
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-1.5">Monthly Rent</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                placeholder="650.00"
                className="pl-7"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Rent Frequency</p>
              <Select value={rentFrequency} onValueChange={setRentFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">
                {rentFrequency === 'monthly' ? 'Due Day' : 'Due Day (0=Mon – 6=Sun)'}
              </p>
              {rentFrequency === 'monthly' ? (
                <Select value={rentDueDay || '1'} onValueChange={setRentDueDay}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</SelectItem>
                    ))}
                    <SelectItem value="0">Last day of month</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
              <Input
                type="number"
                min={0}
                max={6}
                value={rentDueDay}
                onChange={(e) => setRentDueDay(e.target.value)}
                placeholder="0"
              />
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Room'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
