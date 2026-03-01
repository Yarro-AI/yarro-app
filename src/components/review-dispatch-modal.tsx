'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { CONTRACTOR_CATEGORIES, TICKET_PRIORITIES } from '@/lib/constants'
import { Loader2, Send } from 'lucide-react'

interface ReviewTicket {
  id: string
  issue_description: string | null
  category: string | null
  priority: string | null
  address?: string
  tenant_name?: string
}

interface ReviewDispatchModalProps {
  ticket: ReviewTicket | null
  open: boolean
  onClose: () => void
  onDispatched: () => void
}

export function ReviewDispatchModal({ ticket, open, onClose, onDispatched }: ReviewDispatchModalProps) {
  const supabase = createClient()
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [dispatching, setDispatching] = useState(false)

  useEffect(() => {
    if (ticket) {
      setDescription(ticket.issue_description || '')
      setCategory(ticket.category || '')
      setPriority(ticket.priority || 'Medium')
    }
  }, [ticket])

  const handleDispatch = async () => {
    if (!ticket) return
    setDispatching(true)

    const { data, error } = await supabase.rpc('c1_dispatch_from_review', {
      p_ticket_id: ticket.id,
      p_issue_description: description !== ticket.issue_description ? description : null,
      p_category: category !== ticket.category ? category : null,
      p_priority: priority !== ticket.priority ? priority : null,
    })

    if (error) {
      console.error('Dispatch error:', error)
      toast.error(error.message || 'Failed to dispatch')
      setDispatching(false)
      return
    }

    if (data && !data.ok) {
      toast.error(data.reason || 'Dispatch failed')
      setDispatching(false)
      return
    }

    toast.success('Ticket dispatched to contractors')
    setDispatching(false)
    onDispatched()
  }

  if (!ticket) return null

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Review & Dispatch</DialogTitle>
          <DialogDescription>
            Review the details and dispatch to contractors
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-5">
            {/* Context */}
            <div className="flex gap-4 text-sm">
              {ticket.address && (
                <div>
                  <p className="text-xs text-muted-foreground">Property</p>
                  <p className="font-medium">{ticket.address}</p>
                </div>
              )}
              {ticket.tenant_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Tenant</p>
                  <p className="font-medium">{ticket.tenant_name}</p>
                </div>
              )}
            </div>

            {/* Issue Description */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Issue</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Category + Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {CONTRACTOR_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Priority</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        <StatusBadge status={p} className="opacity-90" />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dispatch button */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={onClose} disabled={dispatching}>Cancel</Button>
              <Button onClick={handleDispatch} disabled={dispatching}>
                {dispatching ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Dispatching...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Send className="h-4 w-4" />
                    Dispatch
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
