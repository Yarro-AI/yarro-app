// Contractor categories — MUST match DB values exactly
export const CONTRACTOR_CATEGORIES = [
  'Plumber',
  'Electrician',
  'Gas',
  'General / Handyman',
  'Joiner',
  'Locksmith',
  'Pest Control',
  'Cleaning',
  'Decorator',
  'Window Specialist',
  'Roofing / Guttering',
  'Appliance Engineer',
  'Drainage',
  'Boiler Engineer',
  'Gardener',
  'Other',
] as const

export type ContractorCategory = (typeof CONTRACTOR_CATEGORIES)[number]

// Ticket priorities (matches IssueAI v2 classification)
export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent', 'Emergency'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  Low: 'Minor blemish, no functional impact',
  Medium: 'Causing ongoing damage if left',
  High: 'Actively worsening, needs prompt attention',
  Urgent: 'Significant risk, should be resolved same day',
  Emergency: 'Immediate danger to safety or property',
  // Legacy names (backward compat with existing DB records)
  Cosmetic: 'Minor blemish, no functional impact',
  Damaging: 'Causing ongoing damage if left',
  Destructive: 'Actively worsening, needs prompt attention',
}

// SLA windows per priority (in minutes)
export const SLA_WINDOWS: Record<string, number> = {
  Emergency: 60,       // 1 hour
  Urgent: 120,         // 2 hours
  High: 1440,          // 24 hours
  Medium: 10080,       // 7 days
  Low: 20160,          // 14 days
}

// Tenant roles
export const TENANT_ROLES = ['tenant', 'lead_tenant', 'other'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]
