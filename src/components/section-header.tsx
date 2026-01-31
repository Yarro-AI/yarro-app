'use client'

interface SectionHeaderProps {
  icon: string        // Emoji like "🟢" or "🔴"
  title: string
  description: string // Explanatory subtitle
}

export function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base">{icon}</span>
      <div>
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  )
}
