'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Send, AlertTriangle, MessageCircle, Mail } from 'lucide-react'
import { formatPhoneDisplay } from '@/lib/normalize'

type EntityType = 'tenant' | 'contractor' | 'landlord'

interface SendTarget {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  contact_method: string
  verification_sent_at: string | null
  verified_at: string | null
}

interface BlastResponse {
  ok: boolean
  warning?: string
  total: number
  sent: number
  skipped: number
  failed: number
}

interface SendBlastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: EntityType
  targets: SendTarget[]
  onSending?: (isSending: boolean) => void
  onComplete?: () => void
}

const ENTITY_LABELS: Record<EntityType, { singular: string; plural: string }> = {
  tenant: { singular: 'tenant', plural: 'tenants' },
  contractor: { singular: 'contractor', plural: 'contractors' },
  landlord: { singular: 'landlord', plural: 'landlords' },
}

export function SendBlastDialog({
  open,
  onOpenChange,
  entityType,
  targets,
  onSending,
  onComplete,
}: SendBlastDialogProps) {
  const { propertyManager } = usePM()
  const supabase = createClient()

  const labels = ENTITY_LABELS[entityType]
  const eligibleTargets = targets.filter((t) => !t.verified_at && (
    (t.contact_method === 'email' && t.email) || t.phone
  ))
  const emailCount = eligibleTargets.filter((t) => t.contact_method === 'email').length
  const whatsappCount = eligibleTargets.length - emailCount

  const handleSend = async () => {
    if (!propertyManager?.id || eligibleTargets.length === 0) return

    // Close dialog immediately
    onOpenChange(false)

    // Signal parent that sending is in progress
    onSending?.(true)

    try {
      const { data, error } = await supabase.functions.invoke('yarro-onboarding-send', {
        body: {
          entity_type: entityType,
          entity_ids: eligibleTargets.map((t) => t.id),
          pm_id: propertyManager.id,
        },
      })

      if (error) {
        toast.error(`Failed to send: ${error.message}`)
        return
      }

      const response = data as BlastResponse

      if (response.warning) {
        toast.warning(response.warning)
      } else if (response.failed > 0) {
        toast.error(`${response.sent} sent, ${response.failed} failed`)
      } else if (response.sent > 0) {
        toast.success(`Sent ${response.sent} onboarding message${response.sent > 1 ? 's' : ''}`)
      }

      onComplete?.()
    } catch (err) {
      toast.error('Failed to send onboarding messages')
    } finally {
      onSending?.(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            Send Onboarding Messages
          </DialogTitle>
          <DialogDescription>
            Send onboarding message{eligibleTargets.length !== 1 ? 's' : ''} to {eligibleTargets.length}{' '}
            {eligibleTargets.length === 1 ? labels.singular : labels.plural}
            {whatsappCount > 0 && emailCount > 0
              ? ` (${whatsappCount} via WhatsApp, ${emailCount} via email)`
              : whatsappCount > 0
                ? ' via WhatsApp'
                : ' via email'
            }.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-y-auto space-y-1.5 py-2">
          {eligibleTargets.map((target) => {
            const isEmail = target.contact_method === 'email'
            return (
              <div
                key={target.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isEmail
                    ? <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                    : <MessageCircle className="h-3.5 w-3.5 text-success shrink-0" />
                  }
                  <span className="font-medium truncate">{target.name || 'Unknown'}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground ml-2 shrink-0">
                  {isEmail ? target.email : formatPhoneDisplay(target.phone)}
                </span>
              </div>
            )
          })}
          {eligibleTargets.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No eligible {labels.plural} to send to. They may already be verified or have no contact details.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={eligibleTargets.length === 0}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            Send to {eligibleTargets.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
