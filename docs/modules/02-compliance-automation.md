# Module: Compliance Automation
*Feature module — HMO Phase 2 extension of existing Phase 1 build*

---

## What This Is

Phase 1 built passive compliance tracking — certificates, statuses, document upload, dashboard card. Phase 2 makes it active. Expiring certificates trigger outbound notifications and auto-dispatch to contractors via the existing dispatch pipeline.

The compliance loop closes:
**Expiry approaching → Operator notified → Contractor dispatched → Job completed → Certificate updated**

---

## What's New vs What's Extended

| Item | New or Extended |
|------|----------------|
| `c1_compliance_certificates` — 3 new columns | Extension |
| `certificate-form-dialog.tsx` — contractor + reminder config | Extension |
| `compliance-reminder-cron` edge function | New |
| `get_compliance_expiring` RPC | New |
| Compliance dispatch via existing dispatcher | Extension of existing dispatcher |
| Twilio templates for compliance | New |
| Operator contact method preference | Extension of existing PM settings |

**What does NOT change:**
- Dashboard compliance card — already exists, no change needed
- Compliance list page — already exists, no change needed
- Certificate detail + document upload — already exists, no change needed
- Properties list compliance badge — already exists, no change needed

---

## Schema Changes

Three new columns on `c1_compliance_certificates`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `reminder_days_before` | integer | 60 | How many days before expiry to send first reminder |
| `contractor_id` | uuid FK → c1_contractors | null | Which contractor to auto-dispatch for renewal |
| `reminder_sent_at` | timestamptz | null | Prevents duplicate reminders |

---

## UI: Certificate Form Dialog — New Fields

**Location:** `src/components/certificate-form-dialog.tsx`

**New section added at bottom of form: "Automation"**

```
─── Automation ────────────────────────────────────

Remind me before expiry
[60 days ▼]   (options: 30 / 60 / 90 days)

Auto-dispatch contractor for renewal
[Select contractor ▼]   (filtered by relevant category)

───────────────────────────────────────────────────
```

**Contractor filter logic:**

Pre-filter the contractor dropdown by certificate type to reduce noise:

| Certificate type | Suggested contractor category |
|-----------------|------------------------------|
| gas_safety | Gas / Heating |
| eicr | Electrical |
| epc | EPC assessor |
| fire_risk | Fire safety |
| pat | Electrical |
| legionella | Plumbing / Specialist |
| hmo_license | — (no contractor — admin task) |
| smoke_alarms | — (operator handles) |
| co_alarms | — (operator handles) |

Show all contractors but pre-select the relevant category filter. Operator can override.

**If no `contractor_id` is set:** Cron sends operator notification only. No dispatch.
**If `contractor_id` is set:** Cron sends operator notification AND creates dispatch job.

---

## Cron: `compliance-reminder-cron`

**Schedule:** Daily at 08:00 UTC.

**Logic:**

```
1. Call get_compliance_expiring(days_ahead=90, property_manager_id=all)
   Returns: certificates where:
   - expiry_date <= NOW() + reminder_days_before days
   - reminder_sent_at IS NULL
   - status != 'expired' (don't re-notify on already-expired)

2. For each certificate:

   a. Look up PM contact preference
      - WhatsApp first (if PM has phone on c1_property_managers)
      - Fallback to email via Resend

   b. Send operator notification
      Template: compliance_expiry_operator
      Variables: cert_type_label, property_address, expiry_date, days_remaining, contractor_name (if set)

   c. If contractor_id IS SET:
      - Create ticket via c1_create_ticket:
        category = "compliance_renewal"
        title = "[cert_type_label] renewal — [property_address]"
        property_id = certificate.property_id
        assigned_contractor_id = certificate.contractor_id
        priority = expiry < 14 days ? "high" : "medium"
      - Trigger existing dispatcher for this ticket + contractor
        (same flow as any maintenance job dispatch)

   d. Update certificate:
      SET reminder_sent_at = NOW()

   e. Log to c1_events:
      event_type = "compliance_reminder_sent"
      context = { cert_id, cert_type, days_remaining, contractor_dispatched: bool }

3. Handle errors per-certificate — one failure doesn't stop the batch
```

---

## WhatsApp/Email Templates

**`compliance_expiry_operator`** — sent to PM

> Your [Gas Safety Certificate] at [14 Acacia Avenue] expires in [45 days] on [15 May 2026]. [Your contractor Dave Plumbing has been notified to arrange renewal.] / [No contractor assigned — log in to arrange renewal.]

**`compliance_dispatch_contractor`** — sent to contractor (via existing dispatcher WhatsApp template)

Uses the existing contractor dispatch template — the compliance renewal is just a ticket like any other job. The ticket title makes it clear it's a compliance renewal.

---

## Notification Preference Logic

**Current state:** PM has a phone number on `c1_property_managers`. Contact method preference is set per-contractor on `c1_contractors`.

**For operator notifications:** Use PM's phone if available (WhatsApp via Twilio). Fallback to PM's email.

**This does not require new settings UI for the demo.** WhatsApp first, email fallback, no configuration required. Post-demo: add explicit "How do you want compliance alerts?" preference to PM settings.

---

## Audit Trail

Every compliance reminder and dispatch action writes to `c1_events`. This means:

- Dashboard activity feed shows "Gas Safety Certificate reminder sent — 14 Acacia Avenue"
- Compliance detail page can show "Reminder sent on [date]" under the certificate
- Full audit trail available for council inspection evidence

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Certificate already expired | Cron skips (status = expired). Operator sees this on dashboard. No automated re-send. |
| Reminder already sent (`reminder_sent_at` IS NOT NULL) | Cron skips. No duplicate. |
| `reminder_days_before` = 30 but cert expires in 20 days | Cert qualifies for 30-day window — reminder sent immediately on next cron run |
| Contractor assigned but no WhatsApp number | Fall back to contractor's email if available. Log warning in c1_events. |
| PM has no phone and no email | Log error to c1_events. Skip silently. Flag in admin. |
| Multiple properties, same cert type expiring same day | Each cert gets its own notification — no batching into one message for v1 |
| Operator manually updates cert after reminder sent | `reminder_sent_at` stays set. If they update expiry to a future date, it will NOT re-trigger (acceptable for v1 — post-demo: reset `reminder_sent_at` on expiry date change) |
| Compliance renewal ticket rejected/cancelled | Certificate status unchanged — operator must manually update certificate. No auto-close loop for v1. |

---

## What the Demo Shows

1. Open a certificate — show it has 45 days until expiry, Dave's Plumbing assigned, 60-day reminder configured
2. Trigger cron manually (or show it has already run)
3. Show: operator received a WhatsApp notification
4. Show: a compliance renewal ticket was created and Dave's Plumbing was dispatched
5. Show: the event in the activity feed
6. Show: `reminder_sent_at` is set on the certificate

This is the complete loop. Operator never had to think about it.
