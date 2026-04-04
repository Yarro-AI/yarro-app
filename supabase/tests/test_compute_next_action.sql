-- ============================================================================
-- Regression test suite for c1_compute_next_action
-- Phase A: 18 regression tests (existing branches)
-- Phase B: 29 sub-routine + rent infrastructure tests
--
-- Run against local Supabase:
--   docker exec -i supabase_db_yarro-pm psql -U postgres < supabase/tests/test_compute_next_action.sql
--
-- All test data is created inside a transaction and rolled back.
-- ============================================================================

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Test counter
CREATE TEMP TABLE _test_results (
  test_num   INT,
  test_name  TEXT,
  expected   TEXT,
  actual     TEXT,
  passed     BOOLEAN
);

-- Deterministic UUIDs for test data
CREATE OR REPLACE FUNCTION _test_uuid(n INT) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;
$$;

-- Insert a test property manager (FK requirement)
INSERT INTO c1_property_managers (id, business_name, name, email, dispatch_mode, ooh_routine_action, ticket_mode, min_booking_lead_hours, ooh_enabled)
VALUES (_test_uuid(999), 'Test PM Co', 'Test PM', 'test@test.com', 'auto', 'log', 'auto', 2, false);

-- ── Assertion helper ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _assert_next_action(
  p_test_num INT,
  p_test_name TEXT,
  p_ticket_id uuid,
  p_expected_action TEXT,
  p_expected_reason TEXT
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM c1_compute_next_action(p_ticket_id);

  INSERT INTO _test_results (test_num, test_name, expected, actual, passed)
  VALUES (
    p_test_num,
    p_test_name,
    p_expected_action || ' / ' || p_expected_reason,
    COALESCE(v_result.next_action, 'NULL') || ' / ' || COALESCE(v_result.next_action_reason, 'NULL'),
    v_result.next_action = p_expected_action AND v_result.next_action_reason = p_expected_reason
  );
END;
$$;

-- ── Disable recompute trigger to avoid side effects during INSERT ───────────

ALTER TABLE c1_tickets DISABLE TRIGGER trg_tickets_recompute_next_action;
ALTER TABLE c1_messages DISABLE TRIGGER trg_messages_recompute_next_action;
ALTER TABLE c1_job_completions DISABLE TRIGGER trg_job_completions_recompute_next_action;

-- ============================================================================
-- TEST 1: Fresh open ticket → 'new' / 'new'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(1), 'open', now(), _test_uuid(999));

SELECT _assert_next_action(1, 'Fresh open ticket', _test_uuid(1), 'new', 'new');

-- ============================================================================
-- TEST 2: archived = true → 'archived' / 'archived'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, archived)
VALUES (_test_uuid(2), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(2, 'Archived ticket', _test_uuid(2), 'archived', 'archived');

-- ============================================================================
-- TEST 3: archived + handoff → 'dismissed' / 'dismissed'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, archived, handoff)
VALUES (_test_uuid(3), 'open', now(), _test_uuid(999), true, true);

SELECT _assert_next_action(3, 'Archived + handoff', _test_uuid(3), 'dismissed', 'dismissed');

-- ============================================================================
-- TEST 4: status = 'closed' → 'completed' / 'completed'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(4), 'closed', now(), _test_uuid(999));

SELECT _assert_next_action(4, 'Closed ticket', _test_uuid(4), 'completed', 'completed');

-- ============================================================================
-- TEST 5: on_hold = true → 'on_hold' / 'on_hold'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, on_hold)
VALUES (_test_uuid(5), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(5, 'On hold', _test_uuid(5), 'on_hold', 'on_hold');

-- ============================================================================
-- TEST 6: landlord_allocated, no outcome → 'in_progress' / 'allocated_to_landlord'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated)
VALUES (_test_uuid(6), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(6, 'Landlord allocated, no outcome', _test_uuid(6), 'in_progress', 'allocated_to_landlord');

-- ============================================================================
-- TEST 7: landlord_allocated, need_help → 'needs_attention' / 'landlord_needs_help'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(7), 'open', now(), _test_uuid(999), true, 'need_help');

SELECT _assert_next_action(7, 'Landlord needs help', _test_uuid(7), 'needs_attention', 'landlord_needs_help');

-- ============================================================================
-- TEST 8: landlord_allocated, resolved → 'needs_attention' / 'landlord_resolved'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(8), 'open', now(), _test_uuid(999), true, 'resolved');

SELECT _assert_next_action(8, 'Landlord resolved', _test_uuid(8), 'needs_attention', 'landlord_resolved');

-- ============================================================================
-- TEST 9: landlord_allocated, in_progress → 'in_progress' / 'landlord_in_progress'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(9), 'open', now(), _test_uuid(999), true, 'in_progress');

SELECT _assert_next_action(9, 'Landlord in progress', _test_uuid(9), 'in_progress', 'landlord_in_progress');

-- ============================================================================
-- TEST 10: pending_review = true → 'needs_attention' / 'pending_review'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, pending_review)
VALUES (_test_uuid(10), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(10, 'Pending review', _test_uuid(10), 'needs_attention', 'pending_review');

-- ============================================================================
-- TEST 11: ooh_dispatched, no outcome → 'needs_attention' / 'ooh_dispatched'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched)
VALUES (_test_uuid(11), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(11, 'OOH dispatched, no outcome', _test_uuid(11), 'needs_attention', 'ooh_dispatched');

-- ============================================================================
-- TEST 12: ooh_dispatched, resolved → 'needs_attention' / 'ooh_resolved'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched, ooh_outcome)
VALUES (_test_uuid(12), 'open', now(), _test_uuid(999), true, 'resolved');

SELECT _assert_next_action(12, 'OOH resolved', _test_uuid(12), 'needs_attention', 'ooh_resolved');

-- ============================================================================
-- TEST 13: handoff = true → 'needs_attention' / 'handoff_review'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, handoff)
VALUES (_test_uuid(13), 'open', now(), _test_uuid(999), true);

SELECT _assert_next_action(13, 'Handoff review', _test_uuid(13), 'needs_attention', 'handoff_review');

-- ============================================================================
-- TEST 14: job_not_completed (c1_job_completions) → 'follow_up' / 'job_not_completed'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(14), 'open', now(), _test_uuid(999));

INSERT INTO c1_job_completions (id, completed, received_at)
VALUES (_test_uuid(14), false, now());

SELECT _assert_next_action(14, 'Job not completed', _test_uuid(14), 'follow_up', 'job_not_completed');

-- ============================================================================
-- TEST 15: job_stage = 'booked' → 'in_progress' / 'scheduled'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, job_stage)
VALUES (_test_uuid(15), 'open', now(), _test_uuid(999), 'booked');

SELECT _assert_next_action(15, 'Job stage booked', _test_uuid(15), 'in_progress', 'scheduled');

-- ============================================================================
-- TEST 16: c1_messages.stage = 'awaiting_manager' → 'needs_attention' / 'manager_approval'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(16), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(16), 'awaiting_manager');

SELECT _assert_next_action(16, 'Awaiting manager approval', _test_uuid(16), 'needs_attention', 'manager_approval');

-- ============================================================================
-- TEST 17: c1_messages.stage = 'no_contractors_left' → 'assign_contractor' / 'no_contractors'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(17), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(17), 'no_contractors_left');

SELECT _assert_next_action(17, 'No contractors left', _test_uuid(17), 'assign_contractor', 'no_contractors');

-- ============================================================================
-- TEST 18: c1_messages.stage = 'waiting_contractor' → 'in_progress' / 'awaiting_contractor'
-- ============================================================================
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(18), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(18), 'waiting_contractor');

SELECT _assert_next_action(18, 'Waiting contractor', _test_uuid(18), 'in_progress', 'awaiting_contractor');

-- ============================================================================
-- TEST for non-existent ticket → 'new' / 'new'
-- (Bonus: validates NOT FOUND branch with a UUID that has no ticket)
-- ============================================================================
SELECT _assert_next_action(0, 'Non-existent ticket (NOT FOUND)', _test_uuid(900), 'new', 'new');

-- ############################################################################
-- PHASE B: Sub-routine tests (19-41) + Rent infrastructure tests (42-47)
-- ############################################################################

-- ── Sub-routine assertion helper ────────────────────────────────────────────
-- Calls a sub-routine directly (not via c1_compute_next_action)

CREATE OR REPLACE FUNCTION _assert_subroutine(
  p_test_num INT,
  p_test_name TEXT,
  p_actual_action TEXT,
  p_actual_reason TEXT,
  p_expected_action TEXT,
  p_expected_reason TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _test_results (test_num, test_name, expected, actual, passed)
  VALUES (
    p_test_num,
    p_test_name,
    p_expected_action || ' / ' || p_expected_reason,
    COALESCE(p_actual_action, 'NULL') || ' / ' || COALESCE(p_actual_reason, 'NULL'),
    p_actual_action = p_expected_action AND p_actual_reason = p_expected_reason
  );
END;
$$;

-- Generic assertion for non-function tests (rent infra)
CREATE OR REPLACE FUNCTION _assert_equals(
  p_test_num INT,
  p_test_name TEXT,
  p_expected TEXT,
  p_actual TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _test_results (test_num, test_name, expected, actual, passed)
  VALUES (p_test_num, p_test_name, p_expected, p_actual, p_expected = p_actual);
END;
$$;

-- ── Additional test fixtures ────────────────────────────────────────────────

-- Property (needed for rent ledger FK chain: room → property)
INSERT INTO c1_properties (id, address, property_manager_id)
VALUES (_test_uuid(990), '1 Test Street', _test_uuid(999));

-- Tenant
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(980), 'Test Tenant', _test_uuid(999));

-- Room (needed for rent ledger FK)
INSERT INTO c1_rooms (id, room_number, property_id, property_manager_id, rent_frequency)
VALUES (_test_uuid(970), 'R1', _test_uuid(990), _test_uuid(999), 'monthly');

-- Compliance certificate (for compliance sub-routine tests)
INSERT INTO c1_compliance_certificates (id, property_id, certificate_type, status, property_manager_id, reminder_count, expiry_date)
VALUES (_test_uuid(960), _test_uuid(990), 'gas_safety', 'valid', _test_uuid(999), 0, CURRENT_DATE + INTERVAL '1 year');

-- ============================================================================
-- LANDLORD SUB-ROUTINE (Tests 19-22) — built first to validate row-type param
-- ============================================================================

-- TEST 19: landlord, no outcome → 'in_progress' / 'allocated_to_landlord'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(19), 'open', now(), _test_uuid(999), true, NULL);

SELECT _assert_subroutine(19, 'Landlord sub: no outcome',
  r.next_action, r.next_action_reason,
  'in_progress', 'allocated_to_landlord')
FROM compute_landlord_next_action(_test_uuid(19), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(19))) r;

-- TEST 20: landlord, need_help → 'needs_attention' / 'landlord_needs_help'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(20), 'open', now(), _test_uuid(999), true, 'need_help');

SELECT _assert_subroutine(20, 'Landlord sub: need_help',
  r.next_action, r.next_action_reason,
  'needs_attention', 'landlord_needs_help')
FROM compute_landlord_next_action(_test_uuid(20), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(20))) r;

-- TEST 21: landlord, resolved → 'needs_attention' / 'landlord_resolved'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(21), 'open', now(), _test_uuid(999), true, 'resolved');

SELECT _assert_subroutine(21, 'Landlord sub: resolved',
  r.next_action, r.next_action_reason,
  'needs_attention', 'landlord_resolved')
FROM compute_landlord_next_action(_test_uuid(21), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(21))) r;

-- TEST 22: landlord, in_progress → 'in_progress' / 'landlord_in_progress'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, landlord_outcome)
VALUES (_test_uuid(22), 'open', now(), _test_uuid(999), true, 'in_progress');

SELECT _assert_subroutine(22, 'Landlord sub: in_progress',
  r.next_action, r.next_action_reason,
  'in_progress', 'landlord_in_progress')
FROM compute_landlord_next_action(_test_uuid(22), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(22))) r;

-- ============================================================================
-- OOH SUB-ROUTINE (Tests 23-26)
-- ============================================================================

-- TEST 23: ooh, no outcome → 'needs_attention' / 'ooh_dispatched'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched)
VALUES (_test_uuid(23), 'open', now(), _test_uuid(999), true);

SELECT _assert_subroutine(23, 'OOH sub: no outcome',
  r.next_action, r.next_action_reason,
  'needs_attention', 'ooh_dispatched')
FROM compute_ooh_next_action(_test_uuid(23), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(23))) r;

-- TEST 24: ooh, resolved → 'needs_attention' / 'ooh_resolved'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched, ooh_outcome)
VALUES (_test_uuid(24), 'open', now(), _test_uuid(999), true, 'resolved');

SELECT _assert_subroutine(24, 'OOH sub: resolved',
  r.next_action, r.next_action_reason,
  'needs_attention', 'ooh_resolved')
FROM compute_ooh_next_action(_test_uuid(24), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(24))) r;

-- TEST 25: ooh, unresolved → 'needs_attention' / 'ooh_unresolved'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched, ooh_outcome)
VALUES (_test_uuid(25), 'open', now(), _test_uuid(999), true, 'unresolved');

SELECT _assert_subroutine(25, 'OOH sub: unresolved',
  r.next_action, r.next_action_reason,
  'needs_attention', 'ooh_unresolved')
FROM compute_ooh_next_action(_test_uuid(25), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(25))) r;

-- TEST 26: ooh, in_progress → 'in_progress' / 'ooh_in_progress'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched, ooh_outcome)
VALUES (_test_uuid(26), 'open', now(), _test_uuid(999), true, 'in_progress');

SELECT _assert_subroutine(26, 'OOH sub: in_progress',
  r.next_action, r.next_action_reason,
  'in_progress', 'ooh_in_progress')
FROM compute_ooh_next_action(_test_uuid(26), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(26))) r;

-- ============================================================================
-- COMPLIANCE SUB-ROUTINE (Tests 27-32)
-- ============================================================================

-- TEST 27: cert renewed (future expiry, reminder_count=0) → 'completed' / 'cert_renewed'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, compliance_certificate_id)
VALUES (_test_uuid(27), 'open', now(), _test_uuid(999), 'compliance_renewal', _test_uuid(960));

SELECT _assert_subroutine(27, 'Compliance sub: cert_renewed',
  r.next_action, r.next_action_reason,
  'completed', 'cert_renewed')
FROM compute_compliance_next_action(_test_uuid(27), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(27))) r;

-- TEST 28: compliance, job not completed → 'follow_up' / 'job_not_completed'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(28), 'open', now(), _test_uuid(999), 'compliance_renewal');

INSERT INTO c1_job_completions (id, completed, received_at)
VALUES (_test_uuid(28), false, now());

SELECT _assert_subroutine(28, 'Compliance sub: job_not_completed',
  r.next_action, r.next_action_reason,
  'follow_up', 'job_not_completed')
FROM compute_compliance_next_action(_test_uuid(28), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(28))) r;

-- TEST 29: compliance, awaiting_manager → 'needs_attention' / 'manager_approval'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(29), 'open', now(), _test_uuid(999), 'compliance_renewal');

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(29), 'awaiting_manager');

SELECT _assert_subroutine(29, 'Compliance sub: awaiting_manager',
  r.next_action, r.next_action_reason,
  'needs_attention', 'manager_approval')
FROM compute_compliance_next_action(_test_uuid(29), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(29))) r;

-- TEST 30: compliance, waiting_contractor → 'in_progress' / 'awaiting_contractor'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(30), 'open', now(), _test_uuid(999), 'compliance_renewal');

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(30), 'waiting_contractor');

SELECT _assert_subroutine(30, 'Compliance sub: waiting_contractor',
  r.next_action, r.next_action_reason,
  'in_progress', 'awaiting_contractor')
FROM compute_compliance_next_action(_test_uuid(30), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(30))) r;

-- TEST 31: compliance, scheduled (job_stage='booked') → 'in_progress' / 'scheduled'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, job_stage)
VALUES (_test_uuid(31), 'open', now(), _test_uuid(999), 'compliance_renewal', 'booked');

SELECT _assert_subroutine(31, 'Compliance sub: scheduled',
  r.next_action, r.next_action_reason,
  'in_progress', 'scheduled')
FROM compute_compliance_next_action(_test_uuid(31), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(31))) r;

-- TEST 32: compliance, default → 'needs_attention' / 'compliance_pending'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(32), 'open', now(), _test_uuid(999), 'compliance_renewal');

SELECT _assert_subroutine(32, 'Compliance sub: default (compliance_pending)',
  r.next_action, r.next_action_reason,
  'needs_attention', 'compliance_pending')
FROM compute_compliance_next_action(_test_uuid(32), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(32))) r;

-- ============================================================================
-- MAINTENANCE SUB-ROUTINE (Tests 33-38)
-- ============================================================================

-- TEST 33: maintenance, job not completed → 'follow_up' / 'job_not_completed'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(33), 'open', now(), _test_uuid(999));

INSERT INTO c1_job_completions (id, completed, received_at)
VALUES (_test_uuid(33), false, now());

SELECT _assert_subroutine(33, 'Maintenance sub: job_not_completed',
  r.next_action, r.next_action_reason,
  'follow_up', 'job_not_completed')
FROM compute_maintenance_next_action(_test_uuid(33), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(33))) r;

-- TEST 34: maintenance, scheduled → 'in_progress' / 'scheduled'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, job_stage)
VALUES (_test_uuid(34), 'open', now(), _test_uuid(999), 'booked');

SELECT _assert_subroutine(34, 'Maintenance sub: scheduled',
  r.next_action, r.next_action_reason,
  'in_progress', 'scheduled')
FROM compute_maintenance_next_action(_test_uuid(34), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(34))) r;

-- TEST 35: maintenance, awaiting_manager → 'needs_attention' / 'manager_approval'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(35), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(35), 'awaiting_manager');

SELECT _assert_subroutine(35, 'Maintenance sub: awaiting_manager',
  r.next_action, r.next_action_reason,
  'needs_attention', 'manager_approval')
FROM compute_maintenance_next_action(_test_uuid(35), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(35))) r;

-- TEST 36: maintenance, no_contractors_left → 'assign_contractor' / 'no_contractors'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(36), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(36), 'no_contractors_left');

SELECT _assert_subroutine(36, 'Maintenance sub: no_contractors',
  r.next_action, r.next_action_reason,
  'assign_contractor', 'no_contractors')
FROM compute_maintenance_next_action(_test_uuid(36), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(36))) r;

-- TEST 37: maintenance, waiting_contractor → 'in_progress' / 'awaiting_contractor'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(37), 'open', now(), _test_uuid(999));

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(37), 'waiting_contractor');

SELECT _assert_subroutine(37, 'Maintenance sub: waiting_contractor',
  r.next_action, r.next_action_reason,
  'in_progress', 'awaiting_contractor')
FROM compute_maintenance_next_action(_test_uuid(37), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(37))) r;

-- TEST 38: maintenance, default → 'new' / 'new'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id)
VALUES (_test_uuid(38), 'open', now(), _test_uuid(999));

SELECT _assert_subroutine(38, 'Maintenance sub: default (new)',
  r.next_action, r.next_action_reason,
  'new', 'new')
FROM compute_maintenance_next_action(_test_uuid(38), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(38))) r;

-- ============================================================================
-- RENT ARREARS SUB-ROUTINE (Tests 39-41)
-- ============================================================================

-- TEST 39: tenant has overdue entries → 'needs_attention' / 'rent_overdue'
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id)
VALUES (_test_uuid(39), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(980));

INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status)
VALUES (_test_uuid(839), _test_uuid(999), _test_uuid(970), _test_uuid(980), CURRENT_DATE - INTERVAL '30 days', 1000, 'overdue');

SELECT _assert_subroutine(39, 'Rent sub: overdue',
  r.next_action, r.next_action_reason,
  'needs_attention', 'rent_overdue')
FROM compute_rent_arrears_next_action(_test_uuid(39), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(39))) r;

-- TEST 40: tenant has partial entries → 'needs_attention' / 'rent_partial_payment'
-- Need a separate tenant for isolation
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(981), 'Partial Tenant', _test_uuid(999));

INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id)
VALUES (_test_uuid(40), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(981));

INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, amount_paid, status)
VALUES (_test_uuid(840), _test_uuid(999), _test_uuid(970), _test_uuid(981), CURRENT_DATE - INTERVAL '15 days', 1000, 300, 'partial');

SELECT _assert_subroutine(40, 'Rent sub: partial_payment',
  r.next_action, r.next_action_reason,
  'needs_attention', 'rent_partial_payment')
FROM compute_rent_arrears_next_action(_test_uuid(40), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(40))) r;

-- TEST 41: tenant has no overdue entries → 'completed' / 'rent_cleared'
-- Tenant with no overdue ledger entries
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(982), 'Clear Tenant', _test_uuid(999));

INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id)
VALUES (_test_uuid(41), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(982));

SELECT _assert_subroutine(41, 'Rent sub: rent_cleared',
  r.next_action, r.next_action_reason,
  'completed', 'rent_cleared')
FROM compute_rent_arrears_next_action(_test_uuid(41), (SELECT t FROM c1_tickets t WHERE t.id = _test_uuid(41))) r;

-- ============================================================================
-- RENT INFRASTRUCTURE TESTS (42-47)
-- ============================================================================

-- Disable the set_updated_at trigger on rent_ledger to avoid issues
ALTER TABLE c1_rent_ledger DISABLE TRIGGER set_updated_at;

-- TEST 42: record_rent_payment → inserts into c1_rent_payments
INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status)
VALUES (_test_uuid(842), _test_uuid(999), _test_uuid(970), _test_uuid(980), '2026-05-01', 1000, 'overdue');

SELECT _assert_equals(42, 'record_rent_payment returns payment ID',
  'true',
  (record_rent_payment(_test_uuid(842), _test_uuid(999), 500, 'bank_transfer', 'Test payment') IS NOT NULL)::text
);

-- TEST 43: trigger updates c1_rent_ledger.amount_paid + status
SELECT _assert_equals(43, 'Trigger updates ledger amount_paid to 500',
  '500.00',
  (SELECT amount_paid::text FROM c1_rent_ledger WHERE id = _test_uuid(842))
);

-- TEST 44: two partial payments accumulate correctly (500 + 300 = 800)
SELECT record_rent_payment(_test_uuid(842), _test_uuid(999), 300, 'cash', 'Second payment');

SELECT _assert_equals(44, 'Two payments accumulate (500+300=800)',
  '800.00',
  (SELECT amount_paid::text FROM c1_rent_ledger WHERE id = _test_uuid(842))
);

-- TEST 45: payment completing full amount → status = 'paid'
SELECT record_rent_payment(_test_uuid(842), _test_uuid(999), 200, 'bank_transfer', 'Final payment');

SELECT _assert_equals(45, 'Full payment sets status to paid',
  'paid',
  (SELECT status FROM c1_rent_ledger WHERE id = _test_uuid(842))
);

-- TEST 46: create_rent_arrears_ticket → creates ticket with correct fields
-- Use a fresh tenant to avoid dedup with test 39's ticket
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(983), 'Fresh Tenant', _test_uuid(999));

DO $$
DECLARE
  v_tid uuid;
  v_ticket record;
BEGIN
  v_tid := create_rent_arrears_ticket(
    _test_uuid(999), _test_uuid(990), _test_uuid(983),
    'Rent arrears: Fresh Tenant', '1 month overdue, £1000 total'
  );

  SELECT * INTO v_ticket FROM c1_tickets WHERE id = v_tid;

  INSERT INTO _test_results (test_num, test_name, expected, actual, passed)
  VALUES (46, 'create_rent_arrears_ticket creates correct ticket',
    'rent_arrears / high / open',
    v_ticket.category || ' / ' || v_ticket.priority || ' / ' || v_ticket.status,
    v_ticket.category = 'rent_arrears' AND v_ticket.priority = 'high' AND v_ticket.status = 'open'
  );
END;
$$;

-- TEST 47: create_rent_arrears_ticket called twice → dedup (returns existing)
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(984), 'Dedup Tenant', _test_uuid(999));

DO $$
DECLARE
  v_tid1 uuid;
  v_tid2 uuid;
BEGIN
  v_tid1 := create_rent_arrears_ticket(
    _test_uuid(999), _test_uuid(990), _test_uuid(984),
    'Rent arrears: Dedup Tenant', 'First call'
  );
  v_tid2 := create_rent_arrears_ticket(
    _test_uuid(999), _test_uuid(990), _test_uuid(984),
    'Rent arrears: Dedup Tenant', 'Second call — should dedup'
  );

  INSERT INTO _test_results (test_num, test_name, expected, actual, passed)
  VALUES (47, 'create_rent_arrears_ticket dedup (same tenant)',
    v_tid1::text,
    v_tid2::text,
    v_tid1 = v_tid2
  );
END;
$$;

-- ############################################################################
-- PHASE C: Integration tests (48-58) — routing, precedence, status guards
-- ############################################################################
-- These test the ROUTER (c1_compute_next_action) end-to-end, not sub-routines.

-- ============================================================================
-- Dispatch routing tests (48-51)
-- ============================================================================

-- TEST 48: category='compliance_renewal' + fresh → compliance_pending
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(48), 'open', now(), _test_uuid(999), 'compliance_renewal');

SELECT _assert_next_action(48, 'Router: compliance_renewal → compliance_pending', _test_uuid(48), 'needs_attention', 'compliance_pending');

-- TEST 49: category='rent_arrears' + overdue tenant → rent_overdue
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(985), 'Overdue Router Tenant', _test_uuid(999));

INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id)
VALUES (_test_uuid(49), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(985));

INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status)
VALUES (_test_uuid(849), _test_uuid(999), _test_uuid(970), _test_uuid(985), CURRENT_DATE - INTERVAL '60 days', 1000, 'overdue');

SELECT _assert_next_action(49, 'Router: rent_arrears → rent_overdue', _test_uuid(49), 'needs_attention', 'rent_overdue');

-- TEST 50: category='Plumbing' + awaiting_manager → manager_approval (maintenance path)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(50), 'open', now(), _test_uuid(999), 'Plumbing');

INSERT INTO c1_messages (ticket_id, stage)
VALUES (_test_uuid(50), 'awaiting_manager');

SELECT _assert_next_action(50, 'Router: Plumbing + awaiting_manager → maintenance', _test_uuid(50), 'needs_attention', 'manager_approval');

-- TEST 51: category='Plumbing' + landlord_allocated → landlord handler
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, landlord_allocated)
VALUES (_test_uuid(51), 'open', now(), _test_uuid(999), 'Plumbing', true);

SELECT _assert_next_action(51, 'Router: Plumbing + landlord_allocated → landlord', _test_uuid(51), 'in_progress', 'allocated_to_landlord');

-- ============================================================================
-- Category vs lifecycle flag precedence (52)
-- ============================================================================

-- TEST 52: compliance_renewal + landlord_allocated → compliance handler (NOT landlord)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, landlord_allocated)
VALUES (_test_uuid(52), 'open', now(), _test_uuid(999), 'compliance_renewal', true);

SELECT _assert_next_action(52, 'Precedence: compliance > landlord_allocated', _test_uuid(52), 'needs_attention', 'compliance_pending');

-- ============================================================================
-- Universal state precedence (53-57)
-- ============================================================================

-- TEST 53: rent_arrears + on_hold → on_hold (universal wins)
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_test_uuid(986), 'Hold Tenant', _test_uuid(999));

INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id, on_hold)
VALUES (_test_uuid(53), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(986), true);

SELECT _assert_next_action(53, 'Universal: rent_arrears + on_hold → on_hold', _test_uuid(53), 'on_hold', 'on_hold');

-- TEST 54: rent_arrears + archived → archived (universal wins)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id, archived)
VALUES (_test_uuid(54), 'open', now(), _test_uuid(999), 'rent_arrears', _test_uuid(986), true);

SELECT _assert_next_action(54, 'Universal: rent_arrears + archived → archived', _test_uuid(54), 'archived', 'archived');

-- TEST 55: compliance_renewal + closed → completed (universal wins)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category)
VALUES (_test_uuid(55), 'closed', now(), _test_uuid(999), 'compliance_renewal');

SELECT _assert_next_action(55, 'Universal: compliance + closed → completed', _test_uuid(55), 'completed', 'completed');

-- TEST 56: landlord_allocated + on_hold → on_hold (universal wins)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated, on_hold)
VALUES (_test_uuid(56), 'open', now(), _test_uuid(999), true, true);

SELECT _assert_next_action(56, 'Universal: landlord + on_hold → on_hold', _test_uuid(56), 'on_hold', 'on_hold');

-- TEST 57: ooh_dispatched + archived → archived (universal wins)
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, ooh_dispatched, archived)
VALUES (_test_uuid(57), 'open', now(), _test_uuid(999), true, true);

SELECT _assert_next_action(57, 'Universal: ooh + archived → archived', _test_uuid(57), 'archived', 'archived');

-- ============================================================================
-- Status guard (58)
-- ============================================================================

-- TEST 58: landlord_allocated + status='weird' → falls through to maintenance
INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, landlord_allocated)
VALUES (_test_uuid(58), 'weird', now(), _test_uuid(999), true);

SELECT _assert_next_action(58, 'Status guard: landlord + weird status → maintenance', _test_uuid(58), 'new', 'new');

-- ============================================================================
-- Results
-- ============================================================================

SELECT
  CASE WHEN passed THEN 'PASS' ELSE '** FAIL **' END AS result,
  'TEST ' || test_num || ': ' || test_name AS test,
  CASE WHEN NOT passed THEN 'expected: ' || expected || '  got: ' || actual ELSE '' END AS detail
FROM _test_results
ORDER BY test_num;

-- Summary
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE passed) AS passed,
  count(*) FILTER (WHERE NOT passed) AS failed
FROM _test_results;

-- ── Cleanup ─────────────────────────────────────────────────────────────────

-- Re-enable triggers before rollback
ALTER TABLE c1_tickets ENABLE TRIGGER trg_tickets_recompute_next_action;
ALTER TABLE c1_messages ENABLE TRIGGER trg_messages_recompute_next_action;
ALTER TABLE c1_job_completions ENABLE TRIGGER trg_job_completions_recompute_next_action;
ALTER TABLE c1_rent_ledger ENABLE TRIGGER set_updated_at;

-- Drop test helpers
DROP FUNCTION IF EXISTS _assert_next_action(INT, TEXT, uuid, TEXT, TEXT);
DROP FUNCTION IF EXISTS _assert_subroutine(INT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS _assert_equals(INT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS _test_uuid(INT);

ROLLBACK;
