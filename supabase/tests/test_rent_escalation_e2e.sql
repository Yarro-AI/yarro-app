-- ============================================================================
-- End-to-end rent escalation integration test
--
-- Simulates the yarro-rent-reminder edge function's escalation pass
-- by calling the same RPCs in the same order.
--
-- Run: docker exec -i supabase_db_yarro-pm psql -U postgres < supabase/tests/test_rent_escalation_e2e.sql
--
-- All data created inside a transaction and rolled back.
-- ============================================================================

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE TEMP TABLE _test_results (
  test_num   INT,
  test_name  TEXT,
  expected   TEXT,
  actual     TEXT,
  passed     BOOLEAN
);

CREATE OR REPLACE FUNCTION _e2e_uuid(n INT) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$
  SELECT ('eeeeeeee-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid;
$$;

CREATE OR REPLACE FUNCTION _e2e_assert(
  p_num INT, p_name TEXT, p_expected TEXT, p_actual TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO _test_results VALUES (p_num, p_name, p_expected, p_actual, p_expected = p_actual);
END;
$$;

-- ── Disable triggers to control test flow ───────────────────────────────────

ALTER TABLE c1_tickets DISABLE TRIGGER trg_tickets_recompute_next_action;
ALTER TABLE c1_rent_ledger DISABLE TRIGGER set_updated_at;

-- ── Seed data ───────────────────────────────────────────────────────────────

INSERT INTO c1_property_managers (id, business_name, name, email, dispatch_mode, ooh_routine_action, ticket_mode, min_booking_lead_hours, ooh_enabled)
VALUES (_e2e_uuid(1), 'E2E PM', 'E2E', 'e2e@test.com', 'auto', 'log', 'auto', 2, false);

INSERT INTO c1_properties (id, address, property_manager_id)
VALUES (_e2e_uuid(2), '42 E2E Street', _e2e_uuid(1));

INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_e2e_uuid(3), 'Jane Arrears', _e2e_uuid(1));

INSERT INTO c1_rooms (id, room_number, property_id, property_manager_id, rent_frequency)
VALUES (_e2e_uuid(4), 'R1', _e2e_uuid(2), _e2e_uuid(1), 'monthly');

-- Overdue ledger: month 1, reminder_3 sent 10 days ago
INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status, reminder_3_sent_at)
VALUES (_e2e_uuid(10), _e2e_uuid(1), _e2e_uuid(4), _e2e_uuid(3),
        CURRENT_DATE - INTERVAL '40 days', 800, 'overdue',
        now() - INTERVAL '10 days');

-- ============================================================================
-- STEP 1: rent_escalation_check returns tenant
-- ============================================================================
SELECT _e2e_assert(1, 'Escalation check finds overdue tenant',
  '1',
  (SELECT count(*)::text FROM rent_escalation_check(_e2e_uuid(1)) WHERE tenant_id = _e2e_uuid(3))
);

-- ============================================================================
-- STEP 2: create_rent_arrears_ticket creates ticket
-- ============================================================================
DO $$
DECLARE
  v_tid uuid;
  v_ticket record;
BEGIN
  SELECT ticket_id INTO v_tid FROM create_rent_arrears_ticket(
    _e2e_uuid(1), _e2e_uuid(2), _e2e_uuid(3),
    'Rent arrears: Jane Arrears',
    '1 month overdue, £800 total arrears since ' || (CURRENT_DATE - INTERVAL '40 days')::date
  );

  SELECT * INTO v_ticket FROM c1_tickets WHERE id = v_tid;

  PERFORM _e2e_assert(2, 'Ticket created with correct category/status',
    'rent_arrears / open / high',
    v_ticket.category || ' / ' || v_ticket.status || ' / ' || v_ticket.priority
  );
END;
$$;

-- ============================================================================
-- STEP 3: Router returns rent_overdue for this ticket
-- ============================================================================
DO $$
DECLARE
  v_tid uuid;
  v_result record;
BEGIN
  SELECT id INTO v_tid FROM c1_tickets
  WHERE tenant_id = _e2e_uuid(3) AND category = 'rent_arrears' AND status = 'open';

  SELECT * INTO v_result FROM c1_compute_next_action(v_tid);

  PERFORM _e2e_assert(3, 'Router: rent_arrears ticket → rent_overdue',
    'needs_attention / rent_overdue',
    v_result.next_action || ' / ' || v_result.next_action_reason
  );
END;
$$;

-- ============================================================================
-- STEP 4: Second overdue month for same tenant
-- ============================================================================
INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status, reminder_3_sent_at)
VALUES (_e2e_uuid(11), _e2e_uuid(1), _e2e_uuid(4), _e2e_uuid(3),
        CURRENT_DATE - INTERVAL '10 days', 800, 'overdue',
        now() - INTERVAL '8 days');

-- ============================================================================
-- STEP 5: create_rent_arrears_ticket dedup — same ticket, description updated
-- ============================================================================
DO $$
DECLARE
  v_existing_tid uuid;
  v_returned_tid uuid;
  v_desc text;
BEGIN
  SELECT id INTO v_existing_tid FROM c1_tickets
  WHERE tenant_id = _e2e_uuid(3) AND category = 'rent_arrears' AND status = 'open';

  SELECT ticket_id INTO v_returned_tid FROM create_rent_arrears_ticket(
    _e2e_uuid(1), _e2e_uuid(2), _e2e_uuid(3),
    'Rent arrears: Jane Arrears',
    '2 months overdue, £1600 total arrears'
  );

  SELECT issue_description INTO v_desc FROM c1_tickets WHERE id = v_returned_tid;

  PERFORM _e2e_assert(5, 'Dedup: same ticket ID returned',
    v_existing_tid::text, v_returned_tid::text);

  PERFORM _e2e_assert(6, 'Dedup: description updated to latest arrears',
    '2 months overdue, £1600 total arrears', v_desc);
END;
$$;

-- ============================================================================
-- STEP 6: Pay all arrears → ticket auto-closed
-- ============================================================================
-- Pay month 1
SELECT record_rent_payment(_e2e_uuid(10), _e2e_uuid(1), 800, 'bank_transfer', 'Month 1 cleared');
-- Pay month 2
SELECT record_rent_payment(_e2e_uuid(11), _e2e_uuid(1), 800, 'bank_transfer', 'Month 2 cleared');

SELECT _e2e_assert(7, 'Both ledger entries now paid',
  'paid / paid',
  (SELECT string_agg(status, ' / ' ORDER BY due_date)
   FROM c1_rent_ledger WHERE tenant_id = _e2e_uuid(3))
);

SELECT _e2e_assert(8, 'Ticket auto-closed after full payment',
  'closed',
  (SELECT status FROM c1_tickets
   WHERE tenant_id = _e2e_uuid(3) AND category = 'rent_arrears'
   ORDER BY date_logged DESC LIMIT 1)
);

-- ============================================================================
-- STEP 7: Escalation check no longer returns cleared tenant
-- ============================================================================
SELECT _e2e_assert(9, 'Cleared tenant not in escalation check',
  '0',
  (SELECT count(*)::text FROM rent_escalation_check(_e2e_uuid(1)) WHERE tenant_id = _e2e_uuid(3))
);

-- ============================================================================
-- STEP 8: Dashboard excludes tenant with open ticket (create new scenario)
-- ============================================================================
-- New tenant with overdue rent this month + open ticket
INSERT INTO c1_tenants (id, full_name, property_manager_id)
VALUES (_e2e_uuid(5), 'Dashboard Tenant', _e2e_uuid(1));

INSERT INTO c1_rent_ledger (id, property_manager_id, room_id, tenant_id, due_date, amount_due, status)
VALUES (_e2e_uuid(12), _e2e_uuid(1), _e2e_uuid(4), _e2e_uuid(5),
        date_trunc('month', CURRENT_DATE)::date + 1, 750, 'overdue');

INSERT INTO c1_tickets (id, status, date_logged, property_manager_id, category, tenant_id, priority)
VALUES (_e2e_uuid(20), 'open', now(), _e2e_uuid(1), 'rent_arrears', _e2e_uuid(5), 'high');

SELECT _e2e_assert(10, 'Dashboard excludes rent with open arrears ticket',
  '0',
  (SELECT count(*)::text FROM c1_get_dashboard_todo_extras(_e2e_uuid(1)) AS item
   WHERE (item->>'source_type') = 'rent'
     AND (item->>'entity_id') = _e2e_uuid(12)::text)
);

-- ============================================================================
-- Results
-- ============================================================================

SELECT
  CASE WHEN passed THEN 'PASS' ELSE '** FAIL **' END AS result,
  'STEP ' || test_num || ': ' || test_name AS test,
  CASE WHEN NOT passed THEN 'expected: ' || expected || '  got: ' || actual ELSE '' END AS detail
FROM _test_results
ORDER BY test_num;

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE passed) AS passed,
  count(*) FILTER (WHERE NOT passed) AS failed
FROM _test_results;

-- ── Cleanup ─────────────────────────────────────────────────────────────────

ALTER TABLE c1_tickets ENABLE TRIGGER trg_tickets_recompute_next_action;
ALTER TABLE c1_rent_ledger ENABLE TRIGGER set_updated_at;

DROP FUNCTION IF EXISTS _e2e_assert(INT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS _e2e_uuid(INT);

ROLLBACK;
