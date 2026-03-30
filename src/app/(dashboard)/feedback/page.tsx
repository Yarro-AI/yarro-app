'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { Textarea } from '@/components/ui/textarea'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Bug, Lightbulb, Sparkles, HelpCircle, CheckCircle2, Clock, Ticket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/page-shell'

const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug Report', desc: 'Something isn\'t working correctly', icon: Bug, color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20 hover:border-danger/40', activeBorder: 'border-danger/50 ring-2 ring-danger/20', activeBg: 'bg-danger/15' },
  { value: 'feature', label: 'Feature Request', desc: 'I\'d like Yarro to do something new', icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20 hover:border-warning/40', activeBorder: 'border-warning/50 ring-2 ring-warning/20', activeBg: 'bg-warning/15' },
  { value: 'improvement', label: 'Improvement', desc: 'Something could work better', icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20 hover:border-primary/40', activeBorder: 'border-primary/50 ring-2 ring-primary/20', activeBg: 'bg-primary/15' },
  { value: 'general', label: 'General', desc: 'Other feedback or comments', icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border hover:border-border/60', activeBorder: 'border-border ring-2 ring-border/40', activeBg: 'bg-muted' },
]

interface FeedbackEntry {
  id: string
  category: string
  message: string
  ticket_id: string | null
  created_at: string
}

interface TicketOption {
  id: string
  issue_description: string
  category: string | null
  date_logged: string
}

export default function FeedbackPage() {
  const { propertyManager } = usePM()
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [ticketId, setTicketId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEntry[]>([])
  const [tickets, setTickets] = useState<TicketOption[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    // Fetch recent feedback
    supabase
      .from('c1_feedback')
      .select('id, category, message, ticket_id, created_at')
      .eq('property_manager_id', propertyManager.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRecentFeedback(data)
      })
    // Fetch tickets for dropdown
    supabase
      .from('c1_tickets')
      .select('id, issue_description, category, date_logged')
      .eq('property_manager_id', propertyManager.id)
      .order('date_logged', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setTickets(data)
      })
  }, [propertyManager, supabase])

  const handleSubmit = async () => {
    if (!message.trim() || !propertyManager) return
    setSending(true)

    const { error } = await supabase.from('c1_feedback').insert({
      property_manager_id: propertyManager.id,
      category,
      message: message.trim(),
      ticket_id: ticketId,
    })

    if (error) {
      toast.error('Failed to send feedback')
    } else {
      toast.success('Thanks for your feedback!')
      setSent(true)
      setRecentFeedback(prev => [{
        id: crypto.randomUUID(),
        category,
        message: message.trim(),
        ticket_id: ticketId,
        created_at: new Date().toISOString(),
      }, ...prev])
      setTimeout(() => {
        setMessage('')
        setTicketId(null)
        setCategory('general')
        setSent(false)
      }, 2000)
    }
    setSending(false)
  }

  const activeCat = FEEDBACK_CATEGORIES.find(c => c.value === category)

  return (
    <PageShell title="Feedback" subtitle="Help us shape Yarro. Every piece of feedback makes the product better.">

      {/* Main content — fills remaining space, no page scroll */}
      <div className="flex-1 overflow-hidden flex flex-col gap-6">

        {/* Category Buttons — always visible, no scroll */}
        <div className="flex-shrink-0">
          <p className="text-sm font-medium text-muted-foreground mb-2">What kind of feedback?</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {FEEDBACK_CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isActive = category === cat.value
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 cursor-pointer',
                    'hover:shadow-sm active:scale-[0.98]',
                    isActive
                      ? cn(cat.activeBg, cat.activeBorder)
                      : cn(cat.bg, cat.border)
                  )}
                >
                  <div className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0',
                    isActive ? 'bg-white/10' : 'bg-white/5'
                  )}>
                    <Icon className={cn('h-5 w-5', cat.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{cat.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{cat.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Form + History — scrollable area */}
        <div className="flex-1 overflow-hidden flex gap-6 min-h-0">
          {/* Left: Form */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-card rounded-2xl border shadow-sm p-5 flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                {activeCat && <activeCat.icon className={cn('h-4 w-4', activeCat.color)} />}
                <h2 className="text-base font-semibold">{activeCat?.label || 'Your Feedback'}</h2>
              </div>

              <div className="space-y-4 flex-1 flex flex-col min-h-0">
                <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
                  <label className="text-sm font-medium flex-shrink-0">What happened?</label>
                  <Textarea
                    placeholder={
                      category === 'bug' ? 'Describe what went wrong, step by step...' :
                      category === 'feature' ? 'Describe what you\'d like Yarro to do...' :
                      category === 'improvement' ? 'What could work better and how...' :
                      'Share your thoughts...'
                    }
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="flex-1 min-h-[80px] text-sm resize-none"
                  />
                </div>

                <div className="space-y-1.5 flex-shrink-0">
                  <label className="text-sm font-medium">
                    Related Ticket <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Select value={ticketId || 'none'} onValueChange={(v) => setTicketId(v === 'none' ? null : v)}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Attach a ticket..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No ticket</SelectItem>
                      {tickets.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <Ticket className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{t.issue_description?.slice(0, 60) || 'Untitled'}</span>
                            {t.category && <span className="text-xs text-muted-foreground">({t.category})</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-4 pt-1 flex-shrink-0">
                  <InteractiveHoverButton
                    text={sent ? 'Sent!' : sending ? 'Sending...' : 'Send Feedback'}
                    onClick={handleSubmit}
                    disabled={sending || sent || !message.trim()}
                    className={cn(sent && 'bg-success text-success-foreground')}
                  />
                  {!message.trim() && (
                    <p className="text-xs text-muted-foreground">Write something above to send</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Feedback History */}
          <div className="w-[400px] flex-shrink-0 flex flex-col min-h-0">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex-shrink-0">Feedback History</h2>

            {recentFeedback.length > 0 ? (
              <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="relative">
                  <div className="absolute left-[17px] top-6 bottom-6 w-px bg-border" />
                  <div className="space-y-3">
                    {recentFeedback.map((entry) => {
                      const cat = FEEDBACK_CATEGORIES.find(c => c.value === entry.category)
                      const Icon = cat?.icon || HelpCircle
                      return (
                        <div key={entry.id} className="relative flex gap-3">
                          <div className={cn(
                            'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background flex-shrink-0',
                            cat?.bg || 'bg-muted'
                          )}>
                            <Icon className={cn('h-3.5 w-3.5', cat?.color || 'text-muted-foreground')} />
                          </div>
                          <div className="flex-1 min-w-0 bg-card rounded-xl border p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className={cn(
                                'text-[10px] font-medium px-2 py-0.5 rounded-full',
                                cat?.bg || 'bg-muted',
                                cat?.border?.split(' ')[0] ? `border ${cat.border.split(' ')[0]}` : 'border'
                              )}>
                                {cat?.label || entry.category}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(entry.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-xs text-foreground leading-relaxed line-clamp-3">{entry.message}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-start justify-center pt-8">
                <div className="bg-card rounded-2xl border shadow-sm p-6 text-center w-full">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mx-auto mb-3">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No feedback yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Your submitted feedback will appear here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  )
}
