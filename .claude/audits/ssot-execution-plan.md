# SSOT Audit — Execution Plan

## How to run this audit

One session. Move through systematically. Complete each phase before the next. Log findings, don't fix mid-audit.

### Step 1: Setup
Create findings file at `.claude/audits/findings/YYYY-MM-DD.md`. Log every finding immediately.

### Step 2: Read the standards
Read `.claude/audits/ssot-patterns.md` and `.claude/audits/ssot-anti-patterns.md` first. These define what "good" and "bad" look like in this specific codebase.

### Step 3: Audit in phase order (by blast radius)

| Order | Phase | Why this order |
|-------|-------|---------------|
| 1 | **Phase 2: Daily Operations** | Dashboard + tickets = most-used screens. Drift here is most visible. |
| 2 | **Phase 3: Rent Operations** | Recently rebuilt with SSOT — verify it's solid end-to-end. |
| 3 | **Phase 4: Compliance Operations** | Second most visible. Cert status drift is a known risk area. |
| 4 | **Phase 1: Onboarding & Setup** | Setup flows run once per property. Drift matters but is less visible. |
| 5 | **Phase 5: Cross-Cutting Concerns** | Labels, counts, audit trail — affects everything. |

### For each section within a phase:
1. **Read the source code** — every file referenced in the checklist
2. **Grep for all readers** — who else reads this data?
3. **Grep for all writers** — who else writes this data?
4. **Check against patterns** — does it match the established SSOT patterns?
5. **Log findings** — with severity, file paths, line numbers

### Step 4: Compile findings
After all phases:
1. Group by root cause (e.g. "cert status computed in 3 ways" = 1 root cause)
2. Rank by blast radius (how many pages affected)
3. Produce fix plan: Critical → High → Medium

---

## Rules

- **Read, don't fix.** Log everything, fix nothing during the audit.
- **Follow the journey.** Don't jump to code you think might have issues — follow the steps.
- **Check EVERY reader.** For each data point, grep for every component that reads it.
- **Check EVERY writer.** For each data point, grep for every RPC/trigger that writes it.
- **Be specific.** Not "compliance status might drift" but "compliance status computed in `computeCertificateStatus()` on line 45 of compliance-section.tsx using different logic than `c1_compliance_escalate()` on line 19 of compliance_escalation_cron.sql"
- **Think like a PM.** For each finding, describe what the PM actually sees when it drifts.

---

## Known high-risk areas

These had real bugs from SSOT drift. Verify they're clean and check for similar patterns:

1. **Rent system** — 16 bugs found in E2E testing. Fixed with trigger-enforced SSOT. Check for remnants of old patterns.
2. **Compliance status** — dashboard, sidebar, and compliance page may compute differently.
3. **Contact method routing** — sendAndLog had a hardcoded email filter. Check all edge functions pass explicit channel.
4. **Priority/SLA** — just hardened. Check frontend doesn't compute independently.
5. **tenant.property_id** — historical link, stays set after tenancy ends. Check no page treats it as "lives here now".
6. **Denormalized landlord fields** — `landlord_name`, `landlord_email`, `landlord_phone` on c1_properties AND on c1_landlords. If landlord updates profile, does property copy update?

---

## What to do with findings

| Severity | Action |
|----------|--------|
| **Critical** — data corruption or wrong answers | Fix before next audit phase |
| **High** — visible to PM, causes confusion | Fix if quick (<15 min), else backlog with specific fix |
| **Medium** — could drift over time | Backlog with fix description |
| **Low** — style/pattern inconsistency | Note for future refactor |
