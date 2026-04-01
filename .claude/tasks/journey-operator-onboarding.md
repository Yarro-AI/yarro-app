## Journey: Operator Onboarding
**Created:** 2026-03-30
**Status:** Active
**User outcome:** A new HMO operator goes from landing page to a live, useful dashboard with their first property fully set up — in one sitting.

### The Journey

**Free tier:** One property, fully managed by Yarro. Unlimited tenants, unlimited rooms. No credit card. Solo landlords can join with zero friction — they have time to get everything together before committing.

---

#### Phase 1 — Get In

**1. Landing page**
Marketing page. Clear value prop for HMO operators. Single CTA: **"Start for free."** No pricing gates, no feature comparison — just get them in.

**2. Sign up**
Email/password or Google OAuth. Minimal friction. Email verification if needed. Straight to onboarding.

---

#### Phase 2 — Set Up Your Property

The onboarding is a series of focused cards — one thing per card, not a multi-step wizard with tabs. Each card is its own clear task.

**3. Account card**
Simple focused card. Fields: full name, email, WhatsApp number, preferred contact method (WhatsApp/email/phone), business name (optional), role (owner or manager). No landlord setup here — keep it about the operator.

**4. Property card**
Set up first property. Fields: address (with postcode lookup), number of rooms, property type (HMO/single-let). Room count drives the next step — if they say 5 rooms, the tenant step shows 5 slots.

**5. Tenant cards**
Create basic tenant profiles and link each to a room. For each tenant: name, phone number, email. Each tenant is linked to a room as they're created — "Room 1: [tenant form]", "Room 2: [tenant form]", etc. Vacant rooms can be skipped. This should feel like filling in a register, not navigating a complex UI.

**6. Tenant onboarding (immediate)**
After tenant cards, option to send a message to each tenant to onboard them and verify their contact details. "Send onboarding message to 4 tenants?" — one button. Uses the existing verification token RPCs (`generate_verification_token`, `verify_entity`). Tenants get a WhatsApp or SMS with a link to confirm their details.

**7. Finish → Success**
Click "Finish" → success screen with confetti animation. "Your property is live!" Celebrate the moment — they've done the hard part.

---

#### Phase 3 — First Dashboard Experience

**8. Dashboard first-run**
Opens to a live dashboard that already shows activity. The to-do list has pre-populated items:
- "Set up automations" (links to automations setup)
- "Add compliance documents" (links to compliance setup)
- "Verify tenant details" (if any tenants haven't confirmed)
- "Add a contractor" (links to contractor setup)

In-progress column shows: "Onboarding 3/6 complete" (or whatever the actual count is).

Stat cards should show real data where possible — occupancy (4/5 rooms filled), compliance (0% — nothing uploaded yet), etc. The dashboard should feel alive, not empty.

---

#### Phase 4 — Automations Setup

Prompted from the dashboard to-do item "Set up automations."

**9. Contractor setup**
Add contractors for the property just set up. For each contractor: name, phone, email, preferred contact method, trade categories. This is about the operator's existing contractors — "who do you call when the boiler breaks?"

**10. Send contractor onboarding**
Option to send an onboarding message to each contractor. Same pattern as tenant onboarding — verify their details, get them into the system.

**11. Rules and preferences**
Set up dispatch rules: auto-dispatch or manual approval? Response time expectations? Out-of-hours escalation contact? This configures how the automation engine behaves for this property.

**12. Automations success**
Success moment. "Automations are set up!" To-do list updates — "Set up automations" moves off the list. Progress updates to 4/6 (or whatever). Back to dashboard.

---

#### Phase 5 — Compliance Setup

Prompted from the dashboard to-do item "Add compliance documents."

**13. Compliance picker**
Pick which compliance certificates are needed for this property. Pre-filled based on property type (HMO = 9 required certs, single-let = 5). Operator can delete ones that don't apply or add extras (like insurance). This uses the existing `c1_compliance_requirements` table and the backfill migration.

**14. Upload first cert**
Walk through one certificate in full — upload the document, add expiry date, issued by, cert number. This one gets verified. The rest can be saved for later ("I'll upload these when I find them"). Compliance stays on the to-do list until all required docs are uploaded. Each uploaded cert reduces the "missing" count.

**15. Property summary**
Success. "Here's your first property." Opens the property page with everything populated — rooms, tenants, compliance status, rent config. The operator sees the full picture of what they've set up.

---

#### Phase 6 — Test Run

**16. Demo test**
Guided test: "Let's see it in action." Set up a demo maintenance job (tenant reports a broken tap) or trigger a compliance reminder (gas safety expiring). Watch the dispatch loop work — contractor gets a WhatsApp, job appears on dashboard, audit trail logs it.

**17. Done**
Onboarding complete. The operator has a useful dashboard with real data, real automations, and has seen the product work end-to-end. The to-do list shows remaining items but the core setup is done. They're a real user now.

### What Already Exists

| Step | Status | Notes |
|------|--------|-------|
| Sign up | Built | `/signup` — email + Google OAuth |
| Account setup | Partial | Onboarding wizard has PM details step, but not card-based, missing some fields |
| Property setup | Partial | Wizard has property step, but no room count field |
| Tenant creation | Partial | Wizard has tenant step, but no room linking during creation |
| Room creation | Built | On property detail page, not in onboarding flow |
| Tenant-room assignment | Built | On property detail page, not in onboarding flow |
| Tenant verification | Partial | RPCs exist (`generate_verification_token`, `verify_entity`), no UI to trigger |
| Dashboard | Built | Stat cards + to-do panel, but no first-run experience |
| Compliance wizard | Built | 4-step wizard exists, not connected to dashboard to-do flow |
| Contractor management | Built | CRUD exists, no guided setup flow |
| Compliance types | Built | Pre-filled by property type (migration 140000) |
| Landing page | Missing | No marketing page exists |
| Confetti / success | Missing | No celebration moments |
| Automations page | Missing | No guided automation setup flow |
| Rules & preferences | Missing | No dispatch rules UI |
| Test run flow | Missing | No guided demo/test mode |
| Dashboard first-run | Missing | No pre-populated to-do for new users |

### Slices

| # | Slice | Phase | What ships | Depends On | Status | Est |
|---|-------|-------|-----------|-----------|--------|-----|
| 1 | Landing page | 1 | Marketing page, "Start for free" CTA → `/signup` | — | Deferred (website/marketing journey) | Small |
| 2 | Account + property cards | 2 | Card-based onboarding: account details → property with room count + type. Replaces current wizard steps 1+3 | — | **Shipped** | Medium |
| 3 | Tenant + room cards | 2 | Room-linked tenant creation: "Room 1: [form]", "Room 2: [form]". Register-style, skip vacant rooms | Slice 2 | Pending | Medium |
| 4 | Tenant verification send | 2 | "Send onboarding message to N tenants?" button. WhatsApp/SMS via existing `generate_verification_token` RPC | Slice 3 | Pending | Small |
| 5 | Success + dashboard first-run | 3 | Confetti finish screen. Dashboard pre-populates to-do (automations, compliance, verify tenants, add contractor). In-progress shows "Onboarding 3/6". Stat cards show real occupancy/compliance data | Slices 3, 4 | Pending | Medium |
| 6 | Automations setup flow | 4 | Guided from to-do: add contractors (name, phone, trade, contact method) → send onboarding message → set dispatch rules (auto/manual, response time, OOH escalation). Success removes from to-do, updates progress | Slice 5 | Pending | Medium |
| 7 | Compliance guided setup | 5 | Guided from to-do: pick cert types (pre-filled by property type, editable) → upload one cert in full (doc, expiry, issuer) → save rest for later. Compliance stays on to-do until all uploaded | Slice 5 | Pending | Medium |
| 8 | Test run | 6 | Guided demo: create a maintenance job or trigger compliance reminder. Watch dispatch loop work end-to-end. Operator sees the product in action | Slices 6, 7 | Pending | Small |

### Notes

- **Slices 6 and 7 are parallel** — both depend on slice 5 but not on each other. Build in either order.
- **Slice 4 is small** — could bundle with slice 3 if time allows, or ship as a quick follow-up.
- **Slice 2 replaces** the current onboarding wizard's PM details + properties steps with a card-based flow. The existing wizard at `src/components/onboarding-wizard.tsx` is the starting point but needs significant rework.
- **Slice 3 is the most complex** — tenant creation with room linking doesn't exist in the current onboarding flow. Rooms are currently created on the property detail page, tenants assigned separately.
- **Slice 5 is the emotional payoff** — this is where the operator first feels "this is real." The confetti, the live dashboard, the pre-populated to-do. Don't underestimate its importance.

### Out of Journey
- Pricing page / tier comparison — BACKLOG
- Stripe billing integration — BACKLOG
- Multi-property upgrade flow — BACKLOG
- Mobile-responsive landing page polish — BACKLOG (do basic responsive in slice 1, polish later)
