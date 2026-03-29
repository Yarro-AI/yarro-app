export default function TenantDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden animate-pulse">
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4">
        <div className="h-5 w-5 bg-muted rounded" />
        <div className="h-7 w-44 bg-muted rounded" />
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl space-y-6">
          <div className="rounded-2xl border p-6 space-y-4">
            <div className="h-5 w-20 bg-muted rounded" />
            <div className="space-y-3">
              <div className="flex justify-between py-3 border-b border-border/50">
                <div className="h-4 w-12 bg-muted rounded" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
              <div className="flex justify-between py-3">
                <div className="h-4 w-12 bg-muted rounded" />
                <div className="h-4 w-40 bg-muted rounded" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border p-6 space-y-4">
            <div className="h-5 w-36 bg-muted rounded" />
            <div className="space-y-3">
              <div className="flex justify-between py-3 border-b border-border/50">
                <div className="h-4 w-10 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
              <div className="flex justify-between py-3">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border p-6 space-y-4">
            <div className="h-5 w-20 bg-muted rounded" />
            <div className="space-y-3">
              <div className="flex justify-between py-3 border-b border-border/50">
                <div className="h-4 w-16 bg-muted rounded" />
                <div className="h-4 w-48 bg-muted rounded" />
              </div>
              <div className="flex justify-between py-3">
                <div className="h-4 w-10 bg-muted rounded" />
                <div className="h-4 w-24 bg-muted rounded" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
