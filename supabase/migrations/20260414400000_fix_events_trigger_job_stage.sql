-- ============================================================
-- FIX: c1_events trigger references dropped job_stage column
-- ============================================================
-- The trg_c1_events_on_ticket trigger referenced NEW.job_stage which was
-- dropped in Sprint B. Because the error is caught by EXCEPTION WHEN OTHERS,
-- the entire UPDATE block silently fails — NO events have been logged for
-- ticket updates since Sprint B (closed, hold, archive, OOH, landlord, etc).
--
-- Fix: Replace job_stage = 'completed' with next_action_reason = 'completed'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_c1_events_on_ticket()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_property_label text;
  v_tenant_name text;
BEGIN
  IF NEW.property_manager_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.address INTO v_property_label
  FROM c1_properties p WHERE p.id = NEW.property_id;

  SELECT t.full_name INTO v_tenant_name
  FROM c1_tenants t WHERE t.id = NEW.tenant_id;

  -- ISSUE_CREATED: new ticket inserted
  IF TG_OP = 'INSERT' THEN
    INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
    VALUES (
      NEW.property_manager_id,
      NEW.id,
      'ISSUE_CREATED',
      CASE WHEN NEW.is_manual THEN 'PM' ELSE 'TENANT' END,
      COALESCE(v_tenant_name, 'Unknown'),
      v_property_label,
      jsonb_build_object('category', NEW.category, 'priority', NEW.priority)
    );

    IF NEW.handoff = true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'HANDOFF_CREATED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF COALESCE(NEW.pending_review, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'PENDING_REVIEW', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;
  END IF;

  -- UPDATE events
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.pending_review, false) AND NOT COALESCE(OLD.pending_review, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'PENDING_REVIEW', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_CLOSED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    -- job_stage dropped in Sprint B — use next_action_reason instead
    IF NEW.next_action_reason = 'completed' AND OLD.next_action_reason IS DISTINCT FROM 'completed' THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'JOB_COMPLETED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.scheduled_date IS NOT NULL AND OLD.scheduled_date IS NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'JOB_SCHEDULED', 'SYSTEM', NULL, v_property_label,
        jsonb_build_object('scheduled_date', NEW.scheduled_date));
    END IF;

    IF NEW.handoff = true AND (OLD.handoff IS DISTINCT FROM true) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'HANDOFF_CREATED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.on_hold = true AND OLD.on_hold IS DISTINCT FROM true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_ON_HOLD', 'PM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.on_hold = false AND OLD.on_hold = true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_RESUMED', 'PM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.archived = true AND OLD.archived IS DISTINCT FROM true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_ARCHIVED', 'PM', NULL, v_property_label, NULL);
    END IF;

    -- ═══ OOH Events ═══

    IF COALESCE(NEW.ooh_dispatched, false) AND NOT COALESCE(OLD.ooh_dispatched, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'OOH_DISPATCHED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.ooh_outcome_at IS DISTINCT FROM OLD.ooh_outcome_at AND NEW.ooh_outcome IS NOT NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id,
        CASE NEW.ooh_outcome
          WHEN 'resolved' THEN 'OOH_RESOLVED'
          WHEN 'unresolved' THEN 'OOH_UNRESOLVED'
          WHEN 'in_progress' THEN 'OOH_IN_PROGRESS'
        END,
        'OOH_CONTACT', NULL, v_property_label,
        jsonb_build_object('outcome', NEW.ooh_outcome, 'notes', NEW.ooh_notes, 'cost', NEW.ooh_cost));
    END IF;

    -- ═══ Landlord Allocation Events ═══

    IF COALESCE(NEW.landlord_allocated, false) AND NOT COALESCE(OLD.landlord_allocated, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'LANDLORD_ALLOCATED', 'PM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.landlord_outcome_at IS DISTINCT FROM OLD.landlord_outcome_at AND NEW.landlord_outcome IS NOT NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id,
        CASE NEW.landlord_outcome
          WHEN 'resolved' THEN 'LANDLORD_RESOLVED_ALLOC'
          WHEN 'in_progress' THEN 'LANDLORD_IN_PROGRESS'
          WHEN 'need_help' THEN 'LANDLORD_NEEDS_HELP'
        END,
        'LANDLORD', NULL, v_property_label,
        jsonb_build_object('outcome', NEW.landlord_outcome, 'notes', NEW.landlord_notes, 'cost', NEW.landlord_cost));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'c1_events ticket trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;
