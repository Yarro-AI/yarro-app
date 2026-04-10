-- Sprint C, Step 5: Dashboard RPC rewrite
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Must DROP first: return type changed from TABLE to jsonb.
--

DROP FUNCTION IF EXISTS public.c1_get_dashboard_todo(uuid);

--
-- Replaces the existing c1_get_dashboard_todo with a clean CTE-based version.
-- Eliminated: action_type, action_label, action_context, priority_bucket, source_type
-- Added: bucket (with stuck/reschedule overrides), priority_score, timing fields
--
-- Timeout thresholds are hardcoded with comments for future extraction:
--   contractor_timeout_hours = 48
--   booking_timeout_days = 3
--   landlord_allocation_timeout_hours = 72
--   ooh_timeout_hours = 48
--   tenant_timeout_hours = 48
--   landlord_timeout_hours = configurable (c1_property_managers column)

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo(p_pm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- CTE 1: Filter to open, non-archived, non-held tickets for this PM
  pm_tickets AS (
    SELECT t.*
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) = 'open'
      AND t.archived = false
      AND COALESCE(t.on_hold, false) = false
  ),

  -- CTE 2: Contractor timing (reads column directly, no JSONB parse)
  contractor_timing AS (
    SELECT t.id AS ticket_id,
           t.contractor_sent_at
    FROM pm_tickets t
  ),

  -- CTE 3: Timeout check — compute is_past_timeout ONCE per ticket
  timeout_check AS (
    SELECT t.id AS ticket_id,
      CASE
        -- IMPORTANT: needs_action reasons NEVER timeout
        WHEN t.next_action != 'waiting' THEN false
        -- Per-reason timeout thresholds
        WHEN t.next_action_reason = 'awaiting_contractor'
          AND ct.contractor_sent_at IS NOT NULL
          AND now() - ct.contractor_sent_at > interval '48 hours'  -- contractor_timeout_hours
          THEN true
        WHEN t.next_action_reason = 'awaiting_booking'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '3 days'  -- booking_timeout_days
          THEN true
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND now() - COALESCE(t.waiting_since, t.date_logged) >
            make_interval(hours => COALESCE(
              (SELECT landlord_timeout_hours FROM c1_property_managers WHERE id = p_pm_id),
              48))  -- configurable, default 48h
          THEN true
        WHEN t.next_action_reason = 'allocated_to_landlord'
          AND t.landlord_allocated_at IS NOT NULL
          AND now() - t.landlord_allocated_at > interval '72 hours'  -- landlord_allocation_timeout_hours
          THEN true
        WHEN t.next_action_reason = 'ooh_dispatched'
          AND t.ooh_dispatched_at IS NOT NULL
          AND now() - t.ooh_dispatched_at > interval '48 hours'  -- ooh_timeout_hours
          THEN true
        WHEN t.next_action_reason = 'awaiting_tenant'
          AND t.tenant_contacted_at IS NOT NULL
          AND now() - t.tenant_contacted_at > interval '48 hours'  -- tenant_timeout_hours
          THEN true
        -- Scheduled + past date = overdue
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date < CURRENT_DATE
          THEN true
        -- Reschedule pending timeout
        WHEN t.next_action_reason = 'reschedule_pending'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '48 hours'
          THEN true
        ELSE false
      END AS is_past_timeout
    FROM pm_tickets t
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  ),

  -- CTE 4: Scored + display bucket
  scored AS (
    SELECT
      t.id,
      t.id AS ticket_id,
      t.property_id,
      t.category,
      t.maintenance_trade,
      t.issue_title AS issue_summary,
      -- Display bucket with overrides (order matters — first match wins)
      CASE
        -- 1. Reschedule urgency: PM must call, job is imminent
        WHEN t.next_action_reason = 'reschedule_pending'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date - now() <= interval '24 hours'
          THEN 'needs_action'
        -- 2. Stuck override: waiting + timed out
        WHEN tc.is_past_timeout AND t.next_action = 'waiting'
          THEN 'stuck'
        -- 3. Normal bucket from ticket row
        ELSE t.next_action
      END AS bucket,
      t.next_action,
      t.next_action_reason,
      t.priority,
      public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since) AS priority_score,
      tc.is_past_timeout,
      t.sla_due_at,
      t.deadline_date,
      -- Timing fields for frontend REASON_DISPLAY
      t.waiting_since,
      t.contractor_sent_at,
      t.scheduled_date,
      t.landlord_allocated_at,
      t.ooh_dispatched_at,
      t.tenant_contacted_at,
      -- Compliance-specific
      t.compliance_certificate_id,
      -- Property info
      p.address AS property_label,
      t.date_logged AS created_at,
      -- Reschedule info
      t.reschedule_initiated_by
    FROM pm_tickets t
    LEFT JOIN timeout_check tc ON tc.ticket_id = t.id
    LEFT JOIN c1_properties p ON p.id = t.property_id
  )

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'ticket_id', s.ticket_id,
      'property_id', s.property_id,
      'category', s.category,
      'maintenance_trade', s.maintenance_trade,
      'issue_summary', s.issue_summary,
      'bucket', s.bucket,
      'next_action', s.next_action,
      'next_action_reason', s.next_action_reason,
      'priority', s.priority,
      'priority_score', s.priority_score,
      'is_past_timeout', s.is_past_timeout,
      'sla_due_at', s.sla_due_at,
      'deadline_date', s.deadline_date,
      'waiting_since', s.waiting_since,
      'contractor_sent_at', s.contractor_sent_at,
      'scheduled_date', s.scheduled_date,
      'landlord_allocated_at', s.landlord_allocated_at,
      'ooh_dispatched_at', s.ooh_dispatched_at,
      'tenant_contacted_at', s.tenant_contacted_at,
      'compliance_certificate_id', s.compliance_certificate_id,
      'property_label', s.property_label,
      'created_at', s.created_at,
      'reschedule_initiated_by', s.reschedule_initiated_by
    )
    ORDER BY s.priority_score DESC, s.waiting_since ASC
  ) INTO v_result
  FROM scored s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
