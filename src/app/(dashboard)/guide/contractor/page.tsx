'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { MessageSquare, PoundSterling, Calendar, CheckCircle } from 'lucide-react'

const CONTRACTOR_GUIDE_TEXT = `HOW YARRO WORKS FOR CONTRACTORS

1. RECEIVE JOB REQUESTS
You'll get WhatsApp messages with quote requests including:
- Property details and access info
- Tenant contact details
- Issue description and photos
- Urgency level

2. SUBMIT YOUR QUOTE
Reply with your estimated cost for the job.
Example: "£200"

3. GET APPROVAL NOTIFICATION
If your quote is approved, you'll receive:
- Confirmation message
- Link to schedule the visit
- Tenant's proposed availability (if provided)

4. COMPLETE THE JOB
- You'll get a reminder on the day
- Reply "COMPLETE" when finished
- Attach a photo of the completed work

TIPS:
- Respond to quotes within 24 hours
- Contact the property manager if you can't complete a job`

export default function ContractorGuidePage() {
  return (
    <div className="h-full bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Product Guide</h1>
          <p className="text-muted-foreground mt-1">
            Your complete guide to Yarro property management
          </p>
        </div>

        {/* Tabs */}
        <GuideTabs />

        {/* Content */}
        <div className="max-w-3xl">
          <CopyableGuide title="For Your Contractors" content={CONTRACTOR_GUIDE_TEXT}>
            <div className="space-y-6">
              <p className="text-sm text-gray-500">
                Share this guide with your contractors so they know how the quote and job process works.
              </p>

              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">1. Receive Job Requests</h3>
                  <p className="text-sm text-gray-600 mt-1">You'll get WhatsApp messages with quote requests including:</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                    <li>Property details and access info</li>
                    <li>Tenant contact details</li>
                    <li>Issue description and photos</li>
                    <li>Urgency level</li>
                  </ul>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <PoundSterling className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">2. Submit Your Quote</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Reply with your estimated cost for the job.
                  </p>
                  <p className="text-xs text-emerald-600 mt-2 bg-emerald-50 inline-block px-2 py-1 rounded">
                    Example: "£200"
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">3. Get Approval Notification</h3>
                  <p className="text-sm text-gray-600 mt-1">If your quote is approved, you'll receive:</p>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                    <li>Confirmation message</li>
                    <li>Link to schedule the visit</li>
                    <li>Tenant's proposed availability (if provided)</li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">4. Complete the Job</h3>
                  <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                    <li>You'll get a reminder on the day</li>
                    <li>Reply "COMPLETE" when finished</li>
                    <li>Attach a photo of the completed work</li>
                  </ul>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Tips</h4>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>Respond to quotes within 24 hours</li>
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
