'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { Textarea } from '@/components/ui/textarea'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { toast } from 'sonner'
import { MessageCircle, Bug, Lightbulb, Sparkles, HelpCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug Report', desc: 'Something isn\'t working correctly', icon: Bug, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20 hover:border-red-500/40', activeBg: 'bg-red-500/15 border-red-500/50 ring-2 ring-red-500/20' },
  { value: 'feature', label: 'Feature Request', desc: 'I\'d like Yarro to do something new', icon: Lightbulb, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40', activeBg: 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/20' },
  { value: 'improvement', label: 'Improvement', desc: 'Something could work better', icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40', activeBg: 'bg-blue-500/15 border-blue-500/50 ring-2 ring-blue-500/20' },
  { value: 'general', label: 'General', desc: 'Other feedback or comments', icon: HelpCircle, color: 'text-gray-500', bg: 'bg-gray-500/10 border-gray-500/20 hover:border-gray-500/40', activeBg: 'bg-gray-500/15 border-gray-500/50 ring-2 ring-gray-500/20' },
]

interface FeedbackEntry {
  id: string
  category: string
  message: string
  context: string | null
  created_at: string
}

export default function FeedbackPage() {
  const { propertyManager } = usePM()
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [context, setContext] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEntry[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    supabase
      .from('c1_feedback')
      .select('*')
      .eq('property_manager_id', propertyManager.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setRecentFeedback(data)
      })
  }, [propertyManager, supabase])

  const handleSubmit = async () => {
    if (!message.trim() || !propertyManager) return
    setSending(true)

    const { error } = await supabase.from('c1_feedback').insert({
      property_manager_id: propertyManager.id,
      category,
      message: message.trim(),
      context: context.trim() || null,
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
        context: context.trim() || null,
        created_at: new Date().toISOString(),
      }, ...prev])
      setTimeout(() => {
        setMessage('')
        setContext('')
        setCategory('general')
        setSent(false)
      }, 2000)
    }
    setSending(false)
  }

  const activeCat = FEEDBACK_CATEGORIES.find(c => c.value === category)

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-primary/5 via-background to-blue-500/5 dark:from-primary/10 dark:to-blue-500/10 border-b">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/[0.03] via-transparent to-transparent" />
        <div className="relative px-8 pt-10 pb-8 max-w-4xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Feedback</h1>
              <p className="text-muted-foreground mt-0.5">
                Help us shape Yarro. Every piece of feedback makes the product better.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-8 max-w-4xl space-y-8">
        {/* Category Cards */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">What kind of feedback?</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {FEEDBACK_CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isActive = category === cat.value
              return (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200',
                    isActive ? cat.activeBg : cat.bg
                  )}
                >
                  <Icon className={cn('h-6 w-6', cat.color)} />
                  <div>
                    <p className="text-sm font-medium">{cat.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{cat.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Form */}
        <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-2">
            {activeCat && <activeCat.icon className={cn('h-4 w-4', activeCat.color)} />}
            <h2 className="text-base font-semibold">{activeCat?.label || 'Your Feedback'}</h2>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">What happened?</label>
            <Textarea
              placeholder={
                category === 'bug' ? 'Describe what went wrong, step by step...' :
                category === 'feature' ? 'Describe what you\'d like Yarro to do...' :
                category === 'improvement' ? 'What could work better and how...' :
                'Share your thoughts...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Context <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="Which page were you on? Which ticket? Any other details that help us understand..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <InteractiveHoverButton
              text={sent ? 'Sent!' : sending ? 'Sending...' : 'Send Feedback'}
              onClick={handleSubmit}
              disabled={sending || sent || !message.trim()}
              className={cn('w-44 text-sm h-10', sent && 'bg-emerald-500')}
            />
            {!message.trim() && (
              <p className="text-xs text-muted-foreground">Write something above to send</p>
            )}
          </div>
        </div>

        {/* Recent Feedback Timeline */}
        {recentFeedback.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4">Your Feedback History</h2>
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[17px] top-6 bottom-6 w-px bg-border" />

              <div className="space-y-4">
                {recentFeedback.map((entry) => {
                  const cat = FEEDBACK_CATEGORIES.find(c => c.value === entry.category)
                  const Icon = cat?.icon || HelpCircle
                  return (
                    <div key={entry.id} className="relative flex gap-4">
                      {/* Timeline dot */}
                      <div className={cn(
                        'relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background flex-shrink-0',
                        cat?.bg.split(' ')[0] || 'bg-muted'
                      )}>
                        <Icon className={cn('h-4 w-4', cat?.color || 'text-muted-foreground')} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 bg-card rounded-xl border p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className={cn(
                            'text-xs font-medium px-2.5 py-0.5 rounded-full',
                            cat?.bg.split(' ').slice(0, 2).join(' ') || 'bg-muted'
                          )}>
                            {cat?.label || entry.category}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            {new Date(entry.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{entry.message}</p>
                        {entry.context && (
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{entry.context}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {recentFeedback.length === 0 && (
          <div className="text-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No feedback yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your submitted feedback will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}
