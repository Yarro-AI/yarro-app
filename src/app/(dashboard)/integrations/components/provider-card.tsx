'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'

export type IntegrationStatus = 'disconnected' | 'connected' | 'error'

interface ProviderCardProps {
  name: string
  description: string
  icon: React.ReactNode
  status: IntegrationStatus
  lastSyncAt?: string | null
  onConnect: () => void
  onDisconnect?: () => void
  onImport?: () => void
  importing?: boolean
}

const statusConfig: Record<IntegrationStatus, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: React.ReactNode }> = {
  disconnected: { label: 'Disconnected', variant: 'secondary', icon: <XCircle className="h-3.5 w-3.5" /> },
  connected: { label: 'Connected', variant: 'default', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  error: { label: 'Error', variant: 'destructive', icon: <AlertCircle className="h-3.5 w-3.5" /> },
}

export function ProviderCard({
  name,
  description,
  icon,
  status,
  lastSyncAt,
  onConnect,
  onDisconnect,
  onImport,
  importing,
}: ProviderCardProps) {
  const cfg = statusConfig[status]

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-muted">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold">{name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <Badge variant={cfg.variant} className="flex items-center gap-1 text-xs">
          {cfg.icon}
          {cfg.label}
        </Badge>
      </div>

      {lastSyncAt && (
        <p className="text-xs text-muted-foreground mt-3">
          Last synced: {new Date(lastSyncAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4">
        {status === 'disconnected' || status === 'error' ? (
          <Button size="sm" onClick={onConnect}>
            {status === 'error' ? 'Reconnect' : 'Connect'}
          </Button>
        ) : (
          <>
            {onImport && (
              <Button size="sm" onClick={onImport} disabled={importing}>
                {importing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {importing ? 'Importing...' : 'Import Data'}
              </Button>
            )}
            {onDisconnect && (
              <Button size="sm" variant="outline" onClick={onDisconnect}>
                Disconnect
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
