'use client'

import { useEffect, useState } from 'react'
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
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { formatPhoneDisplay } from '@/lib/normalize'

interface Tenant {
  id: string
  full_name: string | null
  phone: string | null
}

interface TenantAssignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roomId: string
  roomNumber: string
  propertyId: string
  pmId: string
  onAssigned: () => void
}

export function TenantAssignDialog({
  open,
  onOpenChange,
  roomId,
  roomNumber,
  propertyId,
  pmId,
  onAssigned,
}: TenantAssignDialogProps) {
  const supabase = createClient()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loadingTenants, setLoadingTenants] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [tenancyStart, setTenancyStart] = useState('')
  const [tenancyEnd, setTenancyEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch unassigned tenants when dialog opens
  useEffect(() => {
    if (!open) return

    const fetchTenants = async () => {
      setLoadingTenants(true)
      const { data, error } = await supabase
        .from('c1_tenants')
        .select('id, full_name, phone')
        .eq('property_id', propertyId)
        .is('room_id', null)
        .order('full_name')

      if (error) {
        toast.error('Failed to load tenants')
        return
      }
      setTenants((data as Tenant[]) || [])
      setLoadingTenants(false)
    }

    fetchTenants()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable
  }, [open, propertyId])

  const resetForm = () => {
    setSelectedTenantId('')
    setTenancyStart('')
    setTenancyEnd('')
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!selectedTenantId) {
      setError('Select a tenant')
      return
    }
    if (!tenancyStart) {
      setError('Tenancy start date is required')
      return
    }
    if (tenancyEnd && new Date(tenancyEnd) <= new Date(tenancyStart)) {
      setError('End date must be after start date')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('room_assign_tenant', {
        p_room_id: roomId,
        p_tenant_id: selectedTenantId,
        p_pm_id: pmId,
        p_tenancy_start: tenancyStart,
        p_tenancy_end: tenancyEnd || null,
      })

      if (rpcError) throw new Error(rpcError.message)

      toast.success('Tenant assigned to room')
      handleOpenChange(false)
      onAssigned()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign tenant')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Tenant to {roomNumber}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-1.5">Tenant *</p>
            {loadingTenants ? (
              <p className="text-sm text-muted-foreground">Loading tenants...</p>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unassigned tenants on this property</p>
            ) : (
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.full_name || 'Unnamed'}{t.phone ? ` · ${formatPhoneDisplay(t.phone)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Tenancy Start *</p>
              <Input
                type="date"
                value={tenancyStart}
                onChange={(e) => setTenancyStart(e.target.value)}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1.5">Tenancy End</p>
              <Input
                type="date"
                value={tenancyEnd}
                onChange={(e) => setTenancyEnd(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || tenants.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign Tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
