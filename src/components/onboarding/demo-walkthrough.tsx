'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/typography'
import {
  MessageSquare,
  Bell,
  Wrench,
  CalendarCheck,
  ClipboardCheck,
  ChevronLeft,
  Play,
} from 'lucide-react'

interface DemoPage {
  icon: React.ElementType
  title: string
  bullets: string[]
  videoUrl?: string
  sendsWhatsApp?: boolean
  whatsAppStep?: number
}

const DEMO_PAGES: DemoPage[] = [
  {
    icon: MessageSquare,
    title: 'A tenant reports an issue',
    bullets: [
      'Your tenant reports an issue via WhatsApp',
      'Yarro AI diagnoses the problem automatically',
      'Photos are collected and attached to the ticket',
      'A maintenance ticket is created — no input from you',
    ],
  },
  {
    icon: Bell,
    title: 'You get notified instantly',
    bullets: [
      'You just received this on your phone',
      'Every new ticket is sent to you in real-time',
      'Priority, category, and tenant details included',
      'You didn\'t have to ask — Yarro told you',
    ],
    sendsWhatsApp: true,
    whatsAppStep: 1,
  },
  {
    icon: Wrench,
    title: 'The right contractor is dispatched',
    bullets: [
      'Yarro finds the right contractor from your list',
      'They receive the job details via WhatsApp',
      'A secure portal link lets them quote or book',
      'No phone calls, no back-and-forth',
    ],
  },
  {
    icon: CalendarCheck,
    title: 'Job scheduled, everyone notified',
    bullets: [
      'Once the contractor confirms, everyone is notified',
      'Tenant knows when to expect the visit',
      'You get confirmation without chasing anyone',
      'Check your phone — you just received this',
    ],
    sendsWhatsApp: true,
    whatsAppStep: 2,
  },
  {
    icon: ClipboardCheck,
    title: 'Job complete with full audit trail',
    bullets: [
      'The contractor closes the job with photo proof',
      'Full audit trail logged automatically',
      'Compliance-ready documentation for every job',
      'From report to resolution — zero manual work',
    ],
  },
]

export function DemoWalkthrough({ onComplete }: { onComplete: () => void }) {
  const { propertyManager } = usePM()
  const router = useRouter()
  const supabase = createClient()
  const [currentPage, setCurrentPage] = useState(0)
  const [sending, setSending] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const page = DEMO_PAGES[currentPage]
  const isLast = currentPage === DEMO_PAGES.length - 1
  const isFirst = currentPage === 0

  const handleContinue = async () => {
    // If the NEXT page sends WhatsApp, trigger it now
    const nextPage = DEMO_PAGES[currentPage + 1]
    if (nextPage?.sendsWhatsApp && propertyManager) {
      setSending(true)
      try {
        const { error } = await supabase.functions.invoke('yarro-demo-notify', {
          body: { pm_id: propertyManager.id, step: nextPage.whatsAppStep },
        })
        if (error) {
          toast.info('Demo message preview — WhatsApp send will be available soon')
        }
      } catch {
        // Fallback: demo continues regardless
        toast.info('Demo message preview — WhatsApp send will be available soon')
      }
      setSending(false)
    }

    if (isLast) {
      setDismissing(true)
      setTimeout(() => {
        onComplete()
      }, 600)
    } else {
      setCurrentPage(currentPage + 1)
    }
  }

  const handleBack = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing ? 'bg-black/0 backdrop-blur-0' : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-4xl px-4 transition-all duration-500 ${
          dismissing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
          {/* Header: back + progress */}
          <div className="flex items-center px-6 pt-6 pb-2">
            {!isFirst ? (
              <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8" />
            )}
            <div className="flex-1 flex items-center justify-center gap-1.5">
              {DEMO_PAGES.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full transition-all ${
                    i === currentPage ? 'w-6 bg-primary' : i < currentPage ? 'w-6 bg-primary/30' : 'w-1.5 bg-border'
                  }`}
                />
              ))}
            </div>
            <div className="w-8" />
          </div>

          {/* Split screen content */}
          <div className="flex flex-col md:flex-row md:items-stretch gap-0 md:gap-8 px-8 pb-8 pt-4">
            {/* Left: video placeholder */}
            <div className="flex-1 min-w-0 flex">
              <div className="flex-1 rounded-xl bg-muted/50 border border-border/50 flex flex-col items-center justify-center gap-3 min-h-[300px]">
                {page.videoUrl ? (
                  <video
                    src={page.videoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Play className="w-6 h-6 text-primary ml-0.5" />
                    </div>
                    <p className="text-xs text-muted-foreground">Demo video coming soon</p>
                  </>
                )}
              </div>
            </div>

            {/* Right: explanation */}
            <div className="flex-1 min-w-0 flex flex-col justify-center py-4 md:py-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <page.icon className="w-5 h-5 text-primary" />
              </div>
              <h2 className={`${typography.pageTitle} mb-6`}>{page.title}</h2>
              <ul className="space-y-4 mb-8">
                {page.bullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{bullet}</p>
                  </li>
                ))}
              </ul>
              <Button
                onClick={handleContinue}
                disabled={sending}
                size="lg"
                className="w-full"
              >
                {sending ? 'Sending...' : isLast ? 'View your dashboard' : 'Continue'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
