// Mock data for portal preview route.
// Each portal type has multiple state variants to test different UI states.

import type { TenantTicket, LandlordTicket, OOHTicket, ContractorTicket, TenantPortalData } from './portal-types'

// ─── Tenant Portal v2 Mock Data ─────────────────────────────────────────

const tenantPortalBase: TenantPortalData = {
  ticket_id: 'mock-portal-001',
  ticket_ref: '1042',
  property_address: '14 Cranbrook Road, Flat 3, London E17 5QJ',
  issue_title: 'Boiler not heating water',
  issue_description: 'The boiler turns on but only produces cold water. The pressure gauge shows 0.5 bar. Started yesterday morning.',
  category: 'Plumbing / heating',
  priority: 'urgent',
  date_logged: '2026-03-28T09:14:00Z',
  job_stage: 'reported',
  scheduled_date: null,
  scheduled_window: null,
  availability: 'Available mornings before 11am, or any time on Fridays.',
  agency_name: 'Northgate Property Management',
  agency_phone: '020 7946 0958',
  agency_email: 'maintenance@northgateproperty.co.uk',
  contractor_name: null,
  contractor_phone: null,
  contractor_trade: null,
  activity: [
    { message: 'Your report has been received and is being reviewed by Northgate Property Management.', timestamp: '2026-03-28T09:14:00Z' },
  ],
  resolved_at: null,
}

export const tenantPortalMocks = {
  reported: { ...tenantPortalBase },

  contractorFound: {
    ...tenantPortalBase,
    job_stage: 'sent',
    contractor_name: 'Dave Wilson',
    contractor_phone: '+447911234567',
    contractor_trade: 'Plumber / heating engineer',
    activity: [
      { message: 'Your report has been received and is being reviewed by Northgate Property Management.', timestamp: '2026-03-28T09:14:00Z' },
      { message: 'A contractor has been identified and is being contacted. We\u2019ll confirm a visit time shortly.', timestamp: '2026-03-29T11:20:00Z' },
    ],
  },

  booked: {
    ...tenantPortalBase,
    job_stage: 'booked',
    scheduled_date: '2026-04-03T09:00:00Z',
    scheduled_window: '9am \u2013 12pm',
    contractor_name: 'Dave Wilson',
    contractor_phone: '+447911234567',
    contractor_trade: 'Plumber / heating engineer',
    activity: [
      { message: 'Your report has been received and is being reviewed by Northgate Property Management.', timestamp: '2026-03-28T09:14:00Z' },
      { message: 'A contractor has been identified and is being contacted. We\u2019ll confirm a visit time shortly.', timestamp: '2026-03-29T11:20:00Z' },
      { message: 'Your job has been booked for Thu 3 Apr. The contractor will arrive between 9am \u2013 12pm.', timestamp: '2026-03-31T14:05:00Z' },
    ],
  },

  completed: {
    ...tenantPortalBase,
    job_stage: 'completed',
    scheduled_date: '2026-04-03T09:00:00Z',
    scheduled_window: '9am \u2013 12pm',
    contractor_name: 'Dave Wilson',
    contractor_phone: '+447911234567',
    contractor_trade: 'Plumber / heating engineer',
    resolved_at: '2026-04-03T11:30:00Z',
    activity: [
      { message: 'Your report has been received and is being reviewed by Northgate Property Management.', timestamp: '2026-03-28T09:14:00Z' },
      { message: 'A contractor has been identified and is being contacted. We\u2019ll confirm a visit time shortly.', timestamp: '2026-03-29T11:20:00Z' },
      { message: 'Your job has been booked for Thu 3 Apr. The contractor will arrive between 9am \u2013 12pm.', timestamp: '2026-03-31T14:05:00Z' },
      { message: 'Your job has been marked as complete. Please contact us if the issue persists.', timestamp: '2026-04-03T11:30:00Z' },
    ],
  },
} as const satisfies Record<string, TenantPortalData>

// ─── Tenant Mock Data (legacy) ──────────────────────────────────────────

const tenantBase: TenantTicket = {
  ticket_id: 'mock-tenant-001',
  ticket_ref: '1042',
  property_address: '14 Cranbrook Road, Flat 3, London E17 5QJ',
  issue_title: 'Boiler not heating water',
  issue_description: 'The boiler turns on but only produces cold water. The pressure gauge shows 0.5 bar. Started yesterday morning.',
  category: 'Plumbing',
  priority: 'high',
  images: [],
  availability: 'Available mornings before 11am, or any time on Fridays.',
  date_logged: '2026-03-28T09:15:00Z',
  status: 'open',
  job_stage: 'reported',
  scheduled_date: null,
  contractor_name: null,
  contractor_phone: null,
  business_name: 'Metro Property Management',
  reschedule_requested: false,
  reschedule_date: null,
  reschedule_reason: null,
  reschedule_status: null,
  reschedule_decided_at: null,
  resolved_at: null,
  confirmation_date: null,
}

export const tenantMocks = {
  reported: { ...tenantBase },

  contractorFound: {
    ...tenantBase,
    job_stage: 'sent',
    contractor_name: 'Dave Wilson Plumbing',
  },

  booked: {
    ...tenantBase,
    job_stage: 'booked',
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
  },

  bookedWithReschedule: {
    ...tenantBase,
    job_stage: 'booked',
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
    reschedule_requested: true,
    reschedule_date: '2026-04-05',
    reschedule_reason: 'I have a hospital appointment that morning',
    reschedule_status: 'pending' as const,
  },

  completedAwaitingConfirmation: {
    ...tenantBase,
    job_stage: 'completed',
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
    resolved_at: '2026-04-03T11:30:00Z',
  },

  confirmed: {
    ...tenantBase,
    job_stage: 'completed',
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
    resolved_at: '2026-04-03T11:30:00Z',
    confirmation_date: '2026-04-03T14:00:00Z',
  },
} as const satisfies Record<string, TenantTicket>

// ─── Landlord Mock Data ─────────────────────────────────────────────────

const landlordBase: LandlordTicket = {
  ticket_id: 'mock-landlord-001',
  ticket_ref: '1038',
  property_address: '22 Westfield Lane, Room 4, Birmingham B15 3TQ',
  issue_title: 'Damp patch on bedroom ceiling',
  issue_description: 'Tenant reports a growing damp patch near the window. Approximately 30cm across. No visible leak from above.',
  tenant_name: 'Sarah Chen',
  tenant_phone: '+447700123456',
  priority: 'medium',
  business_name: 'Metro Property Management',
  landlord_outcome: null,
  landlord_outcome_at: null,
  landlord_notes: null,
  landlord_cost: null,
  landlord_submissions: [],
}

export const landlordMocks = {
  fresh: { ...landlordBase },

  withSubmissions: {
    ...landlordBase,
    landlord_outcome: 'in_progress',
    landlord_outcome_at: '2026-03-29T14:00:00Z',
    landlord_notes: 'Contractor coming tomorrow morning',
    landlord_submissions: [
      { outcome: 'in_progress', notes: 'Contractor coming tomorrow morning', cost: null, submitted_at: '2026-03-29T14:00:00Z' },
    ],
  },

  resolved: {
    ...landlordBase,
    landlord_outcome: 'resolved',
    landlord_outcome_at: '2026-03-30T10:00:00Z',
    landlord_notes: 'Fixed the leak in the loft. Ceiling dried and repainted.',
    landlord_cost: 280,
    landlord_submissions: [
      { outcome: 'in_progress', notes: 'Contractor coming tomorrow morning', cost: null, submitted_at: '2026-03-29T14:00:00Z' },
      { outcome: 'resolved', notes: 'Fixed the leak in the loft. Ceiling dried and repainted.', cost: 280, submitted_at: '2026-03-30T10:00:00Z' },
    ],
  },
} as const satisfies Record<string, LandlordTicket>

// ─── OOH Mock Data ──────────────────────────────────────────────────────

const oohBase: OOHTicket = {
  ticket_id: 'mock-ooh-001',
  ticket_ref: '1045',
  property_address: '8 Elm Grove, Flat 1, Manchester M14 6PB',
  issue_title: 'Water leak from bathroom ceiling',
  issue_description: 'Water dripping from bathroom ceiling light fitting. Tenant in flat above not answering door. Getting worse.',
  tenant_name: 'James Okafor',
  tenant_phone: '+447812345678',
  priority: 'emergency',
  business_name: 'Metro Property Management',
  ooh_outcome: null,
  ooh_outcome_at: null,
  ooh_notes: null,
  ooh_cost: null,
  ooh_submissions: [],
}

export const oohMocks = {
  fresh: { ...oohBase },

  inProgress: {
    ...oohBase,
    ooh_outcome: 'in_progress',
    ooh_outcome_at: '2026-03-31T22:30:00Z',
    ooh_notes: 'On site, isolating the water supply now',
    ooh_submissions: [
      { outcome: 'in_progress', notes: 'On site, isolating the water supply now', cost: null, submitted_at: '2026-03-31T22:30:00Z' },
    ],
  },

  resolved: {
    ...oohBase,
    ooh_outcome: 'resolved',
    ooh_outcome_at: '2026-03-31T23:45:00Z',
    ooh_notes: 'Isolated water to flat above. Burst flexi hose under kitchen sink. Replaced and tested. No further leak.',
    ooh_cost: 150,
    ooh_submissions: [
      { outcome: 'in_progress', notes: 'On site, isolating the water supply now', cost: null, submitted_at: '2026-03-31T22:30:00Z' },
      { outcome: 'resolved', notes: 'Isolated water to flat above. Burst flexi hose under kitchen sink. Replaced and tested. No further leak.', cost: 150, submitted_at: '2026-03-31T23:45:00Z' },
    ],
  },
} as const satisfies Record<string, OOHTicket>

// ─── Contractor Mock Data ───────────────────────────────────────────────

const contractorBase: ContractorTicket = {
  ticket_id: 'mock-contractor-001',
  ticket_ref: '1042',
  property_address: '14 Cranbrook Road, Flat 3, London E17 5QJ',
  issue_title: 'Boiler not heating water',
  issue_description: 'The boiler turns on but only produces cold water. The pressure gauge shows 0.5 bar.',
  category: 'Plumbing',
  priority: 'high',
  images: [],
  availability: 'Available mornings before 11am, or any time on Fridays.',
  date_logged: '2026-03-28T09:15:00Z',
  status: 'open',
  job_stage: 'sent',
  contractor_quote: null,
  final_amount: null,
  scheduled_date: null,
  tenant_name: 'Alex Morgan',
  tenant_phone: '+447700112233',
  business_name: 'Metro Property Management',
  contractor_name: 'Dave Wilson Plumbing',
  reschedule_requested: false,
  reschedule_date: null,
  reschedule_reason: null,
  reschedule_status: null,
  resolved_at: null,
  tenant_updates: [],
  min_booking_lead_hours: 24,
}

export const contractorMocks = {
  needsScheduling: { ...contractorBase },

  booked: {
    ...contractorBase,
    job_stage: 'booked',
    scheduled_date: '2026-04-03T09:00:00Z',
  },

  completed: {
    ...contractorBase,
    job_stage: 'completed',
    scheduled_date: '2026-04-03T09:00:00Z',
    resolved_at: '2026-04-03T11:30:00Z',
    final_amount: 245,
  },
} as const satisfies Record<string, ContractorTicket>
