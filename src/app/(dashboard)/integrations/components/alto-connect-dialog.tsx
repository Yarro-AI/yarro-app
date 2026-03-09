'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'

interface AltoConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected: () => void
}

export function AltoConnectDialog({ open, onOpenChange, onConnected }: AltoConnectDialogProps) {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [agencyRef, setAgencyRef] = useState('')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleTest = async () => {
    if (!propertyManager || !clientId || !clientSecret || !agencyRef) return

    setTesting(true)
    setResult(null)

    try {
      const { data, error } = await supabase.functions.invoke('yarro-alto-import', {
        body: {
          action: 'test-connection',
          property_manager_id: propertyManager.id,
          credentials: {
            client_id: clientId,
            client_secret: clientSecret,
            agency_ref: agencyRef,
          },
        },
      })

      if (error) {
        setResult({ success: false, message: error.message || 'Connection failed' })
      } else if (data?.success) {
        setResult({ success: true, message: 'Connected successfully' })
        setTimeout(() => {
          onConnected()
          onOpenChange(false)
        }, 1500)
      } else {
        setResult({ success: false, message: data?.error || 'Connection failed' })
      }
    } catch (err) {
      setResult({ success: false, message: 'Network error — try again' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Alto</DialogTitle>
          <DialogDescription>
            Enter your Alto Connect credentials. You can find these in{' '}
            <span className="font-medium">Alto Connect</span> (connect.vebraalto.com).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Client ID</label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 39qb053chj6rmk..."
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Client Secret</label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Your client secret"
              className="mt-1 h-9"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Agency Ref</label>
            <Input
              value={agencyRef}
              onChange={(e) => setAgencyRef(e.target.value)}
              placeholder="Provided by Alto when integration created"
              className="mt-1 h-9"
            />
          </div>

          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-green-600' : 'text-red-600'}`}>
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.message}
            </div>
          )}

          <Button
            onClick={handleTest}
            disabled={testing || !clientId || !clientSecret || !agencyRef}
            className="w-full"
          >
            {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {testing ? 'Testing Connection...' : 'Test & Connect'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
