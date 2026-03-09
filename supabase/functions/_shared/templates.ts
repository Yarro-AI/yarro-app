// Centralized Twilio WhatsApp Content Template SIDs
// Update this file instead of editing individual Edge Functions

export const TEMPLATES = {
  // ─── Ticket Notifications (yarro-ticket-notify) ───
  pm_ticket: "HXae68475514259fc241bb14e303280420",            // 1_pm_ticket (new copy)
  ticket_review: "HX574419d5b8a0ca86734caecf59f1107f",       // 1_pm_ticket_review
  handoff: "HXee9d75b96aa9a0d094ea51d402b3ed92",              // 1_pm_ticket_handoff

  // ─── OOH Emergency (yarro-ticket-notify) ───
  ooh_emergency_dispatch: "HXf417fee316a93526eedd11634208910a",  // 20_2_ooh_emergency_dispatch

  // ─── Landlord Allocation (yarro-dispatcher) ───
  allocate_landlord: "HX7bd3023fd3694bb77ee2b3e05562e06e",        // 21_allocate_landlord

  // ─── Contractor Dispatch (yarro-dispatcher) ───
  contractor_quote: "HXa0110e2b69a0abe9352d47cd38e7b9ca",     // 3_5_contractor_quote
  pm_quote: "HXb2f9170ecf59525e230c1cb688455f42",             // 4_5_pm_quote_sms
  landlord_quote: "HXb57fad098013e5b3f5d1a13f7df93c1c",       // 5_4_landlord_quote
  no_more_contractors: "HX75fb4cc68b9f1fea2f243cbe41ef3a57",   // 6_no_more_contractors

  // ─── Scheduling (yarro-scheduling) ───
  contractor_job_schedule: "HX3115ee07982bbbeeba4fcbb4997bff78", // 7_contractor_job_schedule
  pm_landlord_approved: "HXc6e017eef871b6874d33812822f95b19",   // 7b_pm_landlord_approved
  landlord_declined: "HXc00be101015bb4abbfce401d5643b7b1",      // 7c_landlord_declined
  tenant_job_booked: "HX49fc2526186b36632036aa8769273c11",       // 8_tenant_job_booked
  pm_ll_job_booked: "HXdcfd3555975ba92d35a1e1c1e74cae16",       // 8b_pm_ll_job_booked

  // ─── Job Reminder (yarro-job-reminder) ───
  contractor_job_reminder: "HXf1caa05744ebf3204a8d92b83d38b915", // 10_contractor_job_reminder

  // ─── Completion (yarro-completion) ───
  pm_job_completed: "HXb9f0020d18249c54127269eca94bf039",        // 11_pm_job_completed
  ll_job_completed: "HXe71c39364f6a2d1c7185629bbb2308ed",        // 11b_ll_job_completed
  pm_job_not_completed: "HXe727b41671d3fe7564f5480de1c98934",    // 11c_pm_job_not_completed

  // ─── Followups (yarro-followups) ───
  contractor_reminder: "HXfca88665335df9e9ffd37b19cd582563",     // 3b_contractor_reminder
  pm_contractor_timeout: "HXd746635799ab8ae73c7506abf6ddade1",   // 6b_pm_contractor_timeout
  landlord_reminder: "HX88fb8839c2c64835c171ea8d915d0a17",       // 5b_landlord_reminder
  completion_followup: "HX0889c61928c4b71a155956ec5ca35287",     // 12_completion_followup
  pm_completion_overdue: "HX3efeb8176e339042febe28ba44e9c4c2",   // 12b_pm_completion_overdue
} as const;

export type TemplateName = keyof typeof TEMPLATES;

/** Short ticket ref for WhatsApp messages — first UUID segment only.
 *  The T- prefix lives in the Twilio template text, NOT in this variable. */
export function shortRef(ticketId: string): string {
  return ticketId.split("-")[0];
}
