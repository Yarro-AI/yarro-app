# SSOT Drift Audit Protocol

A systematic protocol for auditing Yarro's data paths and finding SSOT violations. Run regularly to ensure code stays aligned with the architecture.

## Files

| File | Purpose |
|------|---------|
| `ssot-audit-prompt.md` | The session prompt — role, goal, what to look for, how to report |
| `ssot-patterns.md` | Established SSOT patterns (the standard to measure against) |
| `ssot-anti-patterns.md` | Real bugs caused by drift (so the auditor knows what bad looks like) |
| `ssot-user-journey.md` | The audit checklist — every step to investigate, phase by phase |
| `ssot-execution-plan.md` | How to run the session — order, rules, what to do with findings |

## How to run an audit

1. Start a new Claude Code conversation
2. Paste the contents of `ssot-audit-prompt.md` as the opening message
3. Tell it: "Read the audit files at `.claude/audits/` and begin with Phase 2"
4. Follow the execution plan in `ssot-execution-plan.md`
5. Findings go in `.claude/audits/findings/` (one file per run, dated)

## When to run
- After any session that touches >5 files
- After any migration that changes RPCs or triggers
- Before any demo or sales push
- Monthly as a health check
