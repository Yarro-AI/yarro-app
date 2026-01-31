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
Reply with your estimated cost for the job.
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
          <CopyableGuide title="For Your Contractors" content={CONTRACTOR_GUIDE_TEXT}>
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Share this guide with your contractors so they know how the quote and job process works.
              </p>

              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground">1. Receive Job Requests</h3>
                  <p className="text-sm text-muted-foreground mt-1">You'll get WhatsApp messages with quote requests including:</p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>Property details and access info</li>
                    <li>Issue description and photos</li>
                    <li>Urgency level</li>
                  </ul>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <PoundSterling className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground">2. Submit Your Quote</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Reply with your estimated cost for the job.
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 bg-emerald-500/10 inline-block px-2 py-1 rounded">
                    Example: "£200"
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground">3. Get Approval Notification</h3>
                  <p className="text-sm text-muted-foreground mt-1">If your quote is approved, you'll receive:</p>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>Confirmation message</li>
                    <li>Link to schedule the visit</li>
                    <li>Tenant's availability (if provided)</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground">4. Complete the Job</h3>
                  <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                    <li>You'll get a reminder on the day</li>
                    <li>Click the "Complete" button on the message when finished</li>
                    <li>Attach a photo of the completed work</li>
                  </ul>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                <h4 className="font-medium text-card-foreground mb-2">Tips</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Respond to quotes within 6 hours</li>
                  <li>Contact the property manager if you can't complete a job</li>
                </ul>
              </div>
            </div>
          </CopyableGuide>
        </div>
      </div>
    </div>
  )
}
