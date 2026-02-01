# Yarro PM App — Changelog

All notable changes to the Yarro PM Dashboard app. This log tracks production updates with clear documentation of what changed and why.

**Format**: Each entry includes the issue/request, what was changed, and why.

---

## 2026-02-01

### Delete Functionality for All Entities

**Issue**: PM couldn't delete properties, contractors, tenants, or tickets after creation.

**Changes**:
1. Created reusable [confirm-delete-dialog.tsx](src/components/confirm-delete-dialog.tsx)
2. Updated [detail-drawer.tsx](src/components/detail-drawer.tsx) with `deletable` prop and delete button
3. Added delete handlers to:
   - [tenants/page.tsx](src/app/(dashboard)/tenants/page.tsx) — Hard delete with open tickets check
   - [properties/page.tsx](src/app/(dashboard)/properties/page.tsx) — Hard delete with tenants/tickets check
   - [contractors/page.tsx](src/app/(dashboard)/contractors/page.tsx) — Soft delete (sets `active = false`)
   - [tickets/page.tsx](src/app/(dashboard)/tickets/page.tsx) — Hard delete including messages/completions

**Why**: PM needs ability to remove test data and correct mistakes. Soft delete for contractors preserves history.

---

### Manual Tickets Flow Upgrade

**Issue**: Property dropdown unusable with 600+ properties. No way to add new tenant/contractor inline.

**Changes** ([ticket-form.tsx](src/components/ticket-form.tsx)):
1. Created searchable [combobox.tsx](src/components/ui/combobox.tsx) component
2. Replaced property Select with searchable Combobox
3. Replaced tenant Select with Combobox + "Add New Tenant" button
4. Added "Add New Contractor" button with inline creation modal
5. Uses existing [normalize.ts](src/lib/normalize.ts) for phone/email validation

**Why**: With 600 properties, Select is unusable. Inline add reduces friction for one-off tenants/contractors.

---

### Double-Quote Warning

**Issue**: When a 2nd contractor quote comes in after 1st was approved, PM gets no warning.

**Changes** ([tickets/page.tsx](src/app/(dashboard)/tickets/page.tsx)):
1. Added `previouslyApprovedContractor` state
2. Query c1_messages.contractors for `manager_decision: "approved"`
3. Display amber warning banner when viewing ticket with existing approval

**Why**: Prevents PM from accidentally double-booking contractors.

---

### Import Data Sidebar Item

**Issue**: Adam wants Import Data back as a separate sidebar item.

**Changes** ([sidebar.tsx](src/components/sidebar.tsx)):
- Added "Import Data" item under Resources section
- Points to `/guide/import`

---

### Custom Date Filter

**Issue**: Need custom date range picker that doesn't shift dashboard layout.

**Changes** ([date-filter.tsx](src/components/date-filter.tsx)):
1. Created [calendar.tsx](src/components/ui/calendar.tsx) using react-day-picker
2. Created [popover.tsx](src/components/ui/popover.tsx) for floating popup
3. Added "Custom" button with floating calendar popover
4. Two-month calendar for easy range selection
5. Shows `dd/mm/yy - dd/mm/yy` format on button when custom range active

**Why**: PM needs to filter by specific date ranges. Popover floats above elements without shifting layout.

---

### Auth Bug Fixes

**Issue**: "Account not found" error shows then logs user in anyway. Forgot password flow sends reset link then redirects to dashboard.

**Changes** ([login/page.tsx](src/app/login/page.tsx)):
1. Changed `supabase.auth.signOut()` to server-side `/api/auth/logout` call
2. Added `mode === 'login'` check to prevent redirect during forgot password flow

**Why**:
- Client-side `signOut()` doesn't clear httpOnly cookies, so session persists
- User could be mid-forgot-password when PM context loads and triggers redirect

**Commit**: `55c6045`

---

### Contractor Selection UX Improvements

**Issue**: When creating manual tickets, PM can't select contractors not assigned to the property. Also, no warning when selecting a contractor with mismatched category.

**Changes** ([ticket-form.tsx](src/components/ticket-form.tsx)):
1. Removed property filter — ALL contractors now shown for manual tickets
2. Sort order: property-assigned first, then category match, then alphabetical
3. Added "Other" badge for contractors not assigned to selected property
4. Added amber warning box when selected contractor's category doesn't match job type
   - Example: "Job category is 'Plumbing' but John Smith specialises in 'Electrical'"

**Why**:
- Manual tickets need flexibility (e.g., regular contractor on holiday)
- Visual mismatch warning prevents accidental wrong-contractor selection
- PM can still select any contractor but is informed of implications

**Commit**: `55c6045`

---

### Dashboard Stats Card Labels

**Issue**: Request to add "Awaiting" prefix to stats cards for clarity.

**Changes** ([page.tsx](src/app/(dashboard)/page.tsx)):
- "Contractor" → "Awaiting Contractor"
- "Manager" → "Awaiting Manager"
- "Landlord" → "Awaiting Landlord"

**Commit**: `c8a8e01`

---

## 2026-01-31

### Dashboard Stats Reorganization

**Issue**: Request to reorganize dashboard stats into two logical groups.

**Changes**:
- Left group (muted style): Awaiting Contractor, Awaiting Manager, Awaiting Landlord
- Right group (accent style): Handoff, Declined, Scheduled
- Added subtle vertical divider between groups
- Handoff card: red glow when count > 0
- Declined card: orange accent when count > 0

**Commit**: `0c15113`

---

### Tenant Roles Simplified

**Issue**: Too many tenant role options (5). Reduce to 3.

**Changes**:
- Reduced roles to: Tenant, Lead Tenant, Other
- Migrated DB: `UPDATE c1_tenants SET role_tag = 'other' WHERE role_tag = 'occupant'`

---

### Guide System CSS Columns

**Issue**: Guide pages had inconsistent sizing and content didn't flow naturally.

**Changes**:
- All guide pages use CSS `columns-2` layout
- Content flows left column first, then right
- `break-inside-avoid` keeps steps intact
- Fixed container size `min-h-[540px]` across all guides

---

## Pre-2026-01-31 (v1 completion)

See [SESSION_LOG.md](../../../SESSION_LOG.md) for historical context.

Key items delivered:
- Dashboard redesign (C2C style sections)
- Guide system with tabbed navigation
- User education content (For You, Tenant, Contractor, Landlord guides)
- Copy-to-clipboard functionality for guides
- n8n flow retries added to all workflows

---

## How to Use This Changelog

**For Adam's feedback**: Add new entry with:
- Clear description of the issue/request
- What was changed (files, specific changes)
- Why the change was made
- Commit hash

**For debugging**: Trace back through commits to find when behavior changed.

**For handoff**: Anyone can understand what the system does and why.
