# Yarro — Master Product Requirements Document
*Last updated: March 2026 | Owner: Adam Ekubia (CEO)*

---

## 1. What Yarro Is

Yarro is a **WhatsApp-native maintenance, compliance, and management platform for HMO operators.** It serves the people running houses in multiple occupation — R2R operators, BRRRR landlords, and corporate multi-let operators — who need to manage rooms, tenants, maintenance jobs, and compliance certificates without juggling WhatsApp threads, spreadsheets, and folders.

The product sits between COHO (room-level accounting, no dispatch) and Arthur Online (full workflow, £70+/mo, no WhatsApp). No competitor combines room-level HMO management + structured WhatsApp dispatch + compliance automation in a single product.

---

## 2. The Core Loop

This is the loop the product must close completely:

```
Tenant WhatsApps → System identifies tenant + room → AI triages issue
→ Job created and linked to room → Contractor dispatched via WhatsApp
→ Quote approved → Job scheduled → Completion evidence received
→ Audit trail written → Operator dashboard updated
```

Compliance sits alongside this loop:

```
Certificate expiry approaching → Operator notified (WhatsApp/email)
→ Relevant contractor auto-dispatched via existing dispatch pipeline
→ Renewal job completed → Certificate updated in system
→ Dashboard reflects new status
```

Rent tracking sits as a parallel operational layer:

```
Room rent due date approaches → Tenant reminded via WhatsApp
→ Operator logs payment received → Dashboard shows paid/outstanding
→ Overdue triggers follow-up reminder
```

---

## 3. Product Pillars

### Pillar 1 — Room-Level Operations
Everything is room-aware. Tickets link to rooms. Tenants live in rooms. Rent tracks per room. WhatsApp intake identifies the room automatically.

### Pillar 2 — WhatsApp Native
Tenants never need a portal. Contractors receive and respond via WhatsApp. Operators get alerts on WhatsApp. The product works in the channel everyone already uses.

### Pillar 3 — Compliance Automation
Certificate tracking is not passive. Expiry triggers outbound action — operator notification + contractor dispatch — through the same pipeline that handles maintenance jobs.

### Pillar 4 — Complete Audit Trail
Every action is logged. Every job has evidence. Every compliance certificate has a document. This protects the operator when a council inspector, landlord, or tenant dispute arises.

---

## 4. Target Users

**Primary (demo target):** R2R operators and small HMO landlords, 3–20 units. Decision maker is the operator themselves. Sales cycle is days not months.

**Secondary:** BRRRR professionals, 20–100 units. Need portfolio-level reporting and institutional-grade compliance records.

**Not targeting (for now):** Letting agencies, general BTL landlords, large corporate operators.

---

## 5. Demo Scope — Must Have by Mid-April 2026

The demo target is a working product on real data. The friend with 5 units (1 property, 5 rooms) can actually use it.

### Must Have
| Feature | Status |
|---------|--------|
| Room layer — add/edit rooms on property detail | Not started |
| Tenant-to-room assignment (dual: keeps property assignment) | Not started |
| Rooms tab on property detail page | Not started |
| Room occupancy view — who's in each room, tenancy dates | Not started |
| WhatsApp intake identifies room via tenant confirmation flow | Not started |
| Ticket linked to room as well as property | Not started |
| Compliance dashboard card | Exists |
| Compliance status on properties list | Exists |
| Compliance certificate CRUD + document upload | Exists |
| Compliance expiry reminders via WhatsApp to operator | Not started |
| Compliance expiry triggers contractor dispatch | Not started |
| Rent tracking — per-room amount + due date config | Not started |
| Rent tracking — operator logs payment received | Not started |
| Rent tracking — paid/outstanding view per property | Not started |
| Automated rent reminders via WhatsApp to tenants | Not started |
| c1_rooms table + migrations | Not started |
| c1_rent_ledger table + migrations | Not started |
| c1_context_logic RPC updated for room awareness | Not started |

### Out of Scope for Demo
- Tenant knowledge base (AI answering tenancy agreement questions)
- Open banking integration
- Profitability / mortgage calculator
- Tenant onboarding flow
- CRM integrations
- Contractor portal verification

---

## 6. How the HMO Layer Sits on Top of the Existing Product

The existing product is a complete maintenance coordination system. The HMO pivot does not replace it — it extends it with three new layers:

```
EXISTING FOUNDATION
├── Auth, session, routing
├── Properties CRUD
├── Tenants CRUD (currently property-level)
├── Contractors CRUD
├── Tickets — full lifecycle
├── WhatsApp intake pipeline (c1_context_logic RPC)
├── Dispatcher — 5 instruction routes
├── Compliance — certificates, status, document upload
├── Dashboard — todo panel, scheduled card, compliance card, events feed
└── Automation — followups, reminders, OOH escalation

HMO LAYER (new)
├── Room layer — c1_rooms table, rooms tab, tenant-to-room assignment
├── Room awareness in WhatsApp intake — c1_context_logic RPC extension
├── Compliance automation — expiry → WhatsApp alert → contractor dispatch
└── Rent tracking — c1_rent_ledger, per-room config, WhatsApp reminders
```

The key principle: **new HMO features use existing infrastructure.** Compliance dispatch goes through the existing dispatcher. Rent reminders use the existing Twilio/WhatsApp sending layer. Room-aware intake is an extension of `c1_context_logic`, not a new pipeline.

---

## 7. Pricing

| Tier | Units | Monthly |
|------|-------|---------|
| Starter | 3–10 | £10–29 |
| Growth | 11–50 | £30–69 |
| Pro | 51–100 | £70–99 |
| Enterprise | 100+ | Custom |

No per-seat pricing. Positioned between COHO (£2.50/unit, no dispatch) and Arthur (£70+ flat, no WhatsApp).

---

## 8. Post-Demo Roadmap (Do Not Build Now)

- Tenant knowledge base — AI answers tenancy questions via WhatsApp
- Profitability calculator — rent income vs mortgage vs expenses per property
- Open banking integration — auto-detect rent payments
- Tenant onboarding flow
- AgentOS / Street.co.uk CRM integration
- Portfolio analytics for BRRRR persona
