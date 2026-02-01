'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { MessageSquare, ClipboardList, Bell } from 'lucide-react'

const TENANT_GUIDE_TEXT = `HOW TO REPORT MAINTENANCE ISSUES

1. START A CONVERSATION
Send a WhatsApp message to report your maintenance issue.
Tip: One issue per conversation works best.

2. FOLLOW THE PROMPTS
Our assistant will ask for:
- Your property address
- Description of the issue
- Photos if helpful
- Your availability for a repair visit

3. WAIT FOR UPDATES
You'll automatically hear when:
- A contractor is assigned
- A visit is scheduled

That's it! Just follow the conversation, send one message at a time, and wait for replies. We handle the rest.`

export default function TenantGuidePage() {
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
          <CopyableGuide title="For Your Tenants" content={TENANT_GUIDE_TEXT}>
            <div className="h-full flex flex-col gap-4">
              <p className="text-sm text-muted-foreground flex-shrink-0">
                Share this guide with your tenants so they know how to report maintenance issues.
              </p>

              {/* Grid layout - 2 columns on large screens */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 flex-1">
                {/* Step 1 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground">1. Start a Conversation</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Send a WhatsApp message to report your maintenance issue.
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 bg-blue-500/10 inline-block px-2 py-1 rounded">
                      Tip: One issue per conversation works best.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground">2. Follow the Prompts</h3>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                      <li>Your property address</li>
                      <li>Description of the issue</li>
                      <li>Photos if helpful</li>
                      <li>Your availability for repair</li>
                    </ul>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-card-foreground">3. Wait for Updates</h3>
                    <p className="text-sm text-muted-foreground mt-1">You'll automatically hear when:</p>
                    <ul className="text-sm text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                      <li>A contractor is assigned</li>
                      <li>A visit is scheduled</li>
                    </ul>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                  <h4 className="font-semibold text-card-foreground mb-1">That's It!</h4>
                  <p className="text-sm text-muted-foreground">
                    Just follow the conversation, send one message at a time, and wait for replies. We handle the rest.
                  </p>
                </div>
              </div>
            </div>
          </CopyableGuide>
        </div>
      </div>
    </div>
  )
}
