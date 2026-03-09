'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

interface ImportJob {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  counts: Record<string, number>
  errors: Array<{ entity?: string; ref?: string; message: string }>
}

interface ImportStatusProps {
  integrationId: string
  visible: boolean
}

export function ImportStatus({ integrationId, visible }: ImportStatusProps) {
  const [job, setJob] = useState<ImportJob | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!visible || !integrationId) return

    const fetchLatest = async () => {
      const { data } = await supabase
        .from('c1_import_jobs')
        .select('id, status, started_at, completed_at, counts, errors')
        .eq('integration_id', integrationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) setJob(data as ImportJob)
    }

    fetchLatest()

    // Poll every 5s while running
    const interval = setInterval(async () => {
      if (job?.status === 'completed' || job?.status === 'failed') return
      await fetchLatest()
    }, 5000)

    return () => clearInterval(interval)
  }, [integrationId, visible, supabase, job?.status])

  if (!visible || !job) return null

  const isRunning = job.status === 'running' || job.status === 'pending'
  const isFailed = job.status === 'failed'
  const isComplete = job.status === 'completed'

  return (
    <div className="mt-4 rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        {isComplete && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isFailed && <XCircle className="h-4 w-4 text-red-500" />}
        <span>
          {isRunning && 'Import in progress...'}
          {isComplete && 'Import complete'}
          {isFailed && 'Import failed'}
        </span>
      </div>

      {job.counts && Object.keys(job.counts).length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {Object.entries(job.counts).map(([key, val]) => (
            <span key={key} className="capitalize">{key}: <span className="font-medium text-foreground">{val}</span></span>
          ))}
        </div>
      )}

      {job.errors && job.errors.length > 0 && (
        <div className="text-xs text-red-600 space-y-1">
          {job.errors.slice(0, 5).map((err, i) => (
            <p key={i}>{err.entity ? `${err.entity}: ` : ''}{err.message}</p>
          ))}
          {job.errors.length > 5 && <p>...and {job.errors.length - 5} more errors</p>}
        </div>
      )}
    </div>
  )
}
