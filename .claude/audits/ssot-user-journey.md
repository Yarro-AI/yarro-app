# SSOT Audit — User Journey Checklist

Audit each step by tracing reads and writes. Don't skip ahead. Complete each phase before moving to the next.

---

## Phase 1: Onboarding & Setup

### 1.1 PM signs up and creates first property
- Property record created — direct insert or RPC?
- Where is address stored? Who reads it?
- Landlord linked — is landlord_name on property a denormalized copy of c1_landlords.full_name?
- Property type (HMO vs single_let) — who writes it, who reads it?

### 1.2 PM adds rooms to property
- Room created with rent config (monthly_rent, rent_due_day)
- Where does room count come from on the properties page?
- Is is_vacant a stored field or computed? Who computes it?

### 1.3 PM adds tenants
- Tenant created (direct insert? RPC? onboarding flow? bulk import?)
- tenant.property_id — is this always accurate?
- tenant.room_id — is this always accurate? Who maintains it?
- Tenant count on property page — derived from which source?

### 1.4 PM assigns tenant to room
- What gets updated? (rooms, tenants, ledger, audit)
- Is the trigger the only path or are there manual updates?
- Does the frontend read assignment status from room or tenant?

### 1.5 PM adds contractors
- Contractor linked to properties via property_ids array
- Is contractor count per property derived from this array?
- When contractor is unlinked, does everything update?

### 1.6 PM configures compliance certificates
- Cert created with expiry date, type, property
- Status (valid/expiring/expired) — computed where? Stored or derived?
- Compliance % on dashboard — computed where?

---

## Phase 2: Daily Operations

### 2.1 Dashboard view
- To-do items: which RPC? What data does it join?
- Stat cards (occupancy %, compliance %, rent): where do these numbers come from?
- Priority scores, SLA timers — computed in RPC or frontend?
- "Stuck" bucket — computed where?

### 2.2 Tenant reports maintenance issue (WhatsApp intake)
- Ticket created by edge function
- Tenant matched to property/room — how?
- Priority set — by whom? Is it the same logic as manual tickets?
- Category determined — by AI? Stored where?

### 2.3 Contractor dispatch flow
- Contractor matched to trade
- Message sent, stage tracked in c1_messages
- Timeout detection — where computed? Same in dashboard and ticket detail?
- Contractor status (sent/accepted/declined/no_response) — who writes, who reads?

### 2.4 Ticket state changes
- next_action + next_action_reason — written by trigger only?
- Is any page reading raw ticket fields instead of the trigger-computed state?
- Labels on dashboard vs drawer — same mapping?
- Priority badge — same component everywhere?

### 2.5 Landlord approval flow
- Landlord notified, response tracked
- Approval/decline status — where stored?
- Does dashboard show same status as ticket drawer?

### 2.6 Job completion
- Contractor marks complete via portal
- Completion record created
- Ticket auto-closes — via trigger?
- Does tenant get notified? Same channel routing as other messages?

---

## Phase 3: Rent Operations

### 3.1 Rent ledger creation
- When tenant assigned: trigger creates entry
- Monthly cron: creates next month entries
- Manual "generate" button: still exists anywhere?
- Are all paths using the same logic?

### 3.2 Rent page display
- /rent page: which RPC?
- Property rent tab: which RPC?
- Dashboard rent ticket: which RPC?
- Ticket drawer rent overview: which RPC?
- Are they all reading from the same source?

### 3.3 Rent payment recording
- Record payment: which RPC?
- Payment status (paid/partial/overdue) — computed where?
- Amount remaining — computed in DB or frontend?
- Ticket auto-close on payment — same path as manual close?

### 3.4 Rent reminders
- Contact method routing — does cron use same logic as other messages?
- Reminder status (sent_at fields) — who reads these?
- Overdue detection — same logic in cron and in query RPCs?

### 3.5 Former tenant rent
- Tenant removed — pending entries cancelled by trigger?
- Outstanding debt — visible on rent page, property page, dashboard?
- "Former" label — computed the same way everywhere?

---

## Phase 4: Compliance Operations

### 4.1 Certificate status
- Status field on c1_compliance_certificates — who writes it?
- Is status derived from expiry_date or independently maintained?
- Does the compliance page, property page, and dashboard all read the same status?

### 4.2 Compliance reminders
- Reminder cron: reads cert status from where?
- Auto-ticket creation: reads cert status from where?
- Are these the same source?

### 4.3 Compliance ticket lifecycle
- Ticket created when cert expires/expiring — by which function?
- cert_renewed detection — who computes this?
- Auto-close when cert renewed — same trigger as other ticket types?

---

## Phase 5: Cross-Cutting Concerns

### 5.1 Audit trail
- c1_events: which actions log events?
- Which actions DON'T log events?
- Can you reconstruct a full timeline for a tenant? A property? A room?

### 5.2 Contact method routing
- tenant.contact_method — who reads it?
- Is the same routing logic used for rent reminders, maintenance notifications, and compliance reminders?

### 5.3 Labels and display text
- Status badges — same component everywhere?
- Priority labels — same mapping everywhere?
- next_action_reason display — same REASON_DISPLAY mapping in dashboard and drawer?

### 5.4 Counts and summaries
- Tenant count per property
- Room occupancy
- Compliance %
- Rent outstanding
- For each: computed where? Same logic everywhere it's shown?
