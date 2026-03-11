// Email content templates — mirrors templates.ts (WhatsApp SIDs)
// Each message type maps to a subject + body builder using the same variables

type Vars = Record<string, string>;

interface EmailContent {
  subject: string;
  body: string; // Plain text body (inserted into HTML shell)
}

// ─── Content Builders ────────────────────────────────────────────────────

const CONTENT: Record<string, (v: Vars) => EmailContent> = {
  // ─── Contractor Messages ───
  // Variables match EXACTLY what each edge function sends — do not rearrange

  // dispatcher contractor-sms: 1=business_name, 2=address, 3=issue, 4=media, 5=priority, 6=access
  contractor_dispatch: (v) => ({
    subject: `New Job Request — ${v["3"] || "Maintenance issue"}`,
    body: `Hi,\n\nYou have a new maintenance job request from ${v["1"] || "your property manager"}.\n\nProperty: ${v["2"] || "N/A"}\nIssue: ${v["3"] || "N/A"}\nPriority: ${v["5"] || "Standard"}\n\nAccess: ${v["6"] || "Contact property manager for details"}\n\nPlease reply to this email with your soonest availability and quote estimate.`,
  }),

  // scheduling finalize-job: 1=address, 2=issue, 3=quote, 4=access, 5=contractorToken
  contractor_job_schedule: (v) => ({
    subject: `Job Approved — ${v["1"] || "Property"}`,
    body: `Hi,\n\nYour quote has been approved and you can now schedule the job.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\nApproved Quote: ${v["3"] || "N/A"}\n\nAccess: ${v["4"] || "Contact property manager for details"}\n\nPlease use the link below to confirm your availability:\nhttps://app.yarro.ai/contractor/${v["5"] || ""}`,
  }),

  // job-reminder: 1=address, 2=issue, 3=slot, 4=access, 5=contractorToken
  contractor_job_reminder: (v) => ({
    subject: `Reminder: Job Today — ${v["1"] || "Property"}`,
    body: `Hi,\n\nThis is a reminder that you have a job scheduled for today.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\nTime: ${v["3"] || "N/A"}\n\nAccess: ${v["4"] || "Contact property manager for details"}\n\nPlease use the link below to confirm attendance or mark the job as complete:\nhttps://app.yarro.ai/contractor/${v["5"] || ""}`,
  }),

  // followups contractor_reminder: 1=address, 2=issue, 3=contractorToken
  contractor_reminder: (v) => ({
    subject: `Action Required — Pending Job Request`,
    body: `Hi,\n\nYou have a pending job request that needs your attention.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\n\nPlease use the link below to respond:\nhttps://app.yarro.ai/contractor/${v["3"] || ""}\n\nIf you are unable to take this job, please let us know so we can arrange an alternative.`,
  }),

  // followups completion_followup: 1=address, 2=issue, 3=contractorToken
  completion_followup: (v) => ({
    subject: `Completion Update Needed — ${v["1"] || "Property"}`,
    body: `Hi,\n\nWe are following up on a recently completed job.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\n\nPlease use the link below to confirm the job has been completed:\nhttps://app.yarro.ai/contractor/${v["3"] || ""}`,
  }),

  // ─── Landlord Messages ───
  // landlord_quote: 1=contractor(+category), 2=address, 3=issue, 4=media, 5=total_cost
  landlord_quote: (v) => ({
    subject: `Quote for Approval — ${v["2"] || "Property"}`,
    body: `Hi,\n\nA contractor has submitted a quote for your property.\n\nContractor: ${v["1"] || "N/A"}\nProperty: ${v["2"] || "N/A"}\nIssue: ${v["3"] || "N/A"}\nTotal Cost: ${v["5"] || "N/A"}\n\nPlease reply APPROVE or DECLINE to this email.`,
  }),

  // landlord_allocate: 1=address, 2=issue, 3=tenant_name, 4=tenant_phone, 5=business_name, 6=token
  landlord_allocate: (v) => ({
    subject: `Maintenance Issue — ${v["1"] || "Property"}`,
    body: `Hi,\n\nA maintenance issue has been reported at your property and allocated to you to handle directly.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\nTenant: ${v["3"] || "N/A"} (${v["4"] || "N/A"})\n\nPlease use the link below to provide updates:\nhttps://app.yarro.ai/landlord/${v["6"] || ""}`,
  }),

  // no_more_contractors: 1=address, 2=issue
  no_more_contractors: (v) => ({
    subject: `No Contractors Available — ${v["1"] || "Property"}`,
    body: `Hi,\n\nWe were unable to find an available contractor for the maintenance issue at your property.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\n\nYour property manager has been notified and will follow up with alternative arrangements.`,
  }),

  // ll_job_booked: 1=llName, 2=category, 3=formattedWindow, 4=issue, 5=address, 6=mgrContact
  ll_job_booked: (v) => ({
    subject: `Job Booked — ${v["5"] || "Property"}`,
    body: `Hi ${v["1"] || "there"},\n\nA ${v["2"] || "contractor"} has been booked for your property.\n\nProperty: ${v["5"] || "N/A"}\nIssue: ${v["4"] || "N/A"}\nScheduled: ${v["3"] || "N/A"}\n\nIf you have any questions, contact your property manager on ${v["6"] || "N/A"}.`,
  }),

  // ll_job_completed: 1=address, 2=issue, 3=contrName
  ll_job_completed: (v) => ({
    subject: `Job Completed — ${v["1"] || "Property"}`,
    body: `Hi,\n\nThe maintenance job at your property has been completed.\n\nProperty: ${v["1"] || "N/A"}\nIssue: ${v["2"] || "N/A"}\nContractor: ${v["3"] || "N/A"}\n\nIf there are any concerns, please contact your property manager.`,
  }),
};

// ─── HTML Shell ──────────────────────────────────────────────────────────

function htmlShell(body: string): string {
  // Convert newlines to <br> for HTML
  const htmlBody = body
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p style="margin:0 0 8px 0;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(line)}</p>`))
    .join("");

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
          ${htmlBody}
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
    html: htmlShell(content.body),
  };
}
