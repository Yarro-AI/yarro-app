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

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

import type { Database } from '@/types/database'

/** Full DB row for a compliance certificate — use this instead of local interfaces */
export type ComplianceCertificate =
  Database['public']['Tables']['c1_compliance_certificates']['Row']

// Compliance certificate types — MUST match DB enum `certificate_type` exactly
export const CERTIFICATE_TYPES = [
  'hmo_license',
  'gas_safety',
  'eicr',
  'epc',
  'fire_risk',
  'pat',
  'legionella',
  'smoke_alarms',
  'co_alarms',
] as const

export type CertificateType = (typeof CERTIFICATE_TYPES)[number]

export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  hmo_license: 'HMO Licence',
  gas_safety: 'Gas Safety (CP12)',
  eicr: 'EICR',
  epc: 'EPC',
  fire_risk: 'Fire Risk Assessment',
  pat: 'PAT Testing',
  legionella: 'Legionella Risk Assessment',
  smoke_alarms: 'Smoke Alarms',
  co_alarms: 'CO Alarms',
}

// Maps certificate types to relevant contractor categories for the automation dropdown.
// null = admin task or operator-handled — no contractor dropdown shown.
// Values must match CONTRACTOR_CATEGORIES (case-insensitive comparison in UI).
export const CERT_TYPE_CONTRACTOR_CATEGORIES: Record<CertificateType, string[] | null> = {
  gas_safety: ['Gas', 'Boiler Engineer'],
  eicr: ['Electrician'],
  epc: ['Electrician'],         // EPC assessors often in the Electrician category
  fire_risk: ['Other'],         // Fire risk assessors — no dedicated category yet
  pat: ['Electrician'],
  legionella: ['Plumber'],
  hmo_license: null,            // Admin task — no contractor
  smoke_alarms: null,           // Operator handles
  co_alarms: null,              // Operator handles
}

// Days before expiry to flag as "expiring"
export const COMPLIANCE_EXPIRING_DAYS = 30

// Compute certificate status from expiry date (avoids stale DB values)
export function computeCertificateStatus(
  expiryDate: string | null
): 'valid' | 'expiring' | 'expired' | 'missing' {
  if (!expiryDate) return 'missing'
  const now = new Date()
  const expiry = new Date(expiryDate)
  if (expiry < now) return 'expired'
  const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysUntilExpiry <= COMPLIANCE_EXPIRING_DAYS) return 'expiring'
  return 'valid'
}
