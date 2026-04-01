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
import { Send, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { formatPhoneDisplay } from '@/lib/normalize'

type EntityType = 'tenant' | 'contractor' | 'landlord'

interface SendTarget {
  id: string
  name: string | null
  phone: string | null
  verification_sent_at: string | null
  verified_at: string | null
}

interface SendResult {
  entity_id: string
  name: string | null
  sent: boolean
  skipped: boolean
  error?: string
}

interface BlastResponse {
  ok: boolean
  warning?: string
  total: number
  sent: number
  skipped: number
  failed: number
  results: SendResult[]
}

interface SendBlastDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: EntityType
  targets: SendTarget[]
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
  onComplete,
}: SendBlastDialogProps) {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<BlastResponse | null>(null)

  const labels = ENTITY_LABELS[entityType]
  const eligibleTargets = targets.filter((t) => t.phone && !t.verified_at)

  const handleSend = async () => {
    if (!propertyManager?.id || eligibleTargets.length === 0) return

    setSending(true)
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
      } else if (response.sent > 0) {
        toast.success(`Sent ${response.sent} onboarding message${response.sent > 1 ? 's' : ''}`)
      }

      setResult(response)
      onComplete?.()
    } catch (err) {
      toast.error('Failed to send onboarding messages')
    } finally {
      setSending(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            Send Onboarding Messages
          </DialogTitle>
          <DialogDescription>
            Send a WhatsApp verification message to {eligibleTargets.length}{' '}
            {eligibleTargets.length === 1 ? labels.singular : labels.plural}.
          </DialogDescription>
        </DialogHeader>

        {/* Pre-send: show recipient list */}
        {!result && (
          <>
            <div className="max-h-64 overflow-y-auto space-y-1.5 py-2">
              {eligibleTargets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm"
                >
                  <span className="font-medium truncate">{target.name || 'Unknown'}</span>
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    {formatPhoneDisplay(target.phone)}
                  </span>
                </div>
              ))}
              {eligibleTargets.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No eligible {labels.plural} to send to. They may already be verified or have no phone number.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || eligibleTargets.length === 0}
                className="gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send to {eligibleTargets.length}
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Post-send: show results */}
        {result && (
          <>
            <div className="space-y-3 py-2">
              {/* Summary stats */}
              <div className="flex gap-4 text-sm">
                {result.sent > 0 && (
                  <div className="flex items-center gap-1.5 text-success">
                    <CheckCircle className="h-4 w-4" />
                    <span>{result.sent} sent</span>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{result.skipped} skipped</span>
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span>{result.failed} failed</span>
                  </div>
                )}
              </div>

              {/* Warning message (e.g., placeholder template) */}
              {result.warning && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
                  {result.warning}
                </div>
              )}

              {/* Failed items detail */}
              {result.results.filter((r) => r.error).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Failed:</p>
                  {result.results
                    .filter((r) => r.error)
                    .map((r) => (
                      <div
                        key={r.entity_id}
                        className="flex items-center justify-between p-2 bg-destructive/5 rounded-lg text-sm"
                      >
                        <span>{r.name || 'Unknown'}</span>
                        <span className="text-xs text-destructive truncate ml-2 max-w-[200px]">
                          {r.error}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
