'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil, Save, X, Trash2, Loader2 } from 'lucide-react'

interface Badge {
  label: string
  variant: 'success' | 'warning' | 'muted'
}

interface ProfilePageHeaderProps {
  backHref: string
  title: string
  isEditing: boolean
  isSaving: boolean
  editError: string | null
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
  deleteLabel?: string
  // Hero props (optional — property page doesn't use these)
  avatarInitials?: string
  subtitle?: string
  badges?: Badge[]
}

const badgeStyles: Record<Badge['variant'], string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  muted: 'bg-muted text-muted-foreground',
}

export function ProfilePageHeader({
  backHref,
  title,
  isEditing,
  isSaving,
  editError,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  deleteLabel = 'Delete',
  avatarInitials,
  subtitle,
  badges,
}: ProfilePageHeaderProps) {
  const router = useRouter()
  const hasHero = !!avatarInitials

  return (
    <>
      <div className="flex-shrink-0 px-8 pt-6 pb-4">
        {/* Back button */}
        <button
          onClick={() => router.push(backHref)}
          className="text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {hasHero ? (
          /* Hero card layout */
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-lg font-semibold text-primary">{avatarInitials}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-medium text-foreground truncate">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                )}
                {badges && badges.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    {badges.map((b) => (
                      <span
                        key={b.label}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeStyles[b.variant]}`}
                      >
                        {b.variant === 'success' && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                        {b.variant === 'warning' && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
                        {b.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                      <X className="h-4 w-4 mr-1" /> Cancel
                    </Button>
                    <Button size="sm" onClick={onSave} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={onEdit}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
                      <Trash2 className="h-4 w-4 mr-1" /> {deleteLabel}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Simple header layout (property page) */
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={onSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={onEdit}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4 mr-1" /> {deleteLabel}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {editError && (
        <div className="px-8 py-2 bg-destructive/10 text-destructive text-sm">{editError}</div>
      )}
    </>
  )
}
