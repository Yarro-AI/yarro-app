'use client'

import { Input } from '@/components/ui/input'

export interface PMDetailsEntry {
  name: string
  business_name: string
  phone: string
  emergency_contact: string
}

interface StepPMDetailsProps {
  details: PMDetailsEntry
  email: string // From auth, read-only
  onChange: (details: PMDetailsEntry) => void
}

export function StepPMDetails({ details, email, onChange }: StepPMDetailsProps) {
  const updateField = (field: keyof PMDetailsEntry, value: string) => {
    onChange({ ...details, [field]: value })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Your Details</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Let&apos;s set up your property management profile.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name - Required */}
        <div className="space-y-2">
          <label htmlFor="pm-name" className="text-sm font-medium">
            Your Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="pm-name"
            value={details.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Sarah Johnson"
          />
        </div>

        {/* Business Name - Required */}
        <div className="space-y-2">
          <label htmlFor="pm-business" className="text-sm font-medium">
            Business Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="pm-business"
            value={details.business_name}
            onChange={(e) => updateField('business_name', e.target.value)}
            placeholder="Apex Property Management"
          />
        </div>

        {/* Email - Read-only from auth */}
        <div className="space-y-2">
          <label htmlFor="pm-email" className="text-sm font-medium">Email</label>
          <Input
            id="pm-email"
            value={email}
            disabled
            className="bg-muted"
          />
        </div>

        {/* Phone - Required */}
        <div className="space-y-2">
          <label htmlFor="pm-phone" className="text-sm font-medium">
            Phone <span className="text-destructive">*</span>
          </label>
          <Input
            id="pm-phone"
            value={details.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="07700 900123"
          />
        </div>

        {/* Emergency Contact - Optional */}
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="pm-emergency" className="text-sm font-medium">Emergency Contact</label>
          <Input
            id="pm-emergency"
            value={details.emergency_contact}
            onChange={(e) => updateField('emergency_contact', e.target.value)}
            placeholder="07700 900123"
          />
        </div>
      </div>

          </div>
  )
}
