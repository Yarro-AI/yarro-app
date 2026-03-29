# Portal Authentication RPCs

Token-based portal access for contractors, tenants, landlords, and OOH contacts.
These validate temporary tokens and return ticket data for unauthenticated portals.
There is no alternative auth mechanism — if these break, external users are locked out.

---

### c1_get_contractor_ticket
- **Purpose:** Validates contractor token and loads ticket data (portal entry point).
- **Signature:** `(p_token text) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `contractor/[token]/page.tsx`
- **Breaks:** Contractors can't access their portal — can't schedule, quote, or complete jobs

### c1_get_contractor_quote_context
- **Purpose:** Validates quote token and loads context for quote submission.
- **Signature:** `(p_token text) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `contractor/[token]/page.tsx`
- **Breaks:** Contractors can't submit quotes

### c1_get_tenant_ticket
- **Purpose:** Validates tenant token and loads ticket for confirmation page.
- **Signature:** `(p_token text) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `tenant/[token]/page.tsx`
- **Breaks:** Tenants can't view or confirm their tickets

### c1_get_landlord_ticket
- **Purpose:** Validates landlord token and loads escalated ticket context.
- **Signature:** `(p_token text) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `landlord/[token]/page.tsx`
- **Breaks:** Landlords can't view escalated tickets or submit outcomes

### c1_get_ooh_ticket
- **Purpose:** Validates OOH contact token for emergency ticket access.
- **Signature:** `(p_token text) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ooh/[token]/page.tsx`
- **Breaks:** Emergency OOH contacts can't respond to urgent tickets
