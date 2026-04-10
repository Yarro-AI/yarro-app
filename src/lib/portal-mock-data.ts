// Mock data for portal preview route.
// Each portal type has multiple state variants to test different UI states.

import type { TenantTicket, LandlordTicket, OOHTicket, ContractorTicket, TenantPortalData, LandlordPortalData, OOHPortalData, ContractorPortalData, ContractorQuoteData } from './portal-types'

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

// ─── Landlord Portal v2 Mock Data ───────────────────────────────────────

const landlordPortalBase: LandlordPortalData = {
  ticket_id: 'mock-ll-portal-001',
  ticket_ref: '1038',
  property_address: '22 Westfield Lane, Room 4, Birmingham B15 3TQ',
  issue_title: 'Damp patch on bedroom ceiling',
  issue_description: 'Tenant reports a growing damp patch near the window. Approximately 30cm across. No visible leak from above.',
  category: 'Damp / mould',
  priority: 'medium',
  images: ['https://placehold.co/400x300/e2e8f0/64748b?text=Damp+patch', 'https://placehold.co/400x300/e2e8f0/64748b?text=Close+up'],
  date_logged: '2026-03-27T16:40:00Z',
  tenant_name: 'Sarah Chen',
  tenant_phone: '+447700123456',
  agency_name: 'Northgate Property Management',
  agency_phone: '020 7946 0958',
  agency_email: 'maintenance@northgateproperty.co.uk',
  contractor_name: null,
  contractor_phone: null,
  contractor_trade: null,
  submissions: [],
  activity: [
    { message: 'A maintenance issue has been reported at your property. Please review the details.', timestamp: '2026-03-27T16:40:00Z' },
  ],
  resolved_at: null,
}

export const landlordPortalMocks = {
  fresh: { ...landlordPortalBase },

  inProgress: {
    ...landlordPortalBase,
    contractor_name: 'Mike Reynolds Damp Proofing',
    contractor_phone: '+447800111222',
    contractor_trade: 'Damp specialist',
    submissions: [
      { outcome: 'in_progress', notes: 'Contractor coming tomorrow morning', cost: null, submitted_at: '2026-03-29T14:00:00Z' },
    ],
    activity: [
      { message: 'A maintenance issue has been reported at your property. Please review the details.', timestamp: '2026-03-27T16:40:00Z' },
      { message: 'You updated the status to: In progress. "Contractor coming tomorrow morning"', timestamp: '2026-03-29T14:00:00Z' },
    ],
  },

  resolved: {
    ...landlordPortalBase,
    contractor_name: 'Mike Reynolds Damp Proofing',
    contractor_phone: '+447800111222',
    contractor_trade: 'Damp specialist',
    resolved_at: '2026-03-30T10:00:00Z',
    submissions: [
      { outcome: 'in_progress', notes: 'Contractor coming tomorrow morning', cost: null, submitted_at: '2026-03-29T14:00:00Z' },
      { outcome: 'resolved', notes: 'Fixed the leak in the loft. Ceiling dried and repainted.', cost: 280, submitted_at: '2026-03-30T10:00:00Z' },
    ],
    activity: [
      { message: 'A maintenance issue has been reported at your property. Please review the details.', timestamp: '2026-03-27T16:40:00Z' },
      { message: 'You updated the status to: In progress. "Contractor coming tomorrow morning"', timestamp: '2026-03-29T14:00:00Z' },
      { message: 'You marked this issue as resolved. Cost: \u00a3280.00', timestamp: '2026-03-30T10:00:00Z' },
    ],
  },
} as const satisfies Record<string, LandlordPortalData>

// ─── OOH Portal v2 Mock Data ────────────────────────────────────────────

const oohPortalBase: OOHPortalData = {
  ticket_id: 'mock-ooh-portal-001',
  ticket_ref: '1045',
  property_address: '8 Elm Grove, Flat 1, Manchester M14 6PB',
  issue_title: 'Water leak from bathroom ceiling',
  issue_description: 'Water dripping from bathroom ceiling light fitting. Tenant in flat above not answering door. Getting worse.',
  category: 'Plumbing / leak',
  priority: 'emergency',
  images: [],
  date_logged: '2026-03-31T21:45:00Z',
  tenant_name: 'James Okafor',
  tenant_phone: '+447812345678',
  agency_name: 'Northgate Property Management',
  agency_phone: '020 7946 0958',
  agency_email: 'emergency@northgateproperty.co.uk',
  submissions: [],
  activity: [
    { message: 'Emergency callout requested. Please respond as soon as possible.', timestamp: '2026-03-31T21:45:00Z' },
  ],
  resolved_at: null,
}

export const oohPortalMocks = {
  fresh: { ...oohPortalBase },

  inProgress: {
    ...oohPortalBase,
    submissions: [
      { outcome: 'in_progress', notes: 'On site, isolating the water supply now', cost: null, submitted_at: '2026-03-31T22:30:00Z' },
    ],
    activity: [
      { message: 'Emergency callout requested. Please respond as soon as possible.', timestamp: '2026-03-31T21:45:00Z' },
      { message: 'You updated the status to: In progress. "On site, isolating the water supply now"', timestamp: '2026-03-31T22:30:00Z' },
    ],
  },

  resolved: {
    ...oohPortalBase,
    resolved_at: '2026-03-31T23:45:00Z',
    submissions: [
      { outcome: 'in_progress', notes: 'On site, isolating the water supply now', cost: null, submitted_at: '2026-03-31T22:30:00Z' },
      { outcome: 'resolved', notes: 'Burst flexi hose under kitchen sink. Replaced and tested. No further leak.', cost: 150, submitted_at: '2026-03-31T23:45:00Z' },
    ],
    activity: [
      { message: 'Emergency callout requested. Please respond as soon as possible.', timestamp: '2026-03-31T21:45:00Z' },
      { message: 'You updated the status to: In progress. "On site, isolating the water supply now"', timestamp: '2026-03-31T22:30:00Z' },
      { message: 'You marked this as resolved. Cost: \u00a3150.00', timestamp: '2026-03-31T23:45:00Z' },
    ],
  },
} as const satisfies Record<string, OOHPortalData>

// ─── Contractor Portal v2 Mock Data ─────────────────────────────────────

const contractorPortalBase: ContractorPortalData = {
  ticket_id: 'mock-con-portal-001',
  ticket_ref: '1042',
  property_address: '14 Cranbrook Road, Flat 3, London E17 5QJ',
  issue_title: 'Boiler not heating water',
  issue_description: 'The boiler turns on but only produces cold water. The pressure gauge shows 0.5 bar. Started yesterday morning.',
  category: 'Plumbing / heating',
  priority: 'urgent',
  images: ['https://placehold.co/400x300/e2e8f0/64748b?text=Boiler+front', 'https://placehold.co/400x300/e2e8f0/64748b?text=Pressure+gauge'],
  date_logged: '2026-03-28T09:14:00Z',
  scheduled_date: null,
  scheduled_window: null,
  min_booking_lead_hours: 24,
  tenant_name: 'Alex Morgan',
  tenant_phone: '+447700112233',
  availability: 'Available mornings before 11am, or any time on Fridays.',
  agency_name: 'Northgate Property Management',
  agency_phone: '020 7946 0958',
  agency_email: 'maintenance@northgateproperty.co.uk',
  contractor_name: 'Dave Wilson',
  contractor_quote: null,
  activity: [
    { message: 'You\u2019ve been assigned to this job. Please review the details and book a slot.', timestamp: '2026-03-29T11:20:00Z' },
  ],
  resolved_at: null,
  compliance_certificate_id: null,
  compliance_cert_type: null,
  compliance_expiry_date: null,
}

export const contractorPortalMocks = {
  needsScheduling: { ...contractorPortalBase, contractor_quote: 245 },

  booked: {
    ...contractorPortalBase,
    scheduled_date: '2026-04-03T09:00:00Z',
    scheduled_window: '9am \u2013 12pm',
    activity: [
      { message: 'You\u2019ve been assigned to this job. Please review the details and book a slot.', timestamp: '2026-03-29T11:20:00Z' },
      { message: 'Job booked for Thu 3 Apr, 9am \u2013 12pm. The tenant and agency have been notified.', timestamp: '2026-03-31T14:05:00Z' },
    ],
  },

  completed: {
    ...contractorPortalBase,
    scheduled_date: '2026-04-03T09:00:00Z',
    scheduled_window: '9am \u2013 12pm',
    resolved_at: '2026-04-03T11:30:00Z',
    activity: [
      { message: 'You\u2019ve been assigned to this job. Please review the details and book a slot.', timestamp: '2026-03-29T11:20:00Z' },
      { message: 'Job booked for Thu 3 Apr, 9am \u2013 12pm. The tenant and agency have been notified.', timestamp: '2026-03-31T14:05:00Z' },
      { message: 'Job marked as complete. Thank you.', timestamp: '2026-04-03T11:30:00Z' },
    ],
  },
} as const satisfies Record<string, ContractorPortalData>

// ─── Contractor Quote Portal v2 Mock Data ───────────────────────────────

const contractorQuoteBase: ContractorQuoteData = {
  ticket_id: 'mock-quote-001',
  ticket_ref: '1042',
  property_address: '14 Cranbrook Road, Flat 3, London E17 5QJ',
  issue_title: 'Boiler not heating water',
  issue_description: 'The boiler turns on but only produces cold water. The pressure gauge shows 0.5 bar. Started yesterday morning. Tenant has tried represurising but it drops back within an hour.',
  category: 'Plumbing / heating',
  priority: 'urgent',
  images: ['https://placehold.co/400x300/e2e8f0/64748b?text=Boiler+front', 'https://placehold.co/400x300/e2e8f0/64748b?text=Pressure+gauge'],
  date_logged: '2026-03-28T09:14:00Z',
  tenant_name: 'Alex Morgan',
  tenant_phone: '+447700112233',
  availability: 'Available mornings before 11am, or any time on Fridays.',
  agency_name: 'Northgate Property Management',
  agency_phone: '020 7946 0958',
  agency_email: 'maintenance@northgateproperty.co.uk',
  contractor_name: 'Dave Wilson',
  quote_amount: null,
  quote_notes: null,
  quote_status: 'pending',
  min_booking_lead_hours: 24,
}

export const contractorQuoteMocks = {
  fresh: { ...contractorQuoteBase },

  submitted: {
    ...contractorQuoteBase,
    quote_amount: '245.00',
    quote_notes: 'Likely needs a new pressure relief valve and expansion vessel service. Parts included.',
    quote_status: 'submitted',
  },
} as const satisfies Record<string, ContractorQuoteData>

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
    contractor_name: 'Dave Wilson Plumbing',
  },

  booked: {
    ...tenantBase,
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
  },

  bookedWithReschedule: {
    ...tenantBase,
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
    scheduled_date: '2026-04-03T09:00:00Z',
    contractor_name: 'Dave Wilson Plumbing',
    contractor_phone: '+447911234567',
    resolved_at: '2026-04-03T11:30:00Z',
  },

  confirmed: {
    ...tenantBase,
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
  compliance_certificate_id: null,
  compliance_cert_type: null,
  compliance_expiry_date: null,
}

export const contractorMocks = {
  needsScheduling: { ...contractorBase },

  booked: {
    ...contractorBase,
    scheduled_date: '2026-04-03T09:00:00Z',
  },

  completed: {
    ...contractorBase,
    scheduled_date: '2026-04-03T09:00:00Z',
    resolved_at: '2026-04-03T11:30:00Z',
    final_amount: 245,
  },
} as const satisfies Record<string, ContractorTicket>
