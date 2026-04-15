# Backlog

Items captured during sessions that are not today's task.
Review each morning when writing the day's PRD.

## Rules
- If Adam starts a session with "backlog", treat everything that follows as backlog entries. Don't ask for confirmation — just add them.

## Format
- [date] [brief description] [priority: high/medium/low]

## Items

<!-- Add items below this line -->
- [2026-04-15] UI: Manual ticket creation page — full UI overhaul, currently ugly. Needs polished form layout, proper title field, better styling. [priority: high]
- [2026-04-15] UI: Manual handoff ticket drawer — redesign the handoff process view in the ticket drawer. Currently ugly, needs clear action hierarchy and better layout. [priority: high]
- [2026-04-15] FEATURE: Compliance settings page — allow PM to configure when contractors are auto-dispatched for compliance certificate renewals (e.g. days before expiry, auto vs manual dispatch toggle). [priority: high]
- [2026-04-15] FEATURE: Contractor auto-cycle for compliance bookings — give contractors a time limit to book/attend compliance cert jobs. If they can't make the window, auto-cycle to next available contractor. [priority: medium — future]
- [2026-04-15] FEATURE: Migrate quote acceptance to portal pages — replace WhatsApp flow forms with "Review" link to secure portal. Eliminates public storage URLs for images. Change WhatsApp templates from flow forms to portal links. Covers: PM quote approval, contractor quote review, landlord approval. [priority: high]
- [2026-04-15] INFRA: Stale conversation cleanup cron — daily cron to find c1_conversations with status='open' AND updated_at < now() - 24h. Auto-handoff or alert. Prevents silent data loss from stuck conversations. [priority: medium]
- [2026-04-15] INFRA: Rapid-fire message batching — debounce/serialize concurrent WhatsApp webhooks per phone number to prevent triple-replies when tenant sends multiple photos at once. [priority: low]
- [2026-04-15] FEATURE: Skip landlord approval when PM is the landlord — if the PM owns the property (is the landlord), bypass the landlord approval step and auto-approve. Only require landlord approval when PM manages on behalf of a separate landlord. [priority: high]
- [2026-04-15] BUG/FEATURE: Reschedule portal page — reschedule link currently opens the contractor job completion page instead of a dedicated reschedule page. Needs: (1) dedicated reschedule portal page showing job details + new date picker, (2) tenant checkbox "allow contractor to contact you directly" — when checked, sends contractor the tenant's contact details to arrange the reschedule, (3) all reschedule info visible on the page (current date, reason, job details). [priority: high]
