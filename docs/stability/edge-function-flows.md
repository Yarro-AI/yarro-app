# Edge Function Flows

Step-by-step data flows for the three core edge functions. Each step shows the RPC or service called, what happens on failure, and where data moves.

---

## 1. WhatsApp Intake Flow

**Function:** `supabase/functions/yarro-tenant-intake/index.ts` (589 lines)
**Trigger:** Twilio webhook (inbound WhatsApp message)

```
Tenant sends WhatsApp message
        │
        ▼
┌─ yarro-tenant-intake ──────────────────────────────────┐
│                                                         │
│  1. Parse Twilio webhook body                           │
│     ├─ Extract: phone, message text, media URLs         │
│     └─ If no phone → return 200 (drop silently)         │
│                                                         │
│  2. Fetch Twilio media (if images attached)             │
│     └─ On failure → empty array (non-blocking)          │
│                                                         │
│  3. Call c1_context_logic RPC                           │
│     ├─ Identifies: tenant, property, conversation       │
│     ├─ Returns: AI instruction, context, stage          │
│     └─ On failure → alertTelegram, return 200           │
│        ⚠ Tenant gets no reply                           │
│                                                         │
│  4. Build AI prompt from context                        │
│     ├─ Uses: ctx.property, ctx.tenant, ctx.conversation │
│     └─ ⚠ If any ctx value is null → "null" in prompt    │
│                                                         │
│  5. Call OpenAI GPT-4o                                  │
│     ├─ Sends conversation history + system prompt       │
│     └─ On failure → alertTelegram, send fallback msg    │
│        "Sorry, I'm having a temporary issue"            │
│                                                         │
│  6. Parse AI response (JSON)                            │
│     ├─ Extract: branch, message, handoff flag           │
│     └─ Normalize handles malformed JSON gracefully      │
│                                                         │
│  7. Branch on result.branch:                            │
│     │                                                   │
│     ├─ "normal" ──────────────────────────────────────┐ │
│     │  ├─ Send reply to tenant via WhatsApp            │ │
│     │  ├─ Append to conversation (c1_convo_append)     │ │
│     │  └─ ⚠ If append fails: msg sent but not logged   │ │
│     │                                                   │
│     ├─ "final" / "handoff" / "emergency" ─────────────┐ │
│     │  ├─ Send reply to tenant via WhatsApp            │ │
│     │  ├─ Finalize conversation (c1_convo_finalize)    │ │
│     │  │   └─ ⚠ On failure: alertTelegram, return 200  │ │
│     │  │      Conversation stays open, no ticket       │ │
│     │  │                                               │ │
│     │  ├─ Call IssueAI (structured classification)     │ │
│     │  │   ├─ Categorizes, prioritizes, selects        │ │
│     │  │   │   contractor                              │ │
│     │  │   └─ On failure: uses fallback defaults       │ │
│     │  │                                               │ │
│     │  ├─ Check for existing open ticket (dedup)       │ │
│     │  │   └─ If found: skip creation, return 200      │ │
│     │  │                                               │ │
│     │  ├─ Create ticket (c1_create_ticket)             │ │
│     │  │   └─ ⚠ On failure: alertTelegram, return 200  │ │
│     │  │      CONVERSATION ALREADY CLOSED — TICKET     │ │
│     │  │      LOST, REQUIRES MANUAL RECOVERY           │ │
│     │  │                                               │ │
│     │  ├─ Upload images to Supabase Storage            │ │
│     │  │   └─ On failure: logged, continues            │ │
│     │  │      Images stay as Twilio URLs (expire)      │ │
│     │  │                                               │ │
│     │  └─ Trigger yarro-ticket-notify                  │ │
│     │      └─ On failure: alertTelegram                │ │
│     │         Ticket exists but PM never notified      │ │
│     │                                                   │
│     └─ "duplicate" / "nomatch" ───────────────────────┐ │
│        ├─ Send status reply to tenant                  │ │
│        └─ Quick finalize (c1_convo_finalize_quick)     │ │
│           └─ ⚠ No error handling on this path          │ │
│                                                         │
│  8. Top-level catch (unhandled exceptions)              │
│     └─ alertTelegram, return 200                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
        │
        ▼
  Return 200 to Twilio (always)
```

---

## 2. Notification Flow

**Function:** `supabase/functions/yarro-ticket-notify/index.ts` (665 lines)
**Trigger:** Called by yarro-tenant-intake after ticket creation

```
yarro-ticket-notify receives ticket_id
        │
        ▼
┌─ Notification Logic ───────────────────────────────────┐
│                                                         │
│  1. Fetch ticket context (c1_ticket_context RPC)        │
│     └─ On failure → return 500 (caller sees error)      │
│                                                         │
│  2. Check: is it Out-of-Hours?                          │
│     ├─ If OOH enabled + outside business hours:         │
│     │   ├─ Fetch OOH contacts                           │
│     │   ├─ For EMERGENCY/URGENT: dispatch to OOH        │
│     │   └─ On failure: falls through to normal dispatch  │
│     └─ Otherwise: normal dispatch                       │
│                                                         │
│  3. Send SMS notifications (parallel via Promise.all):  │
│     ├─ PM notification (ticket summary)                 │
│     ├─ Tenant confirmation ("we've logged your issue")  │
│     ├─ Landlord notification (if configured)            │
│     └─ ⚠ If one send fails, others still complete       │
│        No rollback — inconsistent notification state    │
│                                                         │
│  4. Trigger contractor dispatch                         │
│     ├─ Call c1_contractor_context RPC                   │
│     └─ On failure: alertTelegram, return 200            │
│        ⚠ Ticket created, PM notified, but contractors   │
│        never contacted                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Dispatch Flow

**Function:** `supabase/functions/yarro-dispatcher/index.ts` (487 lines)
**Trigger:** Called by yarro-ticket-notify or pg_cron (for delayed dispatches)

```
yarro-dispatcher receives instruction
        │
        ▼
┌─ Dispatch Logic ───────────────────────────────────────┐
│                                                         │
│  1. Check ticket status                                 │
│     ├─ Uses .single() — ⚠ crashes if ticket not found   │
│     └─ If status = "closed" → return 400 (skip)         │
│                                                         │
│  2. Route by instruction type:                          │
│     ├─ "contractor-sms" → send SMS to contractor        │
│     ├─ "pm-sms" → send update to PM                     │
│     ├─ "landlord-sms" → send to landlord                │
│     ├─ "tenant-sms" → send confirmation to tenant       │
│     └─ "ooh-sms" → send to out-of-hours contact         │
│                                                         │
│  3. For each SMS:                                       │
│     ├─ Call sendAndLog() (retries once on 429/5xx)      │
│     ├─ Mark as sent (c1_contractor_mark_sent etc.)      │
│     └─ ⚠ If mark fails: SMS sent but not recorded       │
│        Could cause re-send on next dispatch cycle       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Complete End-to-End Path

```
Tenant WhatsApp msg
  → Twilio webhook
    → yarro-tenant-intake
      → c1_context_logic (identify tenant, property, conversation)
      → OpenAI GPT-4o (generate response)
      → Send reply to tenant
      → c1_convo_finalize (close conversation)
      → IssueAI (classify, prioritize, assign)
      → c1_create_ticket (create ticket record)
        → yarro-ticket-notify
          → c1_ticket_context (load full ticket data)
          → Send SMS: PM, tenant, landlord
          → c1_contractor_context (prepare dispatch)
            → yarro-dispatcher
              → Send SMS to contractor(s)
              → c1_contractor_mark_sent (record dispatch)
```

**Total RPCs in one message path:** 7+
**Total external API calls:** 1 OpenAI + 4-6 Twilio SMS
**Failure points:** 10+ (each with Telegram alert)
**Time budget:** 60 seconds (Supabase Edge Function timeout)

### Alternative Paths (Non-Maintenance)

**Compliance Renewal:**
```
yarro-compliance-reminder (daily cron 8am)
  → get_compliance_expiring
    → c1_create_manual_ticket (creates ticket + c1_messages)
      → TRIGGER: c1_trigger_recompute_next_action
        → c1_compute_next_action → compute_compliance_next_action
      → yarro-ticket-notify → yarro-dispatcher
```

**Rent Arrears:**
```
yarro-rent-reminder (daily cron 9am)
  → rent_escalation_check
    → create_rent_arrears_ticket (no c1_messages, no contractor)
      → TRIGGER: c1_trigger_recompute_next_action
        → c1_compute_next_action → compute_rent_arrears_next_action
```

---

## 4. Compliance Reminder Flow

**Function:** `supabase/functions/yarro-compliance-reminder/index.ts`
**Trigger:** pg_cron daily at 8am UTC

```
yarro-compliance-reminder runs daily
        │
        ▼
┌─ Compliance Logic ─────────────────────────────────────┐
│                                                         │
│  1. Call get_compliance_expiring(days_ahead=90)          │
│     ├─ Returns certs within reminder window              │
│     └─ On failure → alertTelegram, return 200            │
│                                                         │
│  2. For each expiring certificate:                      │
│     ├─ If contractor_id set on certificate:              │
│     │   ├─ Call c1_create_manual_ticket                  │
│     │   │   category = 'compliance_renewal'              │
│     │   │   priority = high if < 14 days, else medium    │
│     │   ├─ Dispatcher auto-triggers from c1_messages     │
│     │   └─ On failure: fall through to PM notification   │
│     │                                                    │
│     ├─ Send PM notification via sendAndLog               │
│     │   (WhatsApp or email, auto-detected)               │
│     │                                                    │
│     ├─ Increment reminder_count on certificate           │
│     └─ Log to c1_events via c1_log_system_event          │
│                                                         │
│  3. Per-cert error handling — batch continues on failure │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key:** Compliance dispatch reuses the existing ticket + dispatcher pipeline. No new notification system. Compliance tickets route through `compute_compliance_next_action` sub-routine.

---

## 5. Rent Reminder + Escalation Flow

**Function:** `supabase/functions/yarro-rent-reminder/index.ts`
**Trigger:** pg_cron daily at 9am UTC

```
yarro-rent-reminder runs daily
        │
        ▼
┌─ Reminder Phase ───────────────────────────────────────┐
│                                                         │
│  1. Call get_rent_reminders_due                          │
│     ├─ Returns ledger entries matching reminder          │
│     │   schedule (3 days before, on due date,            │
│     │   3 days overdue)                                  │
│     └─ On failure → alertTelegram, return 200            │
│                                                         │
│  2. For each entry: send WhatsApp to tenant              │
│     ├─ Template varies by reminder level (1/2/3)         │
│     ├─ Update reminder_N_sent_at                         │
│     ├─ If level 3 + status=pending → flip to overdue     │
│     └─ Log via c1_log_system_event                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Escalation Phase ─────────────────────────────────────┐
│                                                         │
│  3. Call rent_escalation_check()                         │
│     ├─ Returns tenants with exhausted reminders          │
│     │   (reminder_3 sent 7+ days ago, still overdue)     │
│     └─ Excludes tenants with existing open ticket        │
│                                                         │
│  4. For each tenant:                                     │
│     ├─ create_rent_arrears_ticket (dedup per tenant)     │
│     ├─ Notify PM via sendAndLog                          │
│     └─ Log via c1_log_system_event                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key:** Escalation creates tickets only after all 3 reminders exhausted + 7 day grace period. Dedup built into `create_rent_arrears_ticket`. Rent tickets route through `compute_rent_arrears_next_action`.

---

## 6. Rent Payment Flow

**Trigger:** PM calls `record_rent_payment` from dashboard rent UI

```
PM records payment via rent UI
        │
        ▼
┌─ record_rent_payment RPC ──────────────────────────────┐
│                                                         │
│  1. Ownership check (pm_id matches ledger entry)        │
│     └─ On failure → RAISE EXCEPTION                     │
│                                                         │
│  2. INSERT into c1_rent_payments                        │
│     └─ TRIGGER: trg_rent_payment_update_ledger          │
│        ├─ SUMs all payments for this ledger entry        │
│        ├─ Updates c1_rent_ledger.amount_paid + status    │
│        └─ Sets paid_at if fully paid                     │
│                                                         │
│  3. Check if ALL arrears for tenant cleared              │
│     └─ If yes: auto-close rent_arrears ticket            │
│        ├─ c1_trigger_recompute_next_action fires         │
│        └─ next_action = 'completed' / 'rent_cleared'     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Key:** Payment accumulates — multiple partial payments are summed by trigger. Auto-close only fires when ALL overdue entries for the tenant are resolved, not just the one being paid.
