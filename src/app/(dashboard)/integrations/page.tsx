'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plug, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { ProviderCard, type IntegrationStatus } from './components/provider-card'
import { AltoConnectDialog } from './components/alto-connect-dialog'
import { ImportStatus } from './components/import-status'

interface Integration {
  id: string
  provider: string
  status: IntegrationStatus
  connected_at: string | null
  last_sync_at: string | null
  error_message: string | null
  has_credentials: boolean
}

export default function IntegrationsPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [showAltoDialog, setShowAltoDialog] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportStatus, setShowImportStatus] = useState(false)

  const fetchIntegrations = useCallback(async () => {
    if (!propertyManager) return
    const { data } = await supabase
      .from('v_integrations_safe')
      .select('*')
      .eq('property_manager_id', propertyManager.id)

    if (data) setIntegrations(data as Integration[])
  }, [propertyManager, supabase])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  const altoIntegration = integrations.find(i => i.provider === 'alto')
  const altoStatus: IntegrationStatus = altoIntegration?.status as IntegrationStatus || 'disconnected'

  const handleImport = async () => {
    if (!altoIntegration || !propertyManager) return
    setImporting(true)
    setShowImportStatus(true)

    try {
      const { data, error } = await supabase.functions.invoke('yarro-alto-import', {
        body: {
          action: 'import-data',
          property_manager_id: propertyManager.id,
          integration_id: altoIntegration.id,
        },
      })

      if (error) {
        toast.error(error.message || 'Import failed')
      } else if (data?.success) {
        toast.success('Import started')
      } else {
        toast.error(data?.error || 'Import failed')
      }
    } catch {
      toast.error('Network error')
    } finally {
      setImporting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!altoIntegration) return

    const { error } = await supabase
      .from('c1_integrations')
      .update({ status: 'disconnected', access_token: null, token_expires_at: null })
      .eq('id', altoIntegration.id)

    if (error) {
      toast.error('Failed to disconnect')
    } else {
      toast.success('Alto disconnected')
      fetchIntegrations()
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Connect your CRM and property management tools
        </p>
      </div>

      <div className="space-y-4">
        <ProviderCard
          name="Alto"
          description="Import properties, tenants, landlords and contractors from Alto CRM"
          icon={<Building2 className="h-6 w-6 text-muted-foreground" />}
          status={altoStatus}
          lastSyncAt={altoIntegration?.last_sync_at}
          onConnect={() => setShowAltoDialog(true)}
          onDisconnect={altoStatus === 'connected' ? handleDisconnect : undefined}
          onImport={altoStatus === 'connected' ? handleImport : undefined}
          importing={importing}
        />

        {altoIntegration && (
          <ImportStatus
            integrationId={altoIntegration.id}
            visible={showImportStatus}
          />
        )}
      </div>

      <AltoConnectDialog
        open={showAltoDialog}
        onOpenChange={setShowAltoDialog}
        onConnected={fetchIntegrations}
      />
    </div>
  )
}
