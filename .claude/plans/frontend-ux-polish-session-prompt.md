# Frontend UI/UX Polish Session

## Before you start

Read these files in order. Do not write any code until you've read all three:

1. **`.claude/docs/frontend-rules.md`** — how frontend work is done here. Non-negotiable rules, data shapes, decision framework. This overrides your instincts.
2. **`docs/architecture/ticket-state-model.md`** — the system architecture. The law.
3. **`src/lib/reason-display.ts`** — the SSOT label mapping. Understand the shape.

---

## Work items

### High

1. **SLA timer ring** — starts nearly empty on fresh tickets. Maps remaining time against fixed 24h. Fix: each SLA starts full, counts down proportionally to its own total. Drawer should also show timer with live countdown and meaning.
   - File: `src/components/dashboard/job-card.tsx` (`SlaRing`)
   - Data: `sla_due_at` from RPC. May need `sla_duration` from backend — if so, request it.

2. **Inline actions in sticky bar** — assign contractor, approve quote, allocate landlord render at bottom of scrollable content. Should expand within/above the sticky action bar.
   - Files: `action-bar.tsx`, `ticket-detail-modal.tsx`

3. **Compliance drawer dispatch** — `compliance_needs_dispatch` CTA navigates to cert page. Wire to `inline_dispatch` (dispatch from drawer). Add "View certificate" link in cert details for full page access.
   - Files: `action-bar.tsx`, `category-data.tsx`

4. **Rent arrears duration** — shows "1 month(s) overdue" (counts ledger rows). Show days overdue from `due_date`.
   - File: `category-data.tsx` (`RentSection`)

5. **Ticket drawer title** — falls back to "Maintenance Request" when `issue_title` is null. Generate short title from `issue_description` (first ~6 words). This is display formatting — frontend is the right layer.
   - File: `ticket-overview.tsx`

### Medium

6. **Manual ticket form** — no title field. Every manual ticket gets generic title. Add title input or auto-generate from description.

7. **Assign contractor CTA intermittent** — `StageDispatchAction` sometimes doesn't respond. Investigate.

8. **Properties page compliance certs** — list items not clickable. Should link to `/compliance/{cert_id}`.

---

## How to work

- One item at a time. Read the files. Plan the change. Present decisions to Adam. Execute. `npm run build`. Commit.
- Log anything unexpected in `.claude/docs/refactor-notes.md`.
- When in doubt, ask.
