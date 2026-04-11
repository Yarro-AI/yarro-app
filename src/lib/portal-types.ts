// Shared type definitions for portal pages.
// These match the return shapes of Supabase RPC functions.

// ─── Tenant Portal v2 (two-column redesign) ────────────────────────────

export type PortalActivityEntry = {
  message: string
  timestamp: string
}

export type TenantPortalData = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string
  issue_description: string
  category: string | null
  priority: string
  date_logged: string

  // Scheduling
  scheduled_date: string | null
  scheduled_window: string | null

  // Tenant
  availability: string | null

  // Agency
  agency_name: string
  agency_phone: string | null
  agency_email: string | null

  // Contractor (null until assigned)
  contractor_name: string | null
  contractor_phone: string | null
  contractor_trade: string | null

  // Activity feed
  activity: PortalActivityEntry[]

  // Completion
  resolved_at: string | null
}

// ─── Landlord Portal v2 ─────────────────────────────────────────────────

export type LandlordPortalData = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  date_logged: string

  // Tenant
  tenant_name: string | null
  tenant_phone: string | null

  // Agency
  agency_name: string
  agency_phone: string | null
  agency_email: string | null

  // Contractor (null until assigned)
  contractor_name: string | null
  contractor_phone: string | null
  contractor_trade: string | null

  // Submissions
  submissions: Array<{
    outcome: string
    notes: string | null
    cost: number | null
    submitted_at: string
  }>

  // Activity feed
  activity: PortalActivityEntry[]

  resolved_at: string | null
}

// ─── OOH Portal v2 ─────────────────────────────────────────────────────

export type OOHPortalData = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  date_logged: string

  // Tenant
  tenant_name: string | null
  tenant_phone: string | null

  // Agency
  agency_name: string
  agency_phone: string | null
  agency_email: string | null

  // Submissions
  submissions: Array<{
    outcome: string
    notes: string | null
    cost: number | null
    submitted_at: string
  }>

  // Activity feed
  activity: PortalActivityEntry[]

  resolved_at: string | null
}

// ─── Contractor Quote Portal v2 ─────────────────────────────────────────

export type ContractorQuoteData = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  date_logged: string
  tenant_name: string | null
  tenant_phone: string | null
  availability: string | null
  agency_name: string
  agency_phone: string | null
  agency_email: string | null
  contractor_name: string
  quote_amount: string | null
  quote_notes: string | null
  quote_status: string
  min_booking_lead_hours: number
}

// ─── Contractor Portal v2 ───────────────────────────────────────────────

export type ContractorPortalData = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  date_logged: string

  // Scheduling
  scheduled_date: string | null
  scheduled_window: string | null
  min_booking_lead_hours: number

  // Tenant
  tenant_name: string | null
  tenant_phone: string | null
  availability: string | null

  // Agency
  agency_name: string
  agency_phone: string | null
  agency_email: string | null

  // Contractor
  contractor_name: string | null
  contractor_quote: number | null

  // Activity feed
  activity: PortalActivityEntry[]

  resolved_at: string | null

  // Reschedule
  reschedule_requested: boolean
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null

  // Compliance fields (null for maintenance tickets)
  compliance_certificate_id: string | null
  compliance_cert_type: string | null
  compliance_expiry_date: string | null
}

// ─── Legacy portal types (existing RPC shapes) ─────────────────────────

export type TenantTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string | null
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  availability: string | null
  date_logged: string
  status: string
  scheduled_date: string | null
  contractor_name: string | null
  contractor_phone: string | null
  business_name: string
  reschedule_requested: boolean
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null
  reschedule_decided_at: string | null
  resolved_at: string | null
  confirmation_date: string | null
}

export type ContractorTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string | null
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  availability: string | null
  date_logged: string
  status: string
  contractor_quote: number | null
  final_amount: number | null
  scheduled_date: string | null
  tenant_name: string | null
  tenant_phone: string | null
  business_name: string
  contractor_name: string | null
  reschedule_requested: boolean
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null
  resolved_at: string | null
  tenant_updates: Array<{
    type: string
    notes?: string
    reason?: string
    photos?: string[]
    submitted_at: string
  }>
  min_booking_lead_hours: number
  // Compliance fields (null for maintenance tickets)
  compliance_certificate_id: string | null
  compliance_cert_type: string | null
  compliance_expiry_date: string | null
}

export type QuoteContext = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string | null
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  availability: string | null
  date_logged: string
  status: string
  contractor_name: string
  contractor_id: string
  contractor_status: string
  quote_amount: string | null
  quote_notes: string | null
  business_name: string
  tenant_name: string | null
  access_info: string
}

export type LandlordSubmission = {
  outcome: string
  notes: string | null
  cost: number | null
  submitted_at: string
}

export type LandlordTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_description: string
  issue_title: string | null
  tenant_name: string | null
  tenant_phone: string | null
  priority: string
  business_name: string
  landlord_outcome: string | null
  landlord_outcome_at: string | null
  landlord_notes: string | null
  landlord_cost: number | null
  landlord_submissions: LandlordSubmission[]
}

export type OOHSubmission = {
  outcome: string
  notes: string | null
  cost: number | null
  submitted_at: string
}

export type OOHTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_description: string
  issue_title: string | null
  tenant_name: string | null
  tenant_phone: string | null
  priority: string
  business_name: string
  ooh_outcome: string | null
  ooh_outcome_at: string | null
  ooh_notes: string | null
  ooh_cost: number | null
  ooh_submissions: OOHSubmission[]
}
