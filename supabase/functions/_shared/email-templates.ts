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

  // dispatcher contractor-sms: 1=business_name, 2=address, 3=issue, 4=media, 5=priority, 6=access, 7=portalToken
  contractor_dispatch: (v) => ({
    subject: `New Job Request — ${v["3"] || "Maintenance issue"}`,
    heading: "New Job Request",
    body: `You have a new maintenance job request from ${v["1"] || "your property manager"} at ${v["2"] || "a property"}.`,
    cta: v["7"] ? { text: "View Details & Submit Quote", url: `https://app.yarro.ai/contractor/${v["7"]}` } : undefined,
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

  // landlord_quote: 1=contractor(+category), 2=address, 3=issue, 4=media, 5=total_cost
  landlord_quote: (v) => ({
    subject: `Quote for Approval — ${v["2"] || "Property"}`,
    heading: "Quote for Approval",
    body: `${v["1"] || "A contractor"} has submitted a quote of ${v["5"] || "N/A"} for ${v["3"] || "maintenance"} at ${v["2"] || "your property"}. Please reply APPROVE or DECLINE.`,
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
