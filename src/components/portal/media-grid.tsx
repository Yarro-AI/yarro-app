function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return /\.(mp4|mov|webm|avi|mkv|3gp)/.test(lower) || lower.includes('/video/')
}

export function MediaGrid({ images }: { images: string[] }) {
  if (!images || images.length === 0) return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/50 px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">No images provided</p>
    </div>
  )
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {images.map((url, i) =>
        isVideoUrl(url) ? (
          <video key={i} src={url} controls playsInline className="w-full h-32 object-cover rounded-lg border border-border" />
        ) : (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-border" />
          </a>
        )
      )}
    </div>
  )
}
