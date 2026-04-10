-- Fix: make_interval(hours => numeric) doesn't exist.
-- Use interval arithmetic instead — works with numeric, preserves fractional hours.

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo(p_pm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  pm_tickets AS (
    SELECT t.*
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) = 'open'
      AND t.archived = false
      AND COALESCE(t.on_hold, false) = false
  ),
  contractor_timing AS (
    SELECT t.id AS ticket_id,
           t.contractor_sent_at
    FROM pm_tickets t
  ),
  timeout_check AS (
    SELECT t.id AS ticket_id,
      CASE
        WHEN t.next_action != 'waiting' THEN false
        WHEN t.next_action_reason = 'awaiting_contractor'
          AND ct.contractor_sent_at IS NOT NULL
          AND now() - ct.contractor_sent_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_booking'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '3 days'
          THEN true
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND now() - COALESCE(t.waiting_since, t.date_logged) >
            interval '1 hour' * COALESCE(
              (SELECT landlord_timeout_hours FROM c1_property_managers WHERE id = p_pm_id),
              48)
          THEN true
        WHEN t.next_action_reason = 'allocated_to_landlord'
          AND t.landlord_allocated_at IS NOT NULL
          AND now() - t.landlord_allocated_at > interval '72 hours'
          THEN true
        WHEN t.next_action_reason = 'ooh_dispatched'
          AND t.ooh_dispatched_at IS NOT NULL
          AND now() - t.ooh_dispatched_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_tenant'
          AND t.tenant_contacted_at IS NOT NULL
          AND now() - t.tenant_contacted_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date < CURRENT_DATE
          THEN true
        WHEN t.next_action_reason = 'reschedule_pending'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '48 hours'
          THEN true
        ELSE false
      END AS is_past_timeout
    FROM pm_tickets t
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  ),
  scored AS (
    SELECT
      t.id,
      t.id AS ticket_id,
      t.property_id,
      t.category,
      t.maintenance_trade,
      t.issue_title AS issue_summary,
      CASE
        WHEN t.next_action_reason = 'reschedule_pending'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date - now() <= interval '24 hours'
          THEN 'needs_action'
        WHEN tc.is_past_timeout AND t.next_action = 'waiting'
          THEN 'stuck'
        ELSE t.next_action
      END AS bucket,
      t.next_action,
      t.next_action_reason,
      t.priority,
      public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since) AS priority_score,
      tc.is_past_timeout,
      t.sla_due_at,
      t.deadline_date,
      t.waiting_since,
      t.contractor_sent_at,
      t.scheduled_date,
      t.landlord_allocated_at,
      t.ooh_dispatched_at,
      t.tenant_contacted_at,
      t.compliance_certificate_id,
      p.address AS property_label,
      t.date_logged AS created_at,
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
