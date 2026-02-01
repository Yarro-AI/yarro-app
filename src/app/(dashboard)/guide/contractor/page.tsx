'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { MessageSquare, PoundSterling, Calendar, CheckCircle } from 'lucide-react'

const CONTRACTOR_GUIDE_TEXT = `HOW YARRO WORKS FOR CONTRACTORS

1. RECEIVE JOB REQUESTS
You'll get WhatsApp messages with quote requests including:
- Property details and access info
- Issue description and photos
- Urgency level

2. SUBMIT YOUR QUOTE
Tap to enter your estimated cost for the job.
Example: "£200"

3. GET APPROVAL NOTIFICATION
If your quote is approved, you'll receive:
- Confirmation message
- Link to schedule the visit
- Tenant's availability (if provided)

4. COMPLETE THE JOB
- You'll get a reminder on the day
- Click the "Complete" button on the message when finished
- Attach a photo of the completed work

TIPS:
- Respond to quotes within 6 hours
- Contact the property manager if you can't complete a job`

export default function ContractorGuidePage() {
  return (
    <div className="h-full overflow-hidden bg-gradient-to-br from-blue-50/50 via-background to-cyan-50/30 dark:from-background dark:via-background dark:to-background">
      <div className="h-full p-6 flex flex-col gap-4 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0">
          <h1 className="text-2xl font-semibold text-foreground">Product Guide</h1>
          <p className="text-muted-foreground text-sm">
            Your complete guide to Yarro property management
          </p>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0">
          <GuideTabs />
        </div>

        {/* Content - fills remaining space */}
        <div className="flex-1 min-h-0">
          <CopyableGuide title="For Your Contractors" content={CONTRACTOR_GUIDE_TEXT}>
            <div className="h-full flex flex-col">
              <p className="text-sm text-muted-foreground mb-4">
                Share this guide with your contractors so they know how the quote and job process works.
              </p>

              {/* Two column grid - all 4 steps on left, tips on right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                {/* Left column - 4 steps */}
                <div className="flex flex-col gap-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">1. Receive Job Requests</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">You'll get WhatsApp messages with:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>Property details and access info</li>
                        <li>Issue description and photos</li>
                        <li>Urgency level</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <PoundSterling className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">2. Submit Your Quote</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">
                        Tap to enter your estimated cost for the job.
                      </p>
                      <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-2 bg-emerald-500/10 inline-block px-2 py-1 rounded">
                        Example: "£200"
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <Calendar className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">3. Get Approval Notification</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">If your quote is approved, you'll receive:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>Confirmation message</li>
                        <li>Link to schedule the visit</li>
                        <li>Tenant's availability (if provided)</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">4. Complete the Job</h3>
                      <ul className="text-sm text-muted-foreground mt-1.5 space-y-1 list-disc list-inside">
                        <li>You'll get a reminder on the day</li>
                        <li>Tap "Complete" when finished</li>
                        <li>Attach a photo of the work</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right column - tips */}
                <div className="flex flex-col gap-4">
                  <div className="bg-blue-500/10 rounded-xl p-5 border border-blue-500/20">
                    <h4 className="text-base font-semibold text-card-foreground mb-2">Tips</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Respond to quotes within 6 hours</li>
                      <li>Contact the property manager if you can't complete a job</li>
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
