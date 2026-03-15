'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { WhatsAppPreview } from '@/components/whatsapp-preview'
import { Bell, CheckCircle, MessageSquare, AlertTriangle, Shield } from 'lucide-react'
import { PageShell } from '@/components/page-shell'

const PM_GUIDE_TEXT = `HOW TO USE YARRO AS A PROPERTY MANAGER

1. YOU'LL BE NOTIFIED VIA WHATSAPP
When tenants report issues, you'll receive WhatsApp notifications about:
- New tickets created
- Contractor quotes received
- Jobs that need your approval
- Job completions

2. APPROVE OR DECLINE QUOTES
When a contractor submits a quote:
- Review and add your markup
- Tap Approve or Decline in WhatsApp
- Landlords approve if above their auto-approve limit

3. HANDLE HANDOFFS
When the AI can't complete a ticket automatically:
- You'll see it marked as "Handoff" on the dashboard
- Review the conversation history
- Complete the ticket manually

4. MONITOR YOUR DASHBOARD
Your dashboard shows:
- Tickets needing attention
- Jobs awaiting contractor response
- Scheduled visits
- Landlord decisions pending

TIPS:
- Check the dashboard daily
- Respond to notifications promptly via WhatsApp
- Keep contractor and landlord details up to date`

export default function GuidePage() {
  return (
    <PageShell title="Product Guide" subtitle="Your complete guide to Yarro property management" headerExtra={<GuideTabs />}>
      <div className="flex-1 min-h-0 pt-4">
          <CopyableGuide title="Getting Started" content={PM_GUIDE_TEXT}>
            <div className="h-full flex flex-col">
              <p className="text-sm text-muted-foreground mb-4">
                How Yarro works for you as a property manager.
              </p>

              {/* Two column grid - steps on left, tips/GDPR on right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                {/* Left column - 4 steps */}
                <div className="flex flex-col gap-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">1. You'll Be Notified via WhatsApp</h3>
                      <ul className="text-sm text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
                        <li>New tickets created</li>
                        <li>Contractor quotes received</li>
                        <li>Jobs needing approval</li>
                        <li>Job completions</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">2. Approve or Decline Quotes</h3>
                      <ul className="text-sm text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
                        <li>Review and add your markup</li>
                        <li>Tap Approve or Decline in WhatsApp</li>
                        <li>Landlords approve if above their limit</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-warning" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">3. Handle Handoffs</h3>
                      <ul className="text-sm text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
                        <li>Marked as "Handoff" on dashboard</li>
                        <li>Review conversation history</li>
                        <li>Complete ticket manually</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">4. Monitor Your Dashboard</h3>
                      <ul className="text-sm text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
                        <li>Tickets needing attention</li>
                        <li>Awaiting contractor response</li>
                        <li>Scheduled visits &amp; pending decisions</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right column - Preview + Tips + Compliance */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      What you&apos;ll receive
                    </h4>
                    <WhatsAppPreview
                      label="Example quote notification"
                      messages={[
                        { from: 'yarro', text: 'Quote received for 14 Elm Street\n\nIssue: Leaking kitchen tap\nContractor: Joe\'s Plumbing\nQuoted amount: £150\n\nTap below to approve or decline.', actions: ['Approve', 'Decline'] },
                      ]}
                    />
                  </div>

                  {/* Tips */}
                  <div className="bg-primary/10 rounded-xl p-5 border border-primary/20">
                    <h4 className="text-base font-semibold text-card-foreground mb-2">Tips</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Check dashboard daily</li>
                      <li>Respond to notifications promptly via WhatsApp</li>
                      <li>Keep contractor/landlord details updated</li>
                    </ul>
                  </div>

                  {/* Compliance Note */}
                  <div className="bg-muted rounded-xl p-5 border border-border">
                    <div className="flex items-start gap-3">
                      <Shield className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-base font-semibold text-card-foreground">Data &amp; AI Compliance</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Yarro uses AI to process tenant messages. All data stored securely per GDPR.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CopyableGuide>
        </div>
    </PageShell>
  )
}
