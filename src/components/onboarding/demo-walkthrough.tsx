'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DemoIssue } from './demo-issues'
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
  subtitle: string
  bullets: string[]
  videoUrl?: string
  sendsWhatsApp?: boolean
  whatsAppStep?: number
}

function buildPages(issue: DemoIssue): DemoPage[] {
  return [
    {
      icon: MessageSquare,
      title: 'Tenants report issues through WhatsApp — 24/7',
      subtitle: 'No missed calls. No lost emails. No app for tenants to download.',
      bullets: [
        'Tenants message your Yarro number on WhatsApp',
        'AI gathers all the details — photos, description, urgency',
        'A maintenance ticket is created automatically',
      ],
    },
    {
      icon: Bell,
      title: 'You get notified the moment something needs attention',
      subtitle: 'Every new issue lands on your phone and your dashboard.',
      bullets: [
        'Real-time WhatsApp notification with full details',
        'Priority, category, and tenant info — everything you need',
        'No chasing tenants for information',
      ],
      sendsWhatsApp: true,
      whatsAppStep: 1,
    },
    {
      icon: Wrench,
      title: 'The right contractor is dispatched instantly',
      subtitle: 'No more calling around for quotes.',
      bullets: [
        'Yarro matches the job to the best contractor on your list',
        'They get the full brief via WhatsApp — photos, access, everything',
        'A contractor portal lets them quote and book in seconds',
      ],
    },
    {
      icon: CalendarCheck,
      title: 'Jobs are scheduled and everyone stays in the loop',
      subtitle: 'Tenants, contractors, and landlords — all updated automatically.',
      bullets: [
        'Once approved, the job is booked automatically',
        'The tenant knows exactly when to expect the visit',
        'You get confirmation without sending a single message',
      ],
      sendsWhatsApp: true,
      whatsAppStep: 2,
    },
    {
      icon: ClipboardCheck,
      title: 'Every job has a complete audit trail',
      subtitle: 'Compliance-ready. Dispute-proof. Export-ready.',
      bullets: [
        'Photos, timestamps, and messages — all logged automatically',
        'See who said what, when, and what was agreed',
        'Ready for landlords, insurers, or council inspections',
      ],
    },
  ]
}

export function DemoWalkthrough({ onComplete, issue }: { onComplete: () => void; issue: DemoIssue }) {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [currentPage, setCurrentPage] = useState(0)
  const [sending, setSending] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const pages = buildPages(issue)
  const page = pages[currentPage]
  const isLast = currentPage === pages.length - 1
  const isFirst = currentPage === 0

  const handleContinue = async () => {
    // Send WhatsApp for the NEXT page if it has one
    const nextPage = pages[currentPage + 1]
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
        toast.info('Demo message preview — WhatsApp send will be available soon')
      }
      setSending(false)
    }

    if (isLast) {
      setDismissing(true)
      setTimeout(() => onComplete(), 600)
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
              {pages.map((_, i) => (
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

          {/* Split screen */}
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
              <h2 className="text-2xl font-bold text-foreground leading-tight mb-2">
                {page.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">{page.subtitle}</p>
              <ul className="space-y-3 mb-8">
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
