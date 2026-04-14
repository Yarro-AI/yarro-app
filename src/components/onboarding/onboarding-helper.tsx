'use client'

import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { typography } from '@/lib/typography'

interface OnboardingHelperProps {
  title: string
  description: string
  buttonLabel: string
  onAction: () => void
  className?: string
}

/**
 * Reusable floating instruction card for the onboarding tour.
 * Used across dashboard walkthrough, ticket drawer tour, and simulation steps.
 * Same card style as login/signup/onboarding cards for visual continuity.
 */
export function OnboardingHelper({
  title,
  description,
  buttonLabel,
  onAction,
  className = '',
}: OnboardingHelperProps) {
  return (
    <div className={`bg-card rounded-2xl border border-border shadow-2xl p-6 ${className}`}>
      <p className={typography.cardTitle}>{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
      <Button onClick={onAction} size="sm" className="mt-4">
        {buttonLabel}
        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
      </Button>
    </div>
  )
}
