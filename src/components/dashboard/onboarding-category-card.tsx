'use client'

import Link from 'next/link'
import { Rocket, ChevronRight, Check, ArrowRight } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

export interface OnboardingChecklistItem {
  key: string
  label: string
  description: string
  complete: boolean
  count: number
  link_href: string
}

interface OnboardingCategoryCardProps {
  items: OnboardingChecklistItem[]
  expanded: boolean
  onToggle: () => void
}

export function OnboardingCategoryCard({ items, expanded, onToggle }: OnboardingCategoryCardProps) {
  const doneCount = items.filter(i => i.complete).length
  const allDone = doneCount === items.length

  if (allDone) return null

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <style jsx>{`
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 8px rgba(59, 130, 246, 0.15), 0 0 20px rgba(59, 130, 246, 0.05);
          }
          50% {
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.1);
          }
        }
      `}</style>
      <div
        className="rounded-xl border border-primary/30 mx-3 my-3 overflow-hidden relative z-50 bg-card"
        style={{ animation: 'glow-pulse 2s ease-in-out infinite' }}
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-4 px-6 py-5 hover:bg-primary/5 transition-colors cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Rocket className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-base font-semibold text-foreground">Getting Started</p>
              <p className="text-xs text-muted-foreground mt-0.5">{doneCount}/{items.length} complete</p>
            </div>
            <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="divide-y divide-border/40 border-t border-border/40">
            {items.map(item => (
              <Link
                key={item.key}
                href={item.link_href}
                className={`flex items-center gap-3 px-6 py-4 hover:bg-muted/30 transition-colors ${
                  item.complete ? 'opacity-50' : ''
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.complete
                    ? 'bg-success/10'
                    : 'border-2 border-primary/30'
                }`}>
                  {item.complete && <Check className="w-3.5 h-3.5 text-success" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${item.complete ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                </div>
                {!item.complete && (
                  <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
                )}
              </Link>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
