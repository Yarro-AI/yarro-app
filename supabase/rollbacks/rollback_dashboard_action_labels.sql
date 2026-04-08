-- ============================================================
-- PROTECTED RPC CHANGE: c1_get_dashboard_todo — escalation awareness
-- ============================================================
-- Safe Modification Protocol:
--   Backup: supabase/rollbacks/rollback_dashboard_escalation.sql
--   Approved by: Adam (dashboard state machine hardening)
--
-- Changes:
--   1. Add earliest_sent_at to contractor_timing CTE
--   2. Join c1_property_managers for PM-configurable timeouts
--   3. Landlord/booking stale → STALE_AWAITING (contractor handled by cycling system)
--   4. Overdue scheduled jobs → SCHEDULED_OVERDUE
--   5. no_contractors → "No reply" label (not "Assign contractor")
--   6. Priority bucket escalates stale to HIGH (never URGENT)
--   7. Output adds is_past_timeout boolean key
--
-- Contractor cycling (6h default) is a separate concern from dashboard escalation.
-- Contractor tickets surface via no_contractors (all cycled) or CONTRACTOR_UNRESPONSIVE (48h badge).
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo(p_pm_id uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH pm_tickets AS (
    SELECT t.id
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) != 'closed'
      AND COALESCE(t.archived, false) = false
      AND COALESCE(t.on_hold, false) = false
  ),
  contractor_timing AS (
    SELECT
      m.ticket_id,
      bool_or(
        (c->>'status') = 'sent'
        AND (c->>'sent_at') IS NOT NULL
        AND (c->>'sent_at')::timestamptz < now() - interval '48 hours'
      ) AS has_unresponsive,
      MIN(CASE WHEN (c->>'status') = 'sent' AND (c->>'sent_at') IS NOT NULL
          THEN (c->>'sent_at')::timestamptz END) AS earliest_sent_at
    FROM c1_messages m
    JOIN pm_tickets pt ON pt.id = m.ticket_id
    CROSS JOIN jsonb_array_elements(COALESCE(m.contractors, '[]'::jsonb)) AS c
    WHERE m.stage = 'waiting_contractor'
    GROUP BY m.ticket_id
  ),
  scored AS (
    SELECT
      t.id,
      t.property_manager_id,
      t.category,
      t.property_id,
      t.compliance_certificate_id,
      p.address AS property_label,
      COALESCE(t.issue_title, LEFT(t.issue_description, 100)) AS issue_summary,
      t.next_action_reason,
      t.priority,
      t.sla_due_at,
      t.date_logged,
      t.scheduled_date,
      COALESCE(m.updated_at, t.date_logged) AS waiting_since,
      COALESCE(ct.has_unresponsive, false) AS has_unresponsive,
      ct.earliest_sent_at,
      pm.landlord_timeout_hours,

      CASE
        -- Stale: landlord/booking past PM-configured timeout → return to Needs Action
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'STALE_AWAITING'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'STALE_AWAITING'
        -- Scheduled overdue: date has passed
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'SCHEDULED_OVERDUE'
        -- Existing rules
        WHEN t.next_action_reason IN ('handoff_review','landlord_declined','job_not_completed','pending_review','ooh_dispatched','ooh_resolved','ooh_unresolved','landlord_needs_help','landlord_resolved') THEN 'NEEDS_ATTENTION'
        WHEN t.next_action_reason = 'no_contractors' THEN 'NEEDS_ATTENTION'
        WHEN t.next_action_reason IN ('manager_approval','awaiting_landlord') THEN 'AWAITING_APPROVAL'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 'CONTRACTOR_UNRESPONSIVE'
        ELSE 'FOLLOW_UP'
      END AS action_type,

      CASE
        -- Stale labels
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'No reply'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'Job not booked'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'Chase completion'
        -- Contractor labels (cycling system handles escalation)
        WHEN t.next_action_reason = 'no_contractors' THEN 'No reply'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 'No reply'
        -- Existing labels
        WHEN t.next_action_reason = 'ooh_dispatched' THEN 'OOH dispatched'
        WHEN t.next_action_reason = 'ooh_resolved' THEN 'OOH resolved'
        WHEN t.next_action_reason = 'ooh_unresolved' THEN 'OOH unresolved'
        WHEN t.next_action_reason = 'ooh_in_progress' THEN 'OOH in progress'
        WHEN t.next_action_reason = 'allocated_to_landlord' THEN 'Landlord managing'
        WHEN t.next_action_reason = 'landlord_in_progress' THEN 'Landlord in progress'
        WHEN t.next_action_reason = 'landlord_resolved' THEN 'Landlord resolved'
        WHEN t.next_action_reason = 'landlord_needs_help' THEN 'Landlord needs help'
        WHEN t.next_action_reason = 'pending_review' THEN 'Review issue'
        WHEN t.next_action_reason = 'handoff_review' THEN 'Needs attention'
        WHEN t.next_action_reason = 'landlord_declined' THEN 'Landlord declined'
        WHEN t.next_action_reason = 'job_not_completed' THEN 'Job not completed'
        WHEN t.next_action_reason = 'manager_approval' THEN 'Review quote'
        WHEN t.next_action_reason = 'awaiting_landlord' THEN 'Awaiting landlord'
        WHEN t.next_action_reason = 'awaiting_contractor' THEN 'Awaiting contractor'
        WHEN t.next_action_reason = 'awaiting_booking' THEN 'Awaiting booking'
        WHEN t.next_action_reason = 'scheduled' THEN 'Job scheduled'
        ELSE 'Follow up'
      END AS action_label,

      CASE
        -- Stale context — dynamic, actionable guidance
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'Landlord has not responded — chase approval'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'Contractor accepted but hasn''t booked — chase booking'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'Scheduled date has passed — chase completion report from contractor'
        -- Contractor context
        WHEN t.next_action_reason = 'no_contractors' THEN 'All contractors contacted — none responded. Chase manually or add a new contractor'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 'Contractor has not responded — chase or redispatch'
        -- Existing context
        WHEN t.next_action_reason = 'ooh_dispatched' THEN 'Emergency dispatched to OOH contact — awaiting response'
        WHEN t.next_action_reason = 'ooh_resolved' THEN 'OOH contact handled the issue — review and mark complete'
        WHEN t.next_action_reason = 'ooh_unresolved' THEN 'OOH contact could not resolve — needs follow-up'
        WHEN t.next_action_reason = 'ooh_in_progress' THEN 'OOH contact is working on it'
        WHEN t.next_action_reason = 'allocated_to_landlord' THEN 'Issue allocated to landlord — awaiting response'
        WHEN t.next_action_reason = 'landlord_in_progress' THEN 'Landlord is working on it'
        WHEN t.next_action_reason = 'landlord_resolved' THEN 'Landlord resolved the issue — review and mark complete'
        WHEN t.next_action_reason = 'landlord_needs_help' THEN 'Landlord needs help — take over or assist'
        WHEN t.next_action_reason = 'pending_review' THEN 'New ticket awaiting triage'
        WHEN t.next_action_reason = 'handoff_review' THEN 'Ticket requires manual review'
        WHEN t.next_action_reason = 'landlord_declined' THEN 'Landlord declined the quote'
        WHEN t.next_action_reason = 'job_not_completed' THEN 'Job was marked incomplete'
        WHEN t.next_action_reason = 'manager_approval' THEN 'Contractor quote needs your approval'
        WHEN t.next_action_reason = 'awaiting_landlord' THEN 'Waiting for landlord to approve the quote'
        WHEN t.next_action_reason = 'awaiting_contractor' THEN 'Waiting for contractor response'
        WHEN t.next_action_reason = 'awaiting_booking' THEN 'Contractor needs to confirm a date'
        WHEN t.next_action_reason = 'scheduled' THEN 'Job is scheduled — awaiting completion'
        ELSE 'Ticket needs follow-up'
      END AS action_context,

      (
        CASE t.priority
          WHEN 'Emergency' THEN 100 WHEN 'Urgent' THEN 75
          WHEN 'High' THEN 50 WHEN 'Medium' THEN 25 WHEN 'Low' THEN 10 ELSE 25
        END
        + CASE
          WHEN t.next_action_reason IN ('handoff_review','landlord_declined','job_not_completed','pending_review') THEN 30
          WHEN t.next_action_reason IN ('no_contractors','ooh_dispatched','ooh_unresolved','landlord_needs_help') THEN 25
          WHEN t.next_action_reason IN ('ooh_resolved','landlord_resolved') THEN 20
          WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 25
          WHEN t.next_action_reason IN ('manager_approval','awaiting_landlord') THEN 10
          WHEN t.next_action_reason IN ('ooh_in_progress','allocated_to_landlord','landlord_in_progress') THEN 5
          ELSE 5
        END
        + CASE WHEN t.sla_due_at IS NOT NULL AND t.sla_due_at < now() THEN 50 ELSE 0 END
        + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600, 48)::int
      ) AS priority_score,

      CASE
        -- URGENT: genuine emergencies, urgent priority, SLA breach only
        WHEN t.priority = 'Emergency' OR (t.sla_due_at IS NOT NULL AND t.sla_due_at < now()) THEN 'URGENT'
        WHEN t.priority = 'Urgent' THEN 'URGENT'
        -- HIGH: high priority OR stale past PM timeout OR scheduled overdue
        WHEN t.priority = 'High' THEN 'HIGH'
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'HIGH'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'HIGH'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'HIGH'
        -- Default
        WHEN t.priority = 'Low' THEN 'LOW'
        ELSE 'NORMAL'
      END AS priority_bucket

    FROM c1_tickets t
    JOIN pm_tickets pt ON pt.id = t.id
    JOIN c1_properties p ON p.id = t.property_id
    JOIN c1_property_managers pm ON pm.id = t.property_manager_id
    LEFT JOIN c1_messages m ON m.ticket_id = t.id
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  )
  SELECT jsonb_build_object(
    'id', 'todo_' || s.id::text,
    'ticket_id', s.id,
    'source_type', CASE
      WHEN s.category = 'compliance_renewal' THEN 'compliance'
      WHEN s.category = 'rent_arrears' THEN 'rent'
      ELSE 'ticket'
    END,
    'entity_id', CASE
      WHEN s.compliance_certificate_id IS NOT NULL THEN s.compliance_certificate_id
      ELSE s.id
    END,
    'property_id', s.property_id,
    'portfolio_id', s.property_manager_id,
    'property_label', s.property_label,
    'issue_summary', s.issue_summary,
    'action_type', s.action_type,
    'action_label', s.action_label,
    'action_context', s.action_context,
    'next_action_reason', s.next_action_reason,
    'priority', s.priority,
    'priority_score', s.priority_score,
    'priority_bucket', s.priority_bucket,
    'waiting_since', s.waiting_since,
    'sla_breached', COALESCE(s.sla_due_at < now(), false),
    'created_at', s.date_logged,
    'scheduled_date', s.scheduled_date,
    'is_past_timeout', CASE
      WHEN s.next_action_reason = 'awaiting_landlord'
        AND EXTRACT(EPOCH FROM (now() - s.waiting_since)) / 3600 > COALESCE(s.landlord_timeout_hours, 48)
        THEN true
      WHEN s.next_action_reason = 'awaiting_booking'
        AND EXTRACT(EPOCH FROM (now() - s.waiting_since)) / 86400 > 3
        THEN true
      ELSE false
    END
  )
  FROM scored s
  ORDER BY s.priority_score DESC, s.waiting_since ASC;
END;
$function$;
