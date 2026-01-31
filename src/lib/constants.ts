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

// Ticket priorities
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

// Tenant roles
export const TENANT_ROLES = ['tenant', 'lead_tenant', 'other'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]
