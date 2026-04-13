-- ═══════════════════════════════════════════════════════════════════════════
-- YAR-226: Priority System Hardening
--
-- 1. Register daily rent escalation cron (function exists, cron was missing)
-- 2. Create maintenance escalation function + cron (>7d=High, >14d=Urgent)
-- 3. Reset SLA when any escalation changes priority
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Rent escalation cron ──────────────────────────────────────────────
-- Function escalate_rent_ticket_priority() already exists (20260418200000).
-- It was called from the edge function but needs its own daily cron for
-- tickets that don't get reminders (e.g., former tenants with debt).

SELECT cron.schedule(
  'rent-escalation-daily',
  '50 7 * * *',
  $$ SELECT escalate_rent_ticket_priority() $$
);


-- ─── 2. Maintenance escalation function + cron ────────────────────────────
-- Maintenance tickets never escalated after creation. A Medium ticket stuck
-- for 2 weeks stays Medium. This function bumps priority based on ticket age.
--
-- Tiers (from date_logged, not waiting_since):
--   >14 days open → Urgent
--   >7 days open  → High
--   Otherwise      → no change (preserve creation-time priority)

CREATE OR REPLACE FUNCTION public.escalate_maintenance_tickets()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_updated integer := 0;
  v_ticket record;
  v_new_priority text;
  v_property_label text;
BEGIN
  FOR v_ticket IN
    SELECT t.id, t.priority, t.date_logged, t.property_id,
           CURRENT_DATE - t.date_logged::date AS days_open
    FROM c1_tickets t
    WHERE t.category = 'maintenance'
      AND t.status = 'open'
      AND (t.archived IS NULL OR t.archived = false)
      AND COALESCE(t.on_hold, false) = false
      AND t.date_logged IS NOT NULL
  LOOP
    -- Compute new priority from age
    v_new_priority := CASE
      WHEN v_ticket.days_open >= 14 THEN 'Urgent'
      WHEN v_ticket.days_open >= 7  THEN 'High'
      ELSE NULL  -- no escalation needed
    END;

    -- Skip if no escalation needed or priority already at/above target
    IF v_new_priority IS NULL THEN CONTINUE; END IF;
    IF v_ticket.priority = 'Emergency' THEN CONTINUE; END IF;
    IF v_ticket.priority = 'Urgent' AND v_new_priority != 'Urgent' THEN CONTINUE; END IF;
    IF v_ticket.priority = v_new_priority THEN CONTINUE; END IF;

    -- Don't downgrade: only escalate upward
    IF v_ticket.priority = 'Urgent' THEN CONTINUE; END IF;
    IF v_ticket.priority = 'High' AND v_new_priority = 'High' THEN CONTINUE; END IF;

    -- Update priority
    UPDATE c1_tickets
    SET priority = v_new_priority
    WHERE id = v_ticket.id;

    v_updated := v_updated + 1;

    -- Log escalation audit event
    SELECT address INTO v_property_label
    FROM c1_properties WHERE id = v_ticket.property_id;

    PERFORM c1_log_event(
      v_ticket.id, 'PRIORITY_ESCALATED', 'system', NULL,
      v_property_label,
      jsonb_build_object(
        'from_priority', v_ticket.priority,
        'to_priority', v_new_priority,
        'reason', format('maintenance ticket open %s days', v_ticket.days_open),
        'days_open', v_ticket.days_open
      )
    );
  END LOOP;

  IF v_updated > 0 THEN
    RAISE NOTICE 'Escalated % maintenance ticket(s)', v_updated;
  END IF;
END;
$$;

-- Schedule daily at 07:45 UTC (before compliance at 07:55 and rent at 07:50)
SELECT cron.schedule(
  'maintenance-escalation-daily',
  '45 7 * * *',
  $$ SELECT escalate_maintenance_tickets() $$
);


-- ─── 3. SLA reset on priority change ─────────────────────────────────────
-- When escalation functions change priority, sla_due_at should reflect the
-- new urgency. Currently it stays stale until the next state change.
--
-- Solution: a lightweight trigger on c1_tickets that recalculates sla_due_at
-- when priority changes AND the ticket is in needs_action state.

CREATE OR REPLACE FUNCTION public.trg_priority_sla_reset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Only fire when priority actually changed
  IF OLD.priority IS NOT DISTINCT FROM NEW.priority THEN
    RETURN NEW;
  END IF;

  -- Only reset SLA for tickets in needs_action (those have active SLAs)
  IF NEW.next_action != 'needs_action' THEN
    RETURN NEW;
  END IF;

  -- Recalculate sla_due_at based on new priority
  -- Use same logic as trg_tickets_recompute_next_action
  NEW.sla_due_at := CASE
    WHEN NEW.priority IN ('Emergency', 'emergency')
      THEN now() + interval '24 hours'
    WHEN NEW.next_action_reason IN ('handoff_review', 'pending_review', 'no_contractors')
      THEN now() + interval '4 hours'
    WHEN NEW.next_action_reason = 'manager_approval'
      THEN now() + interval '24 hours'
    WHEN NEW.next_action_reason = 'job_not_completed'
      THEN now() + interval '24 hours'
    WHEN NEW.priority IN ('Urgent', 'urgent')
      THEN now() + interval '48 hours'
    WHEN NEW.priority IN ('High', 'high')
      THEN now() + interval '48 hours'
    WHEN NEW.priority IN ('Medium', 'medium')
      THEN now() + interval '72 hours'
    ELSE now() + interval '7 days'
  END;

  RETURN NEW;
END;
$$;

-- Use BEFORE UPDATE so we can modify NEW directly (no extra UPDATE needed)
DROP TRIGGER IF EXISTS trg_priority_sla_reset ON c1_tickets;
CREATE TRIGGER trg_priority_sla_reset
  BEFORE UPDATE OF priority ON c1_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_priority_sla_reset();


-- ─── 4. Add audit logging to compliance escalation ────────────────────────
-- Currently c1_compliance_escalate updates priority but doesn't log it.
-- Rewrite to include PRIORITY_ESCALATED events.

CREATE OR REPLACE FUNCTION c1_compliance_escalate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_new_priority text;
  v_property_label text;
BEGIN
  FOR v_ticket IN
    SELECT t.id, t.priority, t.property_id, cc.expiry_date,
           CURRENT_DATE - cc.expiry_date::date AS days_past_expiry
    FROM c1_tickets t
    JOIN c1_compliance_certificates cc ON cc.id = t.compliance_certificate_id
    WHERE t.category = 'compliance_renewal'
      AND t.status = 'open'
      AND (t.archived IS NULL OR t.archived = false)
      AND cc.expiry_date IS NOT NULL
  LOOP
    v_new_priority := CASE
      WHEN v_ticket.expiry_date < CURRENT_DATE THEN 'Urgent'
      WHEN v_ticket.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'High'
      WHEN v_ticket.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'Medium'
      ELSE 'Normal'
    END;

    IF v_ticket.priority IS DISTINCT FROM v_new_priority THEN
      UPDATE c1_tickets SET priority = v_new_priority WHERE id = v_ticket.id;

      SELECT address INTO v_property_label
      FROM c1_properties WHERE id = v_ticket.property_id;

      PERFORM c1_log_event(
        v_ticket.id, 'PRIORITY_ESCALATED', 'system', NULL,
        v_property_label,
        jsonb_build_object(
          'from_priority', v_ticket.priority,
          'to_priority', v_new_priority,
          'reason', format('compliance cert expires %s', v_ticket.expiry_date),
          'expiry_date', v_ticket.expiry_date
        )
      );
    END IF;
  END LOOP;

  -- Sync cert status: mark expired certs that still say 'valid'
  UPDATE c1_compliance_certificates
  SET status = 'expired', updated_at = now()
  WHERE expiry_date IS NOT NULL
    AND expiry_date < CURRENT_DATE
    AND status = 'valid';
END;
$$;


-- ─── 5. Add audit logging to rent escalation ──────────────────────────────
-- Rewrite escalate_rent_ticket_priority to log PRIORITY_ESCALATED events.

CREATE OR REPLACE FUNCTION public.escalate_rent_ticket_priority()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_new_priority text;
  v_property_label text;
BEGIN
  FOR v_ticket IN
    SELECT t.id, t.priority, t.property_id, t.deadline_date,
           CURRENT_DATE - t.deadline_date AS days_overdue
    FROM c1_tickets t
    WHERE t.category = 'rent_arrears'
      AND t.status = 'open'
      AND t.deadline_date IS NOT NULL
  LOOP
    v_new_priority := CASE
      WHEN v_ticket.days_overdue >= 14 THEN 'urgent'
      WHEN v_ticket.days_overdue >= 7  THEN 'high'
      WHEN v_ticket.days_overdue >= 1  THEN 'medium'
      ELSE 'low'
    END;

    IF v_ticket.priority IS DISTINCT FROM v_new_priority THEN
      UPDATE c1_tickets SET priority = v_new_priority WHERE id = v_ticket.id;

      SELECT address INTO v_property_label
      FROM c1_properties WHERE id = v_ticket.property_id;

      PERFORM c1_log_event(
        v_ticket.id, 'PRIORITY_ESCALATED', 'system', NULL,
        v_property_label,
        jsonb_build_object(
          'from_priority', v_ticket.priority,
          'to_priority', v_new_priority,
          'reason', format('rent %s days overdue', v_ticket.days_overdue),
          'days_overdue', v_ticket.days_overdue
        )
      );
    END IF;
  END LOOP;
END;
$$;


-- ─── 6. One-time backfill: run all escalations now ────────────────────────

SELECT escalate_maintenance_tickets();
SELECT escalate_rent_ticket_priority();
SELECT c1_compliance_escalate();
