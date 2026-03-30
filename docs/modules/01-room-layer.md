# Module: Room Layer
*Feature module — HMO Phase 2*

---

## What This Is

The room layer makes Yarro HMO-aware. Every HMO property has rooms. Every room has a tenant. Every ticket links to a room. Without this, Yarro is a property management tool. With it, Yarro is an HMO management tool.

---

## What's New vs What's Extended

| Item | New or Extended |
|------|----------------|
| `c1_rooms` table | New |
| `room_id` on `c1_tenants` | Extension (nullable, dual assignment) |
| `room_id` on `c1_tickets` | Extension (nullable, backwards compatible) |
| Rooms tab on property detail | New UI |
| `room-form-dialog.tsx` | New component |
| `property-rooms-tab.tsx` | New component |
| Rooms column on properties list | Extension of existing table |
| `c1_context_logic` RPC | Extension — room lookup added |
| `c1_convo_finalize` RPC | Extension — returns room_id |
| `c1_create_ticket` RPC | Extension — accepts room_id |

---

## Data Model

See TECH-LEDGER.md for full schema. Key points:

- `c1_rooms.current_tenant_id` and `c1_tenants.room_id` must be kept in sync. Update both on assignment.
- Vacancy is derived: `is_vacant = (current_tenant_id IS NULL)` — generated column, never set manually.
- `rent_due_day` is 1–28 (avoids Feb edge cases). Weekly frequency uses `rent_due_day` as day-of-week (0=Mon, 6=Sun).

---

## UI: Rooms Tab (Property Detail)

**Location:** `src/app/(dashboard)/properties/[id]/page.tsx` — new tab alongside existing tabs.

**Tab label:** "Rooms"

**Tab contents:**

```
[+ Add Room]                                    [Occupancy: 4/5]

┌─────────────┬──────────────┬───────────────┬──────────────┬──────────────┬──────────┐
│ Room        │ Tenant       │ Since         │ Until        │ Rent         │          │
├─────────────┼──────────────┼───────────────┼──────────────┼──────────────┼──────────┤
│ Room 1      │ James Osei   │ 01 Jan 2026   │ 31 Dec 2026  │ £650/mo      │ ⋮        │
│ Room 2      │ Sarah Malik  │ 15 Mar 2026   │ 14 Mar 2027  │ £650/mo      │ ⋮        │
│ Room 3      │ —            │ —             │ —            │ £650/mo      │ ⋮        │  ← Vacant
│ Room 4      │ Tom Chen     │ 01 Feb 2026   │ 31 Jan 2027  │ £700/mo      │ ⋮        │
│ Room 5      │ Priya Nair   │ 01 Nov 2025   │ 31 Oct 2026  │ £625/mo      │ ⋮        │
└─────────────┴──────────────┴───────────────┴──────────────┴──────────────┴──────────┘
```

**Row actions (⋮ menu):**
- Edit room details
- Assign tenant (if vacant)
- Remove tenant / mark vacant
- Delete room (blocked if tenant assigned)

**Vacant row styling:** Muted text, subtle background — visually distinct from occupied.

**Tenancy end date warning:** If `tenancy_end_date` is within 30 days, show orange badge on that row.

---

## UI: Room Form Dialog

**Triggered by:** "Add Room" button or "Edit room details" from row menu.

**Fields:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Room number | Text | Yes | "Room 1", "Attic Room" etc. |
| Room name | Text | No | Optional friendly name |
| Floor | Text | No | "Ground", "First", "Loft" |
| Monthly rent | Number | No | Can be set later |
| Rent frequency | Select | Yes | Monthly / Weekly |
| Rent due day | Number | Yes if monthly | 1–28. Label: "Day of month rent is due" |

**Validation:**
- Room number must be unique within the property
- Rent due day must be 1–28

---

## UI: Tenant Assignment

**Where:** Room row → "Assign tenant" OR tenant edit form → room selector.

**Tenant edit form change:**
- Add "Room" field — dropdown showing unoccupied rooms for the tenant's current property
- Shows room number + name + floor if set e.g. "Room 3 — Garden Room (Ground)"
- Only unoccupied rooms shown (where `current_tenant_id IS NULL`)
- On save: update `c1_tenants.room_id` AND `c1_rooms.current_tenant_id`

**Add tenancy dates on assignment:**
- `tenancy_start_date` — required on assignment
- `tenancy_end_date` — optional

---

## UI: Properties List — Rooms Column

**New column added between "Tenants" and "Open Tickets":**

| Column | Content | Notes |
|--------|---------|-------|
| Rooms | "4/5" (occupied/total) | Show "—" if no rooms configured |

---

## WhatsApp Flow — Room Identification

**Normal case (tenant has room_id assigned):**

The `c1_context_logic` RPC already looks up the tenant by phone. With room awareness added, it also returns `ctx.room`. The AI system prompt gains: "This tenant is in Room 3." The ticket is created with `room_id` populated. No change to tenant experience.

**Edge case (tenant has no room_id):**

`c1_context_logic` sets `ai_instruction = CONFIRM_ROOM` and returns available rooms for the property.

The AI response to the tenant:

> "Hi [name], I just need to confirm which room you're in — is it Room 1, Room 2, or Room 3?"

Tenant replies with their room. System:
1. Updates `c1_tenants.room_id` and `c1_rooms.current_tenant_id`
2. Continues the normal intake flow
3. Creates ticket with `room_id`

**This only happens once per tenant.** After the first confirmation, their room is stored and future messages skip the confirmation.

---

## Ticket Detail — Room Display

**Location:** Ticket detail modal, Overview tab.

**Change:** Add "Room" row to the property/tenant info block:

```
Property:  14 Acacia Avenue, Manchester
Room:      Room 3
Tenant:    James Osei
```

Show "—" if `room_id` is null (pre-HMO tickets).

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Operator deletes a room with an active tenant | Block. Show error: "Remove tenant from room before deleting." |
| Operator deletes a property with rooms | Cascade delete rooms (or block — TBD, lean towards block with message) |
| Tenant assigned to room in wrong property | Prevent at RPC level — validate tenant.property_id = room.property_id |
| Two tenants try to get assigned to same room | Second assignment blocked — only one `current_tenant_id` per room |
| WhatsApp message from unknown number | Existing `nomatch` flow — no room logic triggered |
| Ticket created manually (not via WhatsApp) | `room_id` is optional on manual creation — add room selector to create ticket form |
| Existing tickets before room layer | `room_id` is null — display as "—" in ticket detail, no backfill required |
