export default function ContractorDetailLoading() {
  return (
    <div className="flex flex-col h-full overflow-hidden animate-pulse">
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4">
        <div className="h-5 w-5 bg-muted rounded" />
        <div className="h-7 w-52 bg-muted rounded" />
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 px-8 py-6 space-y-6">
          <div className="grid grid-cols-[3fr_2fr] gap-x-8 gap-y-5">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-muted rounded-lg" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-12 bg-muted rounded" />
                <div className="h-4 w-32 bg-muted rounded" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-muted rounded-lg" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-12 bg-muted rounded" />
                <div className="h-4 w-40 bg-muted rounded" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-muted rounded-lg" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-20 bg-muted rounded" />
                <div className="h-4 w-28 bg-muted rounded" />
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 bg-muted rounded-lg" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-14 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
            </div>
          </div>
          <div className="space-y-3 pt-4">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded-lg" />
            <div className="h-10 w-full bg-muted rounded-lg" />
          </div>
        </div>
        <div className="w-[540px] flex-shrink-0 border-l px-6 py-5 space-y-4">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="space-y-3 pt-2">
            <div className="h-12 w-full bg-muted rounded-lg" />
            <div className="h-12 w-full bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
