# Module 05: Compliance Workflow MVP

## ICP Mental Model

**Who:** HMO landlords and small R2R operators, 10-100 rooms, multiple properties.

**Core fear:** Compliance failure is existential - council prosecution + insurance void + criminal liability. All at once.

**Emotional job:** "I am covered. I can prove it. I don't have to remember anything."

**Ideal frequency:** Never check. System handles it. Only involved when a decision is needed.

**Trust signals:** Clear action list + everything green + exportable proof + automated handling + feeling in control.

## MVP Scope

### In Scope
1. Property compliance configuration - smart defaults by property type (HMO vs single let)
2. Fixed status model - "renewal scheduled" state, expiring is still compliant
3. Action-based dashboard card - "X actions needed" instead of misleading percentage
4. Compliance to-dos on dashboard - actionable next steps alongside ticket to-dos
5. Portfolio summary export - one-page PDF proof via print

### Deferred to V2
- AI document extraction from uploaded certs
- Configurable renewal modes per cert type (auto/approve/manual)
- Contractor upload portal
- Historical audit trail queries ("was X valid on date Y")
- Cert N/A marking with reason field

## Status Model

| Display Status | Condition | Compliant? | On To-Do? |
|---------------|-----------|------------|-----------|
| Valid | Verified, expiry > 30 days | Yes | No |
| Expiring soon | Verified, expiry <= 30 days, no renewal ticket | Yes | Yes |
| Renewal scheduled | Expiring/expired + active renewal ticket | Yes | No |
| Expired | Past expiry, no renewal ticket | No | Yes |
| Missing | Required cert, no record | No | Yes |
| Review | Uploaded, not verified | Pending | Yes |

## Database Changes

- `c1_properties.property_type` column (default: 'hmo')
- `c1_compliance_requirements` table (orphaned — kept for rollback safety, no longer queried)
- `c1_tickets.compliance_certificate_id` FK
- RPCs: `compliance_get_property_status`, `compliance_get_all_statuses`, `compliance_get_todos`
- Updated: `compliance_get_summary` (action-based counts)
- Updated: `c1_create_manual_ticket` (accepts optional cert ID)
- **Dropped (2026-04-04):** `compliance_upsert_requirements`, `compliance_set_property_type`, auto-populate trigger. Requirements are now opt-in — no auto-defaults by property type.

## Migration Files

- `supabase/migrations/20260330100000_compliance_workflow_mvp.sql`
- `supabase/migrations/20260330110000_compliance_all_statuses_rpc.sql`
