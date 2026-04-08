-- ============================================================
-- ROLLBACK: c1_get_dashboard_todo — reverts to action verb labels version
-- ============================================================
-- Restores the function to the state from 20260409100000_dashboard_action_labels.sql
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

      -- action_type (unchanged from escalation migration)
      CASE
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'STALE_AWAITING'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'STALE_AWAITING'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'SCHEDULED_OVERDUE'
        WHEN t.next_action_reason IN ('handoff_review','landlord_declined','job_not_completed','pending_review','ooh_dispatched','ooh_resolved','ooh_unresolved','landlord_needs_help','landlord_resolved') THEN 'NEEDS_ATTENTION'
        WHEN t.next_action_reason = 'no_contractors' THEN 'NEEDS_ATTENTION'
        WHEN t.next_action_reason IN ('manager_approval','awaiting_landlord') THEN 'AWAITING_APPROVAL'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 'CONTRACTOR_UNRESPONSIVE'
        ELSE 'FOLLOW_UP'
      END AS action_type,

      -- action_label — action verbs: Chase, Collect, Review, Triage, Approve, Contact, Follow up
      CASE
        -- Escalated states (PM must act — "after" states)
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'Chase landlord'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'Chase booking'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'Collect completion report'
        -- Contractor escalation
        WHEN t.next_action_reason = 'no_contractors' THEN 'Chase contractor'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false) THEN 'Chase contractor'
        -- Needs Action states (first-time — "before" states)
        WHEN t.next_action_reason = 'pending_review' THEN 'Triage issue'
        WHEN t.next_action_reason = 'handoff_review' THEN 'Review handoff'
        WHEN t.next_action_reason = 'manager_approval' THEN 'Approve quote'
        WHEN t.next_action_reason = 'landlord_declined' THEN 'Contact landlord'
        WHEN t.next_action_reason = 'job_not_completed' THEN 'Review incomplete job'
        WHEN t.next_action_reason = 'landlord_needs_help' THEN 'Contact landlord'
        WHEN t.next_action_reason = 'landlord_resolved' THEN 'Review completion'
        WHEN t.next_action_reason = 'ooh_resolved' THEN 'Review completion'
        WHEN t.next_action_reason = 'ooh_unresolved' THEN 'Chase resolution'
        WHEN t.next_action_reason = 'ooh_dispatched' THEN 'Follow up OOH'
        -- In-progress labels (descriptive — PM isn't the actor)
        WHEN t.next_action_reason = 'awaiting_landlord' THEN 'Awaiting landlord'
        WHEN t.next_action_reason = 'awaiting_contractor' THEN 'Awaiting contractor'
        WHEN t.next_action_reason = 'awaiting_booking' THEN 'Awaiting booking'
        WHEN t.next_action_reason = 'scheduled' THEN 'Awaiting completion'
        WHEN t.next_action_reason = 'allocated_to_landlord' THEN 'Landlord managing'
        WHEN t.next_action_reason = 'landlord_in_progress' THEN 'Landlord in progress'
        WHEN t.next_action_reason = 'ooh_in_progress' THEN 'OOH in progress'
        ELSE 'Follow up'
      END AS action_label,

      -- action_context — enriched with durations/dates for the ticket drawer
      CASE
        -- Escalated contexts with dynamic info
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600 > COALESCE(pm.landlord_timeout_hours, 48)
          THEN 'Landlord has not responded in ' ||
            COALESCE(ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 3600)::text, '?') ||
            'h — chase for approval'
        WHEN t.next_action_reason = 'awaiting_booking'
          AND EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400 > 3
          THEN 'Contractor accepted ' ||
            COALESCE(ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(m.updated_at, t.date_logged))) / 86400)::text, '?') ||
            'd ago but hasn''t booked — chase booking'
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date::date < CURRENT_DATE
          THEN 'Job was scheduled for ' ||
            to_char(t.scheduled_date, 'DD Mon') ||
            ' — collect completion report from contractor'
        -- Contractor context
        WHEN t.next_action_reason = 'no_contractors'
          THEN 'All contractors contacted — none responded. Chase manually or add a new contractor'
        WHEN t.next_action_reason = 'awaiting_contractor' AND COALESCE(ct.has_unresponsive, false)
          THEN 'Contractor contacted ' ||
            COALESCE(ROUND(EXTRACT(EPOCH FROM (now() - ct.earliest_sent_at)) / 3600)::text, '?') ||
            'h ago — no response. Chase or redispatch'
        -- Standard contexts
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
        WHEN t.next_action_reason = 'landlord_declined' THEN 'Landlord declined the quote — contact to discuss alternatives'
        WHEN t.next_action_reason = 'job_not_completed' THEN 'Contractor marked job incomplete — review and redispatch'
        WHEN t.next_action_reason = 'manager_approval' THEN 'Contractor quote needs your approval'
        WHEN t.next_action_reason = 'awaiting_landlord' THEN 'Waiting for landlord to approve the quote'
        WHEN t.next_action_reason = 'awaiting_contractor' THEN 'Waiting for contractor response'
        WHEN t.next_action_reason = 'awaiting_booking' THEN 'Contractor needs to confirm a date'
        WHEN t.next_action_reason = 'scheduled' THEN 'Job is scheduled — awaiting completion'
        ELSE 'Ticket needs follow-up'
      END AS action_context,

      -- priority_score (unchanged)
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

      -- priority_bucket (unchanged)
      CASE
        WHEN t.priority = 'Emergency' OR (t.sla_due_at IS NOT NULL AND t.sla_due_at < now()) THEN 'URGENT'
        WHEN t.priority = 'Urgent' THEN 'URGENT'
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
