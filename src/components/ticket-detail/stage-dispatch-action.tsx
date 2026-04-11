'use client'

import { useState, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ContractorOption {
  id: string
  contractor_name: string
  contractor_phone: string
  contractor_email: string | null
}

interface StageDispatchActionProps {
  ticketId: string
  onActionTaken: () => void
}

export function StageDispatchAction({ ticketId, onActionTaken }: StageDispatchActionProps) {
  const [open, setOpen] = useState(false)
  const [contractors, setContractors] = useState<ContractorOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const supabase = createClient()

  const loadContractors = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('c1_contractors')
      .select('id, contractor_name, contractor_phone, contractor_email')
      .order('contractor_name')
    setContractors(data || [])
    setLoading(false)
  }, [supabase])

  const handleOpen = () => {
    setOpen(true)
    loadContractors()
  }

  const handleDispatch = async () => {
    if (!selectedId) return
    setDispatching(true)
    try {
      const { data, error } = await supabase.rpc('c1_redispatch_contractor' as never, {
        p_ticket_id: ticketId,
        p_contractor_id: selectedId,
      } as never)

      if (error) {
        toast.error('Failed to dispatch', { description: error.message })
        return
      }

      const result = data as unknown as { ok: boolean; contractor_name?: string; reason?: string }
      if (result?.ok) {
        toast.success(`Dispatched to ${result.contractor_name}`)
        setOpen(false)
        setSelectedId('')
        onActionTaken()
      } else {
        toast.error('Dispatch failed', { description: result?.reason?.replace(/-/g, ' ') || 'Unknown error' })
      }
    } finally {
      setDispatching(false)
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={handleOpen}>
        <Plus className="h-3.5 w-3.5" />
        Add Contractor & Dispatch
      </Button>
    )
  }

  const contractorOptions = contractors.map((c) => ({
    value: c.id,
    label: c.contractor_name,
    description: c.contractor_phone,
  }))

  return (
    <div className="mt-3 p-3.5 rounded-lg border border-border/60 space-y-3">
      <p className="text-xs font-medium text-card-foreground">Select a contractor to dispatch</p>
      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading contractors...</span>
        </div>
      ) : (
        <>
          <Combobox
            options={contractorOptions}
            value={selectedId}
            onValueChange={setSelectedId}
            placeholder="Choose contractor..."
            searchPlaceholder="Search contractors..."
            emptyText="No contractors found."
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!selectedId || dispatching} onClick={handleDispatch}>
              {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Dispatch
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setSelectedId('') }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
