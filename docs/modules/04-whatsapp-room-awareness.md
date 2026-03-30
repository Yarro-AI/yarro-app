# Module: WhatsApp Room Awareness
*Feature module — extension of existing whatsapp-intake pipeline*

---

## What This Is

A targeted extension of the existing `c1_context_logic` RPC and `whatsapp-intake` edge function to make incoming WhatsApp messages room-aware. When a tenant messages, the system now identifies not just their property but their specific room. Tickets are created linked to a room.

---

## What's Extended (Not New)

| Item | Change |
|------|--------|
| `c1_context_logic` RPC | Add room lookup after tenant lookup |
| `c1_convo_finalize` RPC | Return `room_id` alongside existing returns |
| `c1_create_ticket` RPC | Accept `room_id` parameter |
| `buildSystemPrompt()` in whatsapp-intake | Add room context to AI prompt |
| whatsapp-intake ticket creation block | Pass `room_id` to `c1_create_ticket` |

**Nothing else changes.** The pipeline, branch detection, AI classification, dispatcher, and completion flow are all untouched.

---

## How `c1_context_logic` Works Today

```
Input: phone number + message
→ Look up tenant by phone (c1_tenants)
→ Get tenant's property_id
→ Get property and property_manager
→ Return ctx object with: tenant, property, property_manager, conversation, ai_instruction
```

---

## The Extension

After the tenant lookup, one additional step:

```
→ Look up tenant by phone (c1_tenants) — EXISTING
→ Get tenant's room_id from c1_tenants.room_id — NEW
→ If room_id found:
    → Fetch room record from c1_rooms — NEW
    → Add ctx.room to return object — NEW
→ If tenant found but room_id IS NULL:
    → Set ai_instruction = 'CONFIRM_ROOM' — NEW
    → Fetch available rooms for tenant's property — NEW
    → Add ctx.available_rooms to return object — NEW
→ Continue existing flow — EXISTING
```

---

## The Room Confirmation Flow

This only triggers when a known tenant has no `room_id` set. It happens once per tenant, then never again.

**AI instruction: `CONFIRM_ROOM`**

When `buildSystemPrompt()` receives `ai_instruction = CONFIRM_ROOM`, it instructs GPT-4o to ask the tenant to confirm their room before continuing:

> "Hi [name], before I log your issue I just need to confirm which room you're in. Is it [Room 1], [Room 2], or [Room 3]?"

The tenant replies with their room. The intake function:
1. Matches their reply against the available room list
2. Updates `c1_tenants.room_id = matched_room.id`
3. Updates `c1_rooms.current_tenant_id = tenant.id`
4. Sets `ai_instruction` back to normal intake flow
5. Continues processing their original message

**If the tenant's reply doesn't match any room:**

> "Sorry, I didn't catch that. Can you tell me your room number? For example, reply 'Room 1' or 'Room 2'."

After two failed attempts: fall back to normal intake flow without room assignment. Log to `c1_events`. Operator sees it in activity feed.

---

## System Prompt Extension

When `ctx.room` is available, `buildSystemPrompt()` adds one line to the property/tenant context block:

```
Tenant: [name]
Property: [address]
Room: Room 3          ← NEW
```

This gives GPT-4o the room context for its response and classification. No other prompt changes needed.

---

## Ticket Creation

The existing ticket creation block in `whatsapp-intake` (lines 406–566) calls `c1_create_ticket`. Add `room_id` to that call:

```typescript
// Existing (simplified)
const ticket = await supabase.rpc("c1_create_ticket", {
  _tenant_id: ctx.tenant.id,
  _property_id: ctx.property.id,
  // ... other existing params
})

// Extended
const ticket = await supabase.rpc("c1_create_ticket", {
  _tenant_id: ctx.tenant.id,
  _property_id: ctx.property.id,
  _room_id: ctx.room?.id ?? null,   // NEW — nullable, backwards compatible
  // ... other existing params
})
```

---

## Twilio Template: `room_confirm_prompt`

New template for the room confirmation message:

> Hi {{1}}, before I log your issue I just need to confirm which room you're in. Is it {{2}}? (Reply with your room name or number)

Variables: `{{1}}` = tenant first name, `{{2}}` = comma-separated room list e.g. "Room 1, Room 2, or Room 3"

Register this template in Twilio console and add the mapping to `constants.ts` alongside the existing 27 template mappings.

---

## Backwards Compatibility

- All existing tenants without `room_id` continue to work normally — their tickets just won't have a `room_id`.
- The `CONFIRM_ROOM` flow is only triggered once `c1_rooms` has data. If a PM hasn't set up rooms yet, `available_rooms` is empty — skip confirmation, proceed normally.
- `c1_create_ticket` with `room_id = null` is identical to current behaviour.

---

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Unknown phone number | Existing nomatch flow — no room logic |
| Tenant in system, property has no rooms configured | Skip CONFIRM_ROOM, proceed normally |
| Tenant confirms room but room already has a different current_tenant_id | Log conflict to c1_events, skip room assignment, proceed with intake without room |
| Tenant replies to confirmation with something unrelated ("my boiler is broken") | Re-prompt once. If still no match, proceed without room. |
| c1_rooms table doesn't exist yet (pre-migration) | c1_context_logic query fails gracefully, returns null room, proceeds normally |

---

## Testing the Flow

**Preconditions:**
- c1_rooms table exists with at least one room
- Test tenant exists with a valid phone number
- Test tenant has `room_id = NULL` (to trigger confirmation flow)

**Test sequence:**
1. Send WhatsApp from test tenant number: "My boiler isn't working"
2. Expect: AI replies asking to confirm room
3. Reply: "Room 3"
4. Expect: Normal intake continues, tenant gets triaged
5. Check: `c1_tenants.room_id` updated, ticket created with `room_id`

**Test second message (room already set):**
1. Send WhatsApp: "The window is broken"
2. Expect: Normal intake, no room confirmation prompt
3. Check: Ticket created with same `room_id` as before
