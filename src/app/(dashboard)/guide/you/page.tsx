'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { Bell, CheckCircle, MessageSquare, ClipboardList, AlertTriangle } from 'lucide-react'

const PM_GUIDE_TEXT = `HOW TO USE YARRO AS A PROPERTY MANAGER

1. YOU'LL BE NOTIFIED VIA WHATSAPP
When tenants report issues, you'll receive WhatsApp notifications about:
- New tickets created
- Contractor quotes received
- Jobs that need your approval
- Completed jobs

2. REVIEW CONTRACTOR QUOTES
When a contractor responds with a quote:
- You'll see the quoted amount
- Check if it's within the landlord's auto-approve limit
- If above the limit, the landlord will be asked to approve

3. APPROVE OR DECLINE QUOTES
When a quote needs your decision:
- Tap "Approve" or "Decline" in your WhatsApp notification
- If approving, you can add a markup amount
- You can also manage decisions from this dashboard

4. HANDLE HANDOFFS
When the AI can't complete a ticket automatically:
- You'll see it marked as "Handoff" on the dashboard
- Review the conversation history
- Complete the ticket manually with the right details

5. MONITOR YOUR DASHBOARD
Your dashboard shows:
- Tickets needing attention
- Jobs awaiting contractor response
- Scheduled visits
- Landlord decisions pending

TIPS:
- Check the dashboard daily for items needing attention
- Respond to WhatsApp notifications promptly
- Keep contractor and landlord details up to date`

export default function PMGuidePage() {
  return (
    <div className="h-full bg-gradient-to-br from-blue-50/50 via-background to-cyan-50/30 dark:from-background dark:via-background dark:to-background">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Product Guide</h1>
          <p className="text-muted-foreground mt-1">
            Your complete guide to Yarro property management
          </p>
        </div>

        {/* Tabs */}
        <GuideTabs />

        {/* Content - full width */}
        <div>
          <CopyableGuide title="For You (Property Manager)" content={PM_GUIDE_TEXT}>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                How Yarro works for you as a property manager.
              </p>

              {/* Two column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column - Steps 1-4 */}
                <div className="space-y-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">1. You'll Be Notified via WhatsApp</h3>
                      <p className="text-sm text-muted-foreground mt-1">When tenants report issues, you'll receive notifications about:</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>New tickets created</li>
                        <li>Contractor quotes received</li>
                        <li>Jobs that need your approval</li>
                        <li>Completed jobs</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">2. Review Contractor Quotes</h3>
                      <p className="text-sm text-muted-foreground mt-1">When a contractor responds with a quote:</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>You'll see the quoted amount</li>
                        <li>Check if it's within the landlord's auto-approve limit</li>
                        <li>If above the limit, the landlord will be asked to approve</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">3. Approve or Decline Quotes</h3>
                      <p className="text-sm text-muted-foreground mt-1">When a quote needs your decision:</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Tap "Approve" or "Decline" in your WhatsApp notification</li>
                        <li>If approving, you can add a markup amount</li>
                        <li>You can also manage decisions from this dashboard</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">4. Handle Handoffs</h3>
                      <p className="text-sm text-muted-foreground mt-1">When the AI can't complete a ticket automatically:</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>You'll see it marked as "Handoff" on the dashboard</li>
                        <li>Review the conversation history</li>
                        <li>Complete the ticket manually with the right details</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right column - Step 5 and Tips */}
                <div className="space-y-6">
                  {/* Step 5 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-card-foreground">5. Monitor Your Dashboard</h3>
                      <p className="text-sm text-muted-foreground mt-1">Your dashboard shows:</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Tickets needing attention</li>
                        <li>Jobs awaiting contractor response</li>
                        <li>Scheduled visits</li>
                        <li>Landlord decisions pending</li>
                      </ul>
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                    <h4 className="font-medium text-card-foreground mb-2">Tips</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Check the dashboard daily for items needing attention</li>
                      <li>Respond to WhatsApp notifications promptly</li>
                      <li>Keep contractor and landlord details up to date</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CopyableGuide>
        </div>
      </div>
    </div>
  )
}
