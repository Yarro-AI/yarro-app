'use client'

import { GuideTabs } from '@/components/guide-tabs'
import { CopyableGuide } from '@/components/copyable-guide'
import { WhatsAppPreview } from '@/components/whatsapp-preview'
import { MessageSquare, ClipboardList, Bell } from 'lucide-react'
import { PageShell } from '@/components/page-shell'

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

TIPS
- Send one message at a time
- Wait for replies before sending more
- Include photos when helpful`

export default function TenantGuidePage() {
  return (
    <PageShell title="Product Guide" subtitle="Your complete guide to Yarro property management" headerExtra={<GuideTabs />}>
      <div className="flex-1 min-h-0 pt-4">
          <CopyableGuide title="For Your Tenants" content={TENANT_GUIDE_TEXT}>
            <div className="h-full flex flex-col">
              <p className="text-sm text-muted-foreground mb-4">
                Share this guide with your tenants so they know how to report maintenance issues.
              </p>

              {/* Two column grid - steps on left, tips on right */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                {/* Left column - 3 steps */}
                <div className="flex flex-col gap-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">1. Start a Conversation</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">
                        Send a WhatsApp message to report your maintenance issue.
                      </p>
                      <p className="text-sm text-primary mt-2 bg-primary/10 inline-block px-2 py-1 rounded">
                        Tip: One issue per conversation works best.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <ClipboardList className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">2. Follow the Prompts</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">Our assistant will ask for:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>Your property address</li>
                        <li>Description of the issue</li>
                        <li>Photos if helpful</li>
                        <li>Your availability for repair</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                      <Bell className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-card-foreground">3. Wait for Updates</h3>
                      <p className="text-sm text-muted-foreground mt-1.5">You'll automatically hear when:</p>
                      <ul className="text-sm text-muted-foreground mt-1 space-y-1 list-disc list-inside">
                        <li>A contractor is assigned</li>
                        <li>A visit is scheduled</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right column - preview + tips */}
                <div className="flex flex-col gap-4">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      What it looks like
                    </h4>
                    <WhatsAppPreview
                      label="Example conversation"
                      messages={[
                        { from: 'user', text: 'Hi, I have a leaking tap in my kitchen' },
                        { from: 'yarro', text: 'Hi! I can help with that. What\'s the address of the property?' },
                        { from: 'user', text: '14 Elm Street, Bristol' },
                        { from: 'yarro', text: 'Thanks! Can you describe the issue in a bit more detail?' },
                        { from: 'user', text: 'The kitchen tap drips constantly, getting worse over the past week' },
                        { from: 'yarro', text: 'Got it. Can you send a photo of the issue?' },
                        { from: 'user', text: '[Photo]' },
                        { from: 'yarro', text: 'Thanks! I\'ve logged your ticket. You\'ll hear from us once a contractor is assigned.' },
                      ]}
                    />
                  </div>

                  <div className="bg-primary/10 rounded-xl p-5 border border-primary/20">
                    <h4 className="text-base font-semibold text-card-foreground mb-2">Tips</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Send one message at a time</li>
                      <li>Wait for replies before sending more</li>
                      <li>Include photos when helpful</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CopyableGuide>
        </div>
    </PageShell>
  )
}
