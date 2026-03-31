'use client'

import { useEffect } from 'react'
import { PartyPopper } from 'lucide-react'
import { typography } from '@/lib/typography'
import { Button } from '@/components/ui/button'

interface SuccessCardProps {
  onDismiss: () => void
  heading?: string
  subtext?: string
  buttonLabel?: string
}

export function SuccessCard({
  onDismiss,
  heading = 'Your property is live!',
  subtext = 'Next up: add your tenants, contractors, and compliance documents from your dashboard.',
  buttonLabel = 'Go to dashboard',
}: SuccessCardProps) {
  useEffect(() => {
    async function fireConfetti() {
      const confetti = (await import('canvas-confetti')).default

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      })

      setTimeout(() => {
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
        })
      }, 200)

      setTimeout(() => {
        confetti({
          particleCount: 40,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.65 },
        })
      }, 400)
    }

    fireConfetti()
  }, [])

  return (
    <div className="bg-card rounded-2xl border border-border p-10 text-center shadow-2xl">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <PartyPopper className="w-8 h-8 text-primary" />
      </div>
      <h2 className={`${typography.pageTitle} text-center`}>{heading}</h2>
      <p className={`${typography.bodyText} text-center mt-3 mb-8 max-w-xs mx-auto`}>
        {subtext}
      </p>
      <Button onClick={onDismiss} size="lg" className="w-full">
        {buttonLabel}
      </Button>
    </div>
  )
}
