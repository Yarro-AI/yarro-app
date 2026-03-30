// Centralized Twilio WhatsApp Content Template SIDs
// Update this file instead of editing individual Edge Functions

export const TEMPLATES = {
  // ─── Ticket Notifications (yarro-ticket-notify) ───
  pm_ticket: "HXae68475514259fc241bb14e303280420",            // 1_pm_ticket (new copy)
  ticket_review: "HX574419d5b8a0ca86734caecf59f1107f",       // 1_pm_ticket_review
  handoff: "HXee9d75b96aa9a0d094ea51d402b3ed92",              // 1_pm_ticket_handoff
  ll_ticket: "HX6cdfda7a2201f058f33c2a4be3ea8efb",            // 1_ll_ticket

  // ─── OOH Emergency (yarro-ticket-notify) ───
  ooh_emergency_dispatch: "HX56ff1b4df78eba8cbdcbbdd8672d82a9",  // 2b_ooh_emergency

  // ─── Landlord Allocation (yarro-dispatcher) ───
  allocate_landlord: "HXeabe4ebe93c1f8d2401c0516bfd376ec",        // 2c_landlord_allocate

  // ─── Contractor Dispatch (yarro-dispatcher) ───
  contractor_quote: "HX15ae5e2d079ff7b0401bd09a767098ab",     // 2_contractor_quote_portal
  pm_quote: "HXfc449642c7c47ae1f85f3d903ee336e1",             // 3_pm_quote
  landlord_quote: "HXc667c8008203a80708c1a1596e4805ea",       // 3b_landlord_quote
  no_more_contractors: "HX158401383297f8b6f9d4848e507ea1b0",   // 2d_no_contractors

  // ─── Scheduling (yarro-scheduling) ───
  contractor_job_schedule: "HXe1297b1dbd016012026d21cfbddd3308", // 4_contractor_schedule
  pm_landlord_approved: "HX5248963ca973dfaa1880b216f336e863",   // 4b_pm_landlord_approved
  pm_auto_approved: "HXe2f046212f2c4a9b7809e85cf0eb0816",      // 4c_pm_auto_approved
  landlord_declined: "HX5cc6505f993cfccd9f8e1e5089bef940",      // 3c_landlord_declined
  pm_job_booked: "HX564f0801aae8a3e9ded1af83efa251d9",          // 5_pm_job_booked
  ll_job_booked: "HXcdb92e07b25d8b27ff8637502aac0784",           // 5b_ll_job_booked
  tenant_job_booked: "HXd7b01922707c8b93d18abec3c3b37be2",       // 5c_tenant_job_booked

  // ─── Job Reminder (yarro-job-reminder) ───
  contractor_job_reminder: "HXda58fda394cba7fc4e91d2b42bd9ee36", // 6_contractor_job
  tenant_job_reminder: "HXe685750335d1aba51926fdd0852b747a",     // 6b_tenant_job_reminder

  // ─── Completion (yarro-completion) ───
  pm_job_completed: "HX3a0180411b1dca11e958c23b6945f4d4",        // 7_pm_job_completed
  ll_job_completed: "HX27c049df0d097f3be7579c201b6453e3",        // 7b_ll_job_completed
  pm_job_not_completed: "HXc8356f238f3d6974b639c3a1e236ef1b",    // 7c_pm_job_not_completed
  tenant_job_completed: "HXb8f048607a9084cc6101ae629da4b8af",    // 7d_tenant_job_completed

  // ─── Portal Links ───
  tenant_portal_link: "HXa9fe8d047800fb7cc5089fe52d8e1c0a",       // 1b_tenant_portal_link

  // ─── Reschedule (portal-driven) ───
  contractor_reschedule_request: "HXf89e32c3c81daadae69441c1ee1f47fc", // 8a_contractor_reschedule
  tenant_reschedule_approved: "HXc23248c496127023fcc734bee2a9a570", // 8b_tenant_reschedule_approve
  tenant_reschedule_declined: "HX5970d0b59e71aa9b65b80a9ea9fc38c9", // 8c_tenant_reschedule_declined
  pm_reschedule_approved: "HXe65aba3e4c039787600546a41f151c54",     // 8d_pm_reschedule_approved

  // ─── Compliance Reminders (yarro-compliance-reminder) ───
  compliance_expiry_operator: "HX8f836e6e12955e849bf09b00e9f71295",  // compliance_expiry_operator_contractor

  // ─── Rent Reminders (yarro-rent-reminder) ───
  // TODO: Create these in Twilio Content API and replace PLACEHOLDER SIDs
  rent_reminder_before:  "HXb413545f2da07b74058e874c66ea605d",   // 3 days before due
  rent_reminder_due:     "PLACEHOLDER_rent_reminder_due",      // on due date — awaiting Twilio approval
  rent_reminder_overdue: "HXf6910c8f67b2d36b6aa22af42e860dd8",  // 3 days overdue

  // ─── Followups (yarro-followups) ───
  contractor_reminder: "HXf09513c99a0af31ae036e7e4c1c69676",     // 9a_contractor_reminder
  pm_contractor_timeout: "HXc377553166d7cb61c84cbcb859502d9e",   // 9b_landlord_reminder
  landlord_reminder: "HX18c20167f4d0dc5dd9b0fdd06bad182c",       // 9c_pm_landlord_timeout
  completion_followup: "HXa29e706f038e74acba7a6cf551daf5a7",     // 9d_completion_reminder
  pm_completion_overdue: "HXfd494c6c71c07de29005ffdfa2958baf",   // 9e_pm_completion_overdue
} as const;

export type TemplateName = keyof typeof TEMPLATES;

/** Short ticket ref for WhatsApp messages — first UUID segment only.
 *  The T- prefix lives in the Twilio template text, NOT in this variable. */
export function shortRef(ticketId: string): string {
  return ticketId.split("-")[0];
}

/** Format UK phone: "447123456789" → "+44 7123 456789" */
export function formatUkPhone(raw: string): string {
  if (!raw) return "N/A";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "N/A";
  if (digits.startsWith("44") && digits.length === 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  return `+${digits}`;
}

/** Friendly date for tenant-facing messages: "Saturday 12th Mar" */
export function formatFriendlyDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const tz = "Europe/London";
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long" }).format(d);
  const day = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric" }).format(d));
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "short" }).format(d);
  const s = ["th", "st", "nd", "rd"];
  const v = day % 100;
  const ordinal = day + (s[(v - 20) % 10] || s[v] || s[0]);
  return `${weekday} ${ordinal} ${month}`;
}

/** Map raw DB category to natural-language job title for messages */
const CATEGORY_DISPLAY: Record<string, string> = {
  "gas": "gas engineer",
  "pest control": "pest control specialist",
  "general / handyman": "handyman",
  "roofing / guttering": "roofer",
  "drainage": "drainage engineer",
  "cctv": "CCTV engineer",
  "cleaning": "cleaner",
};

export function categoryDisplayName(raw: string): string {
  return CATEGORY_DISPLAY[raw.toLowerCase()] || raw.toLowerCase();
}

/** "A plumber" / "An electrician" — article + display-friendly category */
export function withArticle(category: string): string {
  const lower = categoryDisplayName(category);
  const vowels = "aeiou";
  const article = vowels.includes(lower[0]) ? "An" : "A";
  return `${article} ${lower}`;
}

/** Derive "morning" / "afternoon" from a time slot string or ISO start time.
 *  Portal sends "Morning"/"Afternoon"; Fillout sends ISO datetime. */
export function timeOfDay(slotOrIso: string): string {
  const lower = slotOrIso.toLowerCase();
  if (lower === "morning" || lower === "afternoon") return lower;
  // Try parsing as ISO — before 12:00 UK = morning
  const d = new Date(slotOrIso);
  if (!isNaN(d.getTime())) {
    const hour = parseInt(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hour: "2-digit", hour12: false,
    }).format(d));
    return hour < 12 ? "morning" : "afternoon";
  }
  return lower;
}
