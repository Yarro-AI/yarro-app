// Email content templates — minimal CTA emails that link to portals
// Each message type maps to a subject + heading + brief body + CTA button

type Vars = Record<string, string>;

interface EmailContent {
  subject: string;
  heading: string;
  body: string;
  cta?: { text: string; url: string };
}

// ─── Content Builders ────────────────────────────────────────────────────

const CONTENT: Record<string, (v: Vars) => EmailContent> = {
  // ─── Contractor Messages ───

  // dispatcher contractor-sms: 1=business_name, 2=address, 3=issue, 4=priority, 5=access, 6=portalToken
  contractor_dispatch: (v) => ({
    subject: `New Job Request — ${v["3"] || "Maintenance issue"}`,
    heading: "New Job Request",
    body: `You have a new maintenance job request from ${v["1"] || "your property manager"} at ${v["2"] || "a property"}.`,
    cta: v["6"] ? { text: "View Details & Submit Quote", url: `https://app.yarro.ai/contractor/${v["6"]}` } : undefined,
  }),

  // scheduling finalize-job: 1=address, 2=issue, 3=quote, 4=access, 5=contractorToken
  contractor_job_schedule: (v) => ({
    subject: `Job Approved — ${v["1"] || "Property"}`,
    heading: "Quote Approved",
    body: `Your quote of ${v["3"] || "the agreed amount"} has been approved for ${v["2"] || "maintenance"} at ${v["1"] || "the property"}. Please schedule the job.`,
    cta: v["5"] ? { text: "Schedule Job", url: `https://app.yarro.ai/contractor/${v["5"]}` } : undefined,
  }),

  // job-reminder: 1=address, 2=issue, 3=slot, 4=access, 5=contractorToken
  contractor_job_reminder: (v) => ({
    subject: `Reminder: Job Today — ${v["1"] || "Property"}`,
    heading: "Job Reminder",
    body: `You have a job scheduled for today at ${v["1"] || "the property"}.`,
    cta: v["5"] ? { text: "View Job Details", url: `https://app.yarro.ai/contractor/${v["5"]}` } : undefined,
  }),

  // followups contractor_reminder: 1=address, 2=issue, 3=business_name, 4=portal_token
  contractor_reminder: (v) => ({
    subject: "Action Required — Pending Job Request",
    heading: "Pending Job Request",
    body: `You have a pending job request at ${v["1"] || "a property"} that needs your attention.`,
    cta: v["4"] ? { text: "Respond Now", url: `https://app.yarro.ai/contractor/${v["4"]}` } : undefined,
  }),

  // followups contractor_completion_reminder: 1=address, 2=issue, 3=scheduled_date, 4=contractor_token
  contractor_completion_reminder: (v) => ({
    subject: `Completion Update Needed — ${v["1"] || "Property"}`,
    heading: "Completion Update Needed",
    body: `Please confirm the job at ${v["1"] || "the property"} has been completed.`,
    cta: v["4"] ? { text: "Update Status", url: `https://app.yarro.ai/contractor/${v["4"]}` } : undefined,
  }),

  // ─── Landlord Messages ───

  // landlord_quote: 1=contractor(+category), 2=address, 3=issue, 4=media, 5=total_cost, 6=token
  landlord_quote: (v) => ({
    subject: `Quote for Approval — ${v["2"] || "Property"}`,
    heading: "Quote for Approval",
    body: `${v["1"] || "A contractor"} has submitted a quote of ${v["5"] || "N/A"} for ${v["3"] || "maintenance"} at ${v["2"] || "your property"}. Please review and approve or decline.`,
    cta: v["6"] ? { text: "Review & Approve", url: `https://app.yarro.ai/landlord/${v["6"]}` } : undefined,
  }),

  // landlord_allocate: 1=address, 2=issue, 3=tenant_name, 4=tenant_phone, 5=business_name, 6=token
  landlord_allocate: (v) => ({
    subject: `Maintenance Issue — ${v["1"] || "Property"}`,
    heading: "Issue Allocated to You",
    body: `A maintenance issue has been reported at ${v["1"] || "your property"} and allocated to you to handle.`,
    cta: v["6"] ? { text: "View & Update", url: `https://app.yarro.ai/landlord/${v["6"]}` } : undefined,
  }),

  // no_more_contractors: 1=address, 2=issue
  no_more_contractors: (v) => ({
    subject: `No Contractors Available — ${v["1"] || "Property"}`,
    heading: "No Contractors Available",
    body: `We were unable to find an available contractor for ${v["2"] || "the maintenance issue"} at ${v["1"] || "your property"}. Your property manager will follow up.`,
  }),

  // ll_job_booked: 1=llName, 2=category, 3=formattedWindow, 4=issue, 5=address, 6=mgrContact
  ll_job_booked: (v) => ({
    subject: `Job Booked — ${v["5"] || "Property"}`,
    heading: "Job Scheduled",
    body: `A ${v["2"] || "contractor"} has been booked for ${v["4"] || "maintenance"} at ${v["5"] || "your property"} on ${v["3"] || "the scheduled date"}.`,
  }),

  // ll_job_completed: 1=address, 2=issue, 3=contrName
  ll_job_completed: (v) => ({
    subject: `Job Completed — ${v["1"] || "Property"}`,
    heading: "Job Completed",
    body: `The maintenance job at ${v["1"] || "your property"} has been completed by ${v["3"] || "the contractor"}.`,
  }),

  // ─── Onboarding Messages ───

  // onboarding_contractor: 1=firstName, 2=businessName
  onboarding_contractor: (v) => ({
    subject: `Welcome to ${v["2"] || "Yarro"}`,
    heading: "Welcome",
    body: `Hi ${v["1"] || "there"}, you've been added as a contractor by ${v["2"] || "your property manager"}. You'll receive job requests and updates through this channel.`,
  }),

  // onboarding_landlord: 1=firstName, 2=businessName
  onboarding_landlord: (v) => ({
    subject: `Welcome to ${v["2"] || "Yarro"}`,
    heading: "Welcome",
    body: `Hi ${v["1"] || "there"}, you've been added as a landlord by ${v["2"] || "your property manager"}. You'll receive property updates and approval requests through this channel.`,
  }),

  // ─── Ticket Notifications ───

  // ll_ticket_created: 1=issue, 2=address, 3=reporter, 4=timestamp
  ll_ticket_created: (v) => ({
    subject: `Maintenance Reported — ${v["2"] || "Property"}`,
    heading: "Maintenance Issue Reported",
    body: `A maintenance issue has been reported at ${v["2"] || "your property"}: ${v["1"] || "maintenance issue"}. We're handling this and will keep you updated.`,
  }),

  // ─── Followup Messages ───

  // landlord_followup: 1=address, 2=issue, 3=contractor, 4=total_cost, 5=hours_elapsed, 6=landlordToken
  landlord_followup: (v) => ({
    subject: `Approval Needed — ${v["1"] || "Property"}`,
    heading: "Quote Awaiting Your Approval",
    body: `A quote of ${v["4"] || "N/A"} from ${v["3"] || "a contractor"} for ${v["2"] || "maintenance"} at ${v["1"] || "your property"} has been awaiting your approval for ${v["5"] || "?"} hours. Please respond at your earliest convenience.`,
    cta: v["6"] ? { text: "Review & Approve", url: `https://app.yarro.ai/landlord/${v["6"]}` } : undefined,
  }),

  // ─── Compliance Reminders ───

  // compliance_expiry_operator: 1=cert_type, 2=address, 3=expiry_date, 4=days_remaining, 5=action_text
  compliance_expiry_operator: (v) => ({
    subject: `Compliance Alert — ${v["1"] || "Certificate"} expires in ${v["4"] || "?"} days`,
    heading: "Certificate Expiring Soon",
    body: `Your ${v["1"] || "certificate"} at ${v["2"] || "your property"} expires on ${v["3"] || "N/A"} (${v["4"] || "?"} days remaining). ${v["5"] || "Log in to arrange renewal."}`,
    cta: { text: "View in Yarro", url: "https://app.yarro.ai/compliance" },
  }),

  // ─── Reschedule Messages ───

  // contractor_reschedule_request: 1=address, 2=issue, 3=proposed_date, 4=reason, 5=contractor_token
  contractor_reschedule_request: (v) => ({
    subject: `Reschedule Request — ${v["1"] || "Property"}`,
    heading: "Reschedule Requested",
    body: `The tenant has requested to reschedule the ${v["2"] || "maintenance"} job at ${v["1"] || "the property"} to ${v["3"] || "a new date"}. Reason: ${v["4"] || "Not provided"}.`,
    cta: v["5"] ? { text: "Review Request", url: `https://app.yarro.ai/contractor/${v["5"]}` } : undefined,
  }),

  // tenant_reschedule_approved: 1=tenantName, 2=issue, 3=address, 4=appointment, 5=tenantToken
  tenant_reschedule_approved: (v) => ({
    subject: `Reschedule Confirmed — ${v["3"] || "Property"}`,
    heading: "Reschedule Confirmed",
    body: `Hi ${v["1"] || "there"}, your reschedule request for ${v["2"] || "the maintenance job"} at ${v["3"] || "your property"} has been approved. Your new appointment is ${v["4"] || "to be confirmed"}.`,
    cta: v["5"] ? { text: "View Booking", url: `https://app.yarro.ai/tenant/${v["5"]}` } : undefined,
  }),

  // tenant_reschedule_declined: 1=tenantName, 2=issue, 3=address, 4=originalAppointment, 5=tenantToken
  tenant_reschedule_declined: (v) => ({
    subject: `Reschedule Declined — ${v["3"] || "Property"}`,
    heading: "Reschedule Declined",
    body: `Hi ${v["1"] || "there"}, your reschedule request for ${v["2"] || "the maintenance job"} at ${v["3"] || "your property"} could not be accommodated. Your original appointment on ${v["4"] || "the scheduled date"} remains as scheduled.`,
    cta: v["5"] ? { text: "View Booking", url: `https://app.yarro.ai/tenant/${v["5"]}` } : undefined,
  }),

  // ─── PM Notifications ───

  // pm_ticket_created: 1=address, 2=issue, 3=priority, 4=reporter, 5=timestamp
  pm_ticket_created: (v) => ({
    subject: `New Ticket — ${v["2"] || "Maintenance issue"}`,
    heading: "New Ticket Created",
    body: `A new ${v["3"] || "maintenance"} ticket has been created at ${v["1"] || "your property"}: ${v["2"] || "maintenance issue"}.`,
    cta: { text: "View in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_ticket_review: 1=address, 2=issue, 3=reporter
  pm_ticket_review: (v) => ({
    subject: `Review Required — ${v["1"] || "Property"}`,
    heading: "Ticket Needs Review",
    body: `A ticket at ${v["1"] || "your property"} needs your review: ${v["2"] || "maintenance issue"}.`,
    cta: { text: "Review in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_handoff: 1=address, 2=issue, 3=reason
  pm_handoff: (v) => ({
    subject: `Handoff Required — ${v["1"] || "Property"}`,
    heading: "Manual Action Needed",
    body: `A ticket at ${v["1"] || "your property"} requires your attention: ${v["2"] || "maintenance issue"}. Reason: ${v["3"] || "Requires manual handling"}.`,
    cta: { text: "View in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_quote: 1=contractor, 2=address, 3=issue, 4=amount, 5=notes
  pm_quote: (v) => ({
    subject: `Quote Received — ${v["4"] || "N/A"} from ${v["1"] || "Contractor"}`,
    heading: "Quote Received",
    body: `${v["1"] || "A contractor"} has quoted ${v["4"] || "N/A"} for ${v["3"] || "maintenance"} at ${v["2"] || "your property"}.`,
    cta: { text: "Review & Approve", url: "https://app.yarro.ai" },
  }),

  // pm_auto_approved: 1=contractor, 2=address, 3=issue, 4=landlord, 5=total, 6=quote, 7=markup
  pm_auto_approved: (v) => ({
    subject: `Auto-Approved — ${v["5"] || "N/A"} at ${v["2"] || "Property"}`,
    heading: "Quote Auto-Approved",
    body: `The quote of ${v["5"] || "N/A"} from ${v["1"] || "the contractor"} for ${v["3"] || "maintenance"} at ${v["2"] || "your property"} has been auto-approved (within your limit). The contractor has been notified to schedule.`,
  }),

  // pm_landlord_approved: 1=contractor, 2=address, 3=issue, 4=landlord, 5=total, 6=quote, 7=markup
  pm_landlord_approved: (v) => ({
    subject: `Landlord Approved — ${v["2"] || "Property"}`,
    heading: "Landlord Approved Quote",
    body: `${v["4"] || "The landlord"} has approved the quote of ${v["5"] || "N/A"} from ${v["1"] || "the contractor"} at ${v["2"] || "your property"}. The contractor has been notified to schedule.`,
  }),

  // landlord_declined: 1=address, 2=issue, 3=total_cost
  landlord_declined: (v) => ({
    subject: `Landlord Declined — ${v["1"] || "Property"}`,
    heading: "Quote Declined by Landlord",
    body: `The landlord has declined the quote of ${v["3"] || "N/A"} for ${v["2"] || "maintenance"} at ${v["1"] || "your property"}. Please review and take action.`,
    cta: { text: "View in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_job_booked: 1=contractor, 2=address, 3=formattedWindow, 4=issue
  pm_job_booked: (v) => ({
    subject: `Job Scheduled — ${v["2"] || "Property"}`,
    heading: "Job Scheduled",
    body: `${v["1"] || "The contractor"} has scheduled the job for ${v["4"] || "maintenance"} at ${v["2"] || "your property"} on ${v["3"] || "the scheduled date"}.`,
  }),

  // pm_job_completed: 1=address, 2=issue, 3=contractor, 4=notes
  pm_job_completed: (v) => ({
    subject: `Job Completed — ${v["1"] || "Property"}`,
    heading: "Job Completed",
    body: `${v["3"] || "The contractor"} has completed the ${v["2"] || "maintenance"} job at ${v["1"] || "your property"}.${v["4"] ? " Notes: " + v["4"] : ""}`,
    cta: { text: "Verify & Close", url: "https://app.yarro.ai" },
  }),

  // pm_job_not_completed: 1=address, 2=issue, 3=contractor, 4=reason
  pm_job_not_completed: (v) => ({
    subject: `Job Not Completed — ${v["1"] || "Property"}`,
    heading: "Job Not Completed",
    body: `${v["3"] || "The contractor"} has reported the ${v["2"] || "maintenance"} job at ${v["1"] || "your property"} as not completed. Reason: ${v["4"] || "Not provided"}.`,
    cta: { text: "Review in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_reschedule_approved: 1=contractor, 2=address, 3=newDate, 4=issue
  pm_reschedule_approved: (v) => ({
    subject: `Reschedule Approved — ${v["2"] || "Property"}`,
    heading: "Reschedule Approved",
    body: `${v["1"] || "The contractor"} has approved the reschedule request for ${v["4"] || "the job"} at ${v["2"] || "your property"}. New date: ${v["3"] || "to be confirmed"}.`,
  }),

  // pm_landlord_timeout: 1=address, 2=issue, 3=hours
  pm_landlord_timeout: (v) => ({
    subject: `Landlord Not Responding — ${v["1"] || "Property"}`,
    heading: "Landlord Timeout",
    body: `The landlord has not responded to the approval request for ${v["2"] || "maintenance"} at ${v["1"] || "your property"} after ${v["3"] || "48"} hours. Please take action.`,
    cta: { text: "View in Dashboard", url: "https://app.yarro.ai" },
  }),

  // pm_completion_overdue: 1=address, 2=issue, 3=contractor, 4=scheduledDate
  pm_completion_overdue: (v) => ({
    subject: `Completion Overdue — ${v["1"] || "Property"}`,
    heading: "Job Completion Overdue",
    body: `${v["3"] || "The contractor"} has not yet confirmed completion of the ${v["2"] || "maintenance"} job at ${v["1"] || "your property"} (scheduled ${v["4"] || "previously"}).`,
    cta: { text: "View in Dashboard", url: "https://app.yarro.ai" },
  }),

  // ─── Tenant Notifications ───

  // onboarding_tenant: 1=firstName, 2=businessName
  onboarding_tenant: (v) => ({
    subject: `Welcome to ${v["2"] || "Yarro"}`,
    heading: "Welcome",
    body: `Hi ${v["1"] || "there"}, you've been registered by ${v["2"] || "your property manager"}. You'll receive maintenance updates and reminders through this channel.`,
  }),

  // tenant_portal_link: 1=tenantName, 2=address, 3=issue, 4=businessName, 5=tenantToken
  tenant_portal_link: (v) => ({
    subject: `Maintenance Update — ${v["2"] || "Property"}`,
    heading: "Maintenance Update",
    body: `Hi ${v["1"] || "there"}, a maintenance issue at ${v["2"] || "your property"} is being handled: ${v["3"] || "maintenance issue"}. You can track progress and updates below.`,
    cta: v["5"] ? { text: "View Progress", url: `https://app.yarro.ai/tenant/${v["5"]}` } : undefined,
  }),

  // tenant_job_booked: 1=tenantName, 2=contractor, 3=formattedWindow, 4=issue, 5=address, 6=contractorPhone, 7=tenantToken
  tenant_job_booked: (v) => ({
    subject: `Job Booked — ${v["5"] || "Property"}`,
    heading: "Maintenance Job Scheduled",
    body: `Hi ${v["1"] || "there"}, ${v["2"] || "a contractor"} has been booked for ${v["4"] || "maintenance"} at ${v["5"] || "your property"} on ${v["3"] || "the scheduled date"}.${v["6"] ? " Contact: " + v["6"] : ""}`,
    cta: v["7"] ? { text: "View Booking", url: `https://app.yarro.ai/tenant/${v["7"]}` } : undefined,
  }),

  // tenant_job_reminder: 1=tenantName, 2=contractor, 3=slot, 4=contractorPhone, 5=address, 6=tenantToken
  tenant_job_reminder: (v) => ({
    subject: `Reminder: Job Today — ${v["5"] || "Property"}`,
    heading: "Job Reminder",
    body: `Hi ${v["1"] || "there"}, ${v["2"] || "the contractor"} is scheduled to visit ${v["5"] || "your property"} today (${v["3"] || "time TBC"}).${v["4"] ? " Contact: " + v["4"] : ""}`,
    cta: v["6"] ? { text: "View Details", url: `https://app.yarro.ai/tenant/${v["6"]}` } : undefined,
  }),

  // tenant_job_completed: 1=tenantName, 2=address, 3=issue, 4=contractor, 5=tenantToken
  tenant_job_completed: (v) => ({
    subject: `Job Completed — ${v["2"] || "Property"}`,
    heading: "Job Completed",
    body: `Hi ${v["1"] || "there"}, the ${v["3"] || "maintenance"} job at ${v["2"] || "your property"} has been completed by ${v["4"] || "the contractor"}. Please confirm if the issue has been resolved.`,
    cta: v["5"] ? { text: "Confirm Resolution", url: `https://app.yarro.ai/tenant/${v["5"]}` } : undefined,
  }),

  // contractor_job_confirmed: same as contractor_job_schedule but for confirmation
  contractor_job_confirmed: (v) => ({
    subject: `Job Confirmed — ${v["1"] || "Property"}`,
    heading: "Job Confirmed",
    body: `Your job at ${v["1"] || "the property"} has been confirmed for ${v["3"] || "the scheduled date"}.`,
    cta: v["5"] ? { text: "View Job", url: `https://app.yarro.ai/contractor/${v["5"]}` } : undefined,
  }),

  // ─── OOH Emergency ───

  // ooh_emergency_dispatch: 1=address, 2=issue, 3=priority, 4=access, 5=oohToken
  ooh_emergency_dispatch: (v) => ({
    subject: `EMERGENCY — ${v["2"] || "Urgent issue"} at ${v["1"] || "Property"}`,
    heading: "Emergency Callout",
    body: `An emergency has been reported at ${v["1"] || "a property"}: ${v["2"] || "urgent issue"}. Priority: ${v["3"] || "Emergency"}.`,
    cta: v["5"] ? { text: "View & Respond", url: `https://app.yarro.ai/ooh/${v["5"]}` } : undefined,
  }),

  // ─── Rent Reminders ───

  // rent_reminder_before: 1=tenantName, 2=amount, 3=dueDate
  rent_reminder_before: (v) => ({
    subject: `Rent Reminder — Due ${v["3"] || "soon"}`,
    heading: "Rent Due Soon",
    body: `Hi ${v["1"] || "there"}, your rent of ${v["2"] || "N/A"} is due on ${v["3"] || "your due date"}. Please ensure payment is made on time.`,
  }),

  // rent_reminder_due: 1=tenantName, 2=amount, 3=dueDate
  rent_reminder_due: (v) => ({
    subject: `Rent Due Today — ${v["2"] || "N/A"}`,
    heading: "Rent Due Today",
    body: `Hi ${v["1"] || "there"}, your rent of ${v["2"] || "N/A"} is due today. Please make your payment as soon as possible.`,
  }),

  // rent_reminder_overdue: 1=tenantName, 2=amount, 3=dueDate
  rent_reminder_overdue: (v) => ({
    subject: `Rent Overdue — ${v["2"] || "N/A"}`,
    heading: "Rent Overdue",
    body: `Hi ${v["1"] || "there"}, your rent of ${v["2"] || "N/A"} from ${v["3"] || "your due date"} is now overdue. Please make payment immediately to avoid further action.`,
  }),

  // rent_chase_1d: 1=tenantName, 2=amount, 3=dueDate
  rent_chase_1d: (v) => ({
    subject: `Rent Overdue — Immediate Action Required`,
    heading: "Rent Payment Overdue",
    body: `Hi ${v["1"] || "there"}, your rent of ${v["2"] || "N/A"} from ${v["3"] || "your due date"} remains unpaid. Please make payment today.`,
  }),

  // rent_chase_5d: 1=tenantName, 2=amount, 3=dueDate
  rent_chase_5d: (v) => ({
    subject: `Rent Overdue — 5 Days`,
    heading: "Rent Significantly Overdue",
    body: `Hi ${v["1"] || "there"}, your rent of ${v["2"] || "N/A"} from ${v["3"] || "your due date"} is now significantly overdue. Your property manager will be in touch if payment is not received.`,
  }),

  // rent_chase_10d: 1=tenantName, 2=amount, 3=dueDate
  rent_chase_10d: (v) => ({
    subject: `URGENT: Rent Overdue — Final Reminder`,
    heading: "Final Rent Reminder",
    body: `Hi ${v["1"] || "there"}, your outstanding rent balance of ${v["2"] || "N/A"} from ${v["3"] || "your due date"} is now significantly overdue. This is the final automated reminder — if payment isn't received, your property manager will be in touch directly.`,
  }),
};

// ─── HTML Shell ──────────────────────────────────────────────────────────

function htmlShell(heading: string, body: string, cta?: { text: string; url: string }): string {
  const ctaBlock = cta
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr><td align="center">
          <a href="${escapeHtml(cta.url)}" style="display:inline-block;background-color:#1e40af;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;mso-padding-alt:0;text-underline-color:#1e40af;">
            <!--[if mso]><i style="mso-font-width:150%;mso-text-raise:22pt">&nbsp;</i><![endif]-->
            <span style="mso-text-raise:11pt;">${escapeHtml(cta.text)}</span>
            <!--[if mso]><i style="mso-font-width:150%">&nbsp;</i><![endif]-->
          </a>
        </td></tr>
      </table>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background-color:#1e40af;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Yarro</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;color:#111827;font-size:18px;font-weight:600;">${escapeHtml(heading)}</h2>
          <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(body)}</p>
          ${ctaBlock}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">Powered by Yarro &mdash; Maintenance made simple</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Public API ──────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string;
  html: string;
}

/**
 * Build email content for a given message type.
 * Returns null if no email template exists for this message type (WhatsApp-only messages).
 */
export function buildEmail(
  messageType: string,
  variables: Record<string, string>,
): EmailTemplate | null {
  const builder = CONTENT[messageType];
  if (!builder) return null;

  const content = builder(variables);
  return {
    subject: content.subject,
    html: htmlShell(content.heading, content.body, content.cta),
  };
}
