'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { WhatsAppPreview } from '@/components/whatsapp-preview'
import { Bell, ThumbsUp } from 'lucide-react'
import { PageShell } from '@/components/page-shell'

const LANDLORD_GUIDE_TEXT = `HOW YARRO WORKS FOR LANDLORDS

1. GET NOTIFIED
When a maintenance ticket is created for your property, you'll receive a WhatsApp notification with:
- Property address
- Issue description
- Category (plumbing, electrical, etc.)

2. APPROVE QUOTES (WHEN NEEDED)
If the quoted cost is ABOVE your auto-approve limit:
- You'll be asked to approve or decline
- Tap "Approve" to proceed
- Tap "Decline" to stop the work

If the quote is BELOW your limit, work proceeds automatically.

AUTO-APPROVE LIMITS
Each property can have a different limit. Work below this amount proceeds without your approval. Talk to your PM to adjust.`

export default function LandlordGuidePage() {
  return (
    <PageShell title="Product Guide" subtitle="Your complete guide to Yarro property management" headerExtra={<GuideTabs />}>
      <div className="flex-1 min-h-0 pt-4">
          <CopyableGuide title="For Your Landlords" content={LANDLORD_GUIDE_TEXT}>
            <div className="h-full flex flex-col">
              <p className="text-sm text-muted-foreground mb-4">
                Share this guide with your landlords so they know how approvals and notifications work.
              </p>

              {/* Two column grid - steps on left, info on right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                {/* Left column - 2 steps */}
                <div className="flex flex-col gap-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">1. Get Notified</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">When a ticket is created for your property, you'll receive:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>Property address</li>
                        <li>Issue description</li>
                        <li>Category (plumbing, electrical, etc.)</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <ThumbsUp className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">2. Approve Quotes (When Needed)</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">If the cost is <strong>above</strong> your auto-approve limit:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>Tap "Approve" to proceed</li>
                        <li>Tap "Decline" to stop the work</li>
                      </ul>
                      <p className="text-sm text-success mt-2 bg-success/10 inline-block px-2 py-1 rounded">
                        Below your limit = auto-approved
                      </p>
                    </div>
                  </div>

                </div>

                {/* Right column - preview + info box */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      What it looks like
                    </h4>
                    <WhatsAppPreview
                      label="Example approval request"
                      messages={[
                        { from: 'yarro', text: 'Quote requires your approval\n\nProperty: 14 Elm Street\nIssue: Leaking pipe under the sink\nContractor: Joe\'s Plumbing\nTotal cost: £180\n\nPlease confirm within 24 hours.', actions: ['Approve', 'Decline'] },
                      ]}
                    />
                  </div>

                  <div className="bg-primary/10 rounded-xl p-5 border border-primary/20">
                    <h4 className="text-base font-semibold text-card-foreground mb-2">Auto-Approve Limits</h4>
                    <p className="text-sm text-muted-foreground">
                      Each property can have a different limit. Work below this amount proceeds without your approval. Talk to your PM to adjust.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CopyableGuide>
        </div>
    </PageShell>
  )
}
