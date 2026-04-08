import { PageShell } from '@/components/page-shell'

export default function AuditProfileLoading() {
  return (
    <PageShell scrollable>
      <div className="space-y-4 animate-pulse">
        {/* Back link placeholder */}
        <div className="h-4 w-32 bg-muted rounded" />

        {/* Header card */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-3">
          <div className="h-5 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/3 bg-muted rounded" />
          <div className="flex gap-2">
            <div className="h-6 w-16 bg-muted rounded-full" />
            <div className="h-6 w-16 bg-muted rounded-full" />
          </div>
        </div>

        {/* Tab bar placeholder */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-24 bg-muted rounded-lg" />
          ))}
        </div>

        {/* Content placeholder */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </PageShell>
  )
}
