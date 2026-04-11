-- Fix BUG-12: WhatsApp flow responses can overwrite already-actioned decisions.
-- Add state guards to c1_inbound_reply for manager and landlord reply paths.
-- If a decision (approval) was already recorded, reject the stale flow response.
--
-- PROTECTED RPC: c1_inbound_reply (Safe Modification Protocol applied)
-- Change: Added 2 guards — manager approval guard (line ~411) and landlord approval guard (line ~500)

CREATE OR REPLACE FUNCTION public.c1_inbound_reply(p_from text, p_body text, p_message_sid text DEFAULT NULL::text, p_original_sid text DEFAULT NULL::text, p_num_media integer DEFAULT 0, p_interactive_data text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_from_norm text := regexp_replace(coalesce(p_from,''), '^\s*(whatsapp:)?\+?', '', 'i');
  v_now       timestamptz := now();

  v_msg       public.c1_messages%rowtype;
  v_ticket_id uuid;

  v_actor     text;
  v_match_contract jsonb;

  v_text      text := lower(trim(coalesce(p_body,'')));
  v_num       numeric;
  v_num_fmt   text;
  v_review_contractor_id uuid;

  v_manager_new jsonb;

  v_ticket     public.c1_tickets%rowtype;
  v_property   public.c1_properties%rowtype;
  v_tenant     public.c1_tenants%rowtype;

  v_contractor_elem jsonb;
  v_contractor_id   uuid;
  v_contr_row       public.c1_contractors%rowtype;

  v_has_decline_keyword boolean;
  v_has_approve_keyword boolean;
  v_has_amount boolean;

  v_interactive_json jsonb;
  v_flows_value      text;
  v_flows_decision   text;
  v_flows_markup     text;
  v_flows_notes      text;
  v_sid_matched      boolean := false;

  v_sid_matched_contractor_id uuid := NULL;
  v_has_meaningful_content boolean := false;

BEGIN
  --------------------------------------------------------------------
  -- STEP 0: VALIDATE MESSAGE CONTENT
  --------------------------------------------------------------------
  IF p_interactive_data IS NOT NULL AND p_interactive_data <> '' THEN
    v_has_meaningful_content := true;
  ELSE
    v_has_meaningful_content := (
      length(v_text) >= 2 AND (
        v_text ~ '[0-9]+' OR
        v_text ~* '\y(approve|approved|yes|accept|accepted|confirmed|proceed)\y' OR
        v_text ~* '\y(decline|declined|reject|rejected|cancel|refused)\y' OR
        v_text ~* '\y(complete|completed|done|finished)\y' OR
        v_text ~* '\y(book|booked|schedule|scheduled|available)\y'
      )
    );

    IF NOT v_has_meaningful_content THEN
      RETURN jsonb_build_object(
        'ok', true,
        'path', 'ignored-noise',
        'reason', 'Message does not contain actionable content',
        'body_length', length(v_text),
        'body_preview', left(v_text, 50)
      );
    END IF;
  END IF;

  --------------------------------------------------------------------
  -- STEP 1: SID MATCHING
  --------------------------------------------------------------------
  v_actor := NULL;

  IF p_original_sid IS NOT NULL AND p_original_sid <> '' THEN
    SELECT (c->>'id')::uuid INTO v_sid_matched_contractor_id
    FROM public.c1_messages m
    JOIN LATERAL jsonb_array_elements(m.contractors) c ON TRUE
    WHERE c->>'twilio_sid' = p_original_sid
    LIMIT 1;

    IF v_sid_matched_contractor_id IS NOT NULL THEN
      SELECT m.* INTO v_msg
      FROM public.c1_messages m
      JOIN LATERAL jsonb_array_elements(m.contractors) c ON TRUE
      WHERE c->>'twilio_sid' = p_original_sid
      LIMIT 1;

      v_actor := 'contractor';
      v_sid_matched := true;
    ELSE
      SELECT m.* INTO v_msg
      FROM public.c1_messages m
      WHERE m.manager->>'twilio_sid' = p_original_sid
         OR m.manager->>'last_outbound_sid' = p_original_sid
      LIMIT 1;

      IF FOUND THEN
        v_actor := 'manager';
        v_sid_matched := true;
      ELSE
        SELECT m.* INTO v_msg
        FROM public.c1_messages m
        WHERE m.landlord->>'twilio_sid' = p_original_sid
           OR m.landlord->>'last_outbound_sid' = p_original_sid
        LIMIT 1;

        IF FOUND THEN
          v_actor := 'landlord';
          v_sid_matched := true;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Phone fallback
  IF v_actor IS NULL THEN
    SELECT m.* INTO v_msg
    FROM public.c1_messages m
    JOIN LATERAL jsonb_array_elements(m.contractors) c ON TRUE
    WHERE replace(c->>'phone','+','') ILIKE '%'||v_from_norm
    ORDER BY m.updated_at DESC
    LIMIT 1;

    IF FOUND THEN
      v_actor := 'contractor';
    ELSE
      SELECT m.* INTO v_msg
      FROM public.c1_messages m
      WHERE replace(m.manager->>'phone','+','') ILIKE '%'||v_from_norm
      ORDER BY m.updated_at DESC
      LIMIT 1;

      IF FOUND THEN
        v_actor := 'manager';
      ELSE
        SELECT m.* INTO v_msg
        FROM public.c1_messages m
        WHERE replace(m.landlord->>'phone','+','') ILIKE '%'||v_from_norm
        ORDER BY m.updated_at DESC
        LIMIT 1;

        IF FOUND THEN
          v_actor := 'landlord';
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no-match', 'sid_provided', p_original_sid IS NOT NULL, 'from', v_from_norm);
  END IF;

  v_ticket_id := v_msg.ticket_id;

  --------------------------------------------------------------------
  -- STEP 2: Parse InteractiveData (Flows responses)
  --------------------------------------------------------------------
  IF p_interactive_data IS NOT NULL AND p_interactive_data <> '' THEN
    BEGIN
      v_interactive_json := p_interactive_data::jsonb;

      SELECT item->>'value' INTO v_flows_value
      FROM jsonb_array_elements(v_interactive_json->'pages') AS page,
           jsonb_array_elements(CASE WHEN jsonb_typeof(page->'items') = 'array' THEN page->'items' ELSE '[]'::jsonb END) AS item
      WHERE lower(item->>'label') LIKE '%quote%'
         OR lower(item->>'label') LIKE '%amount%'
         OR lower(item->>'label') LIKE '%£%'
      LIMIT 1;

      SELECT item->>'value' INTO v_flows_decision
      FROM jsonb_array_elements(v_interactive_json->'pages') AS page,
           jsonb_array_elements(CASE WHEN jsonb_typeof(page->'items') = 'array' THEN page->'items' ELSE '[]'::jsonb END) AS item
      WHERE lower(item->>'label') LIKE '%decision%'
         OR lower(item->>'label') LIKE '%approval%'
         OR lower(item->>'label') LIKE '%approve%'
         OR lower(item->>'label') LIKE '%action%'
      LIMIT 1;

      SELECT item->>'value' INTO v_flows_markup
      FROM jsonb_array_elements(v_interactive_json->'pages') AS page,
           jsonb_array_elements(CASE WHEN jsonb_typeof(page->'items') = 'array' THEN page->'items' ELSE '[]'::jsonb END) AS item
      WHERE lower(item->>'label') LIKE '%markup%'
         OR lower(item->>'label') LIKE '%charge%'
         OR lower(item->>'label') LIKE '%tenant%'
      LIMIT 1;

      SELECT item->>'value' INTO v_flows_notes
      FROM jsonb_array_elements(v_interactive_json->'pages') AS page,
           jsonb_array_elements(CASE WHEN jsonb_typeof(page->'items') = 'array' THEN page->'items' ELSE '[]'::jsonb END) AS item
      WHERE lower(item->>'label') LIKE '%note%'
         OR lower(item->>'label') LIKE '%comment%'
         OR lower(item->>'label') LIKE '%detail%'
         OR lower(item->>'label') LIKE '%reason%'
      LIMIT 1;

      IF v_flows_value IS NOT NULL THEN
        v_num := regexp_replace(v_flows_value, '[^0-9.]', '', 'g')::numeric;
      END IF;

      IF v_flows_decision IS NOT NULL THEN
        IF lower(v_flows_decision) LIKE '%approve%' OR lower(v_flows_decision) LIKE '%accept%' THEN
          v_text := 'approve';
        ELSIF lower(v_flows_decision) LIKE '%decline%' OR lower(v_flows_decision) LIKE '%reject%' THEN
          v_text := 'decline';
        END IF;

        IF v_flows_markup IS NOT NULL AND v_text = 'approve' THEN
          v_num := regexp_replace(v_flows_markup, '[^0-9.]', '', 'g')::numeric;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Closed tickets don't process
  IF v_msg.stage = 'closed' THEN
    RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id, 'path', 'already-closed');
  END IF;

  --------------------------------------------------------------------
  -- FAST-PATH: Contractor completion
  --------------------------------------------------------------------
  IF v_actor = 'contractor'
     AND v_text !~* '\yincomplete\y'
     AND v_text ~* '\y(complete|completed|done|finished)\y'
  THEN
    SELECT * INTO v_ticket
    FROM public.c1_tickets t
    WHERE t.id = v_ticket_id
      AND t.next_action_reason = 'scheduled'
    LIMIT 1;

    IF FOUND THEN
      IF v_sid_matched_contractor_id IS NOT NULL THEN
        SELECT elem INTO v_contractor_elem
        FROM jsonb_array_elements(coalesce(v_msg.contractors,'[]'::jsonb)) elem
        WHERE (elem->>'id')::uuid = v_sid_matched_contractor_id
        LIMIT 1;
      ELSE
        SELECT elem INTO v_contractor_elem
        FROM jsonb_array_elements(coalesce(v_msg.contractors,'[]'::jsonb)) elem
        WHERE replace(elem->>'phone','+','') ILIKE '%'||v_from_norm
        ORDER BY (elem->>'sent_at')::timestamptz DESC NULLS LAST
        LIMIT 1;
      END IF;

      v_contractor_id := NULL;
      IF v_contractor_elem IS NOT NULL THEN
        v_contractor_id := (v_contractor_elem->>'id')::uuid;
      END IF;

      IF (v_ticket.contractor_id IS NULL) OR (v_ticket.contractor_id = v_contractor_id) THEN
        SELECT * INTO v_property FROM public.c1_properties WHERE id = v_ticket.property_id LIMIT 1;
        SELECT * INTO v_tenant   FROM public.c1_tenants    WHERE id = v_ticket.tenant_id    LIMIT 1;

        IF v_contractor_id IS NOT NULL THEN
          SELECT * INTO v_contr_row FROM public.c1_contractors WHERE id = v_contractor_id LIMIT 1;
        END IF;

        UPDATE public.c1_messages SET suppress_webhook = TRUE WHERE ticket_id = v_ticket_id;

        PERFORM net.http_post(
          url     := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-completion?source=webhook',
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body    := jsonb_build_object(
            'instruction','contractor-completion',
            'payload', jsonb_build_object(
              'received_at', v_now,
              'ticket', jsonb_build_object(
                'id', v_ticket.id, 'status', v_ticket.status,
                'issue_description', v_ticket.issue_description, 'category', v_ticket.category,
                'priority', v_ticket.priority, 'contractor_id', v_ticket.contractor_id,
                'final_amount', v_ticket.final_amount, 'scheduled_date', v_ticket.scheduled_date,
                'confirmation_date', v_ticket.confirmation_date, 'date_logged', v_ticket.date_logged,
                'conversation_id', v_ticket.conversation_id, 'property_id', v_ticket.property_id,
                'tenant_id', v_ticket.tenant_id, 'verified_by', v_ticket.verified_by,
                'images', COALESCE(to_jsonb(v_ticket.images), '[]'::jsonb)
              ),
              'property', CASE WHEN v_property.id IS NOT NULL THEN
                jsonb_build_object('id', v_property.id, 'address', v_property.address,
                  'access_instructions', v_property.access_instructions,
                  'property_manager_id', v_property.property_manager_id,
                  'emergency_access_contact', v_property.emergency_access_contact,
                  'auto_approve_limit', v_property.auto_approve_limit)
                ELSE NULL END,
              'tenant', CASE WHEN v_tenant.id IS NOT NULL THEN
                jsonb_build_object('id', v_tenant.id, 'full_name', v_tenant.full_name,
                  'email', v_tenant.email, 'phone', v_tenant.phone)
                ELSE NULL END,
              'message_thread', jsonb_build_object('stage_before_close', v_msg.stage,
                'manager', v_msg.manager, 'landlord', v_msg.landlord),
              'contractor', jsonb_build_object('id', v_contractor_id,
                'name', COALESCE(v_contr_row.contractor_name, v_contractor_elem->>'name'),
                'email', COALESCE(v_contr_row.contractor_email, v_contractor_elem->>'email'),
                'phone', COALESCE(v_contr_row.contractor_phone, v_contractor_elem->>'phone')),
              'inbound', jsonb_build_object('from_norm', v_from_norm, 'text', p_body,
                'sid', p_message_sid, 'media_count', p_num_media)
            )
          )
        );

        UPDATE public.c1_messages SET stage = 'closed', updated_at = now() WHERE ticket_id = v_ticket_id;
        UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
        RETURN jsonb_build_object('ok', true, 'actor','contractor', 'ticket_id', v_ticket_id, 'path','completion-fastpath');
      END IF;
    END IF;
  END IF;

  --------------------------------------------------------------------
  -- Stage-based override
  --------------------------------------------------------------------
  IF NOT v_sid_matched THEN
    IF v_msg.stage = 'awaiting_manager'  THEN v_actor := 'manager';  END IF;
    IF v_msg.stage = 'awaiting_landlord' THEN v_actor := 'landlord'; END IF;
  END IF;

  UPDATE public.c1_messages SET suppress_webhook = TRUE WHERE ticket_id = v_ticket_id;

  --------------------------------------------------------------------
  -- CONTRACTOR REPLY
  --------------------------------------------------------------------
  IF v_actor = 'contractor' THEN
    IF v_sid_matched_contractor_id IS NOT NULL THEN
      v_match_contract := (
        SELECT elem
        FROM jsonb_array_elements(coalesce(v_msg.contractors,'[]'::jsonb)) elem
        WHERE (elem->>'id')::uuid = v_sid_matched_contractor_id
        LIMIT 1
      );
    ELSE
      v_match_contract := (
        SELECT elem
        FROM jsonb_array_elements(coalesce(v_msg.contractors,'[]'::jsonb)) elem
        WHERE replace(elem->>'phone','+','') ILIKE '%'||v_from_norm
        ORDER BY (elem->>'sent_at')::timestamptz DESC NULLS LAST
        LIMIT 1
      );
    END IF;

    IF v_num IS NULL THEN
      v_num := substring(v_text from '([0-9]+(?:\.[0-9]{1,2})?)')::numeric;
    END IF;

    IF v_num IS NOT NULL THEN
      v_num_fmt := trim(to_char(v_num,'FM£999999990.00'));
      IF right(v_num_fmt,3) = '.00' THEN v_num_fmt := left(v_num_fmt, length(v_num_fmt)-3); END IF;
    END IF;

    PERFORM public.c1_msg_merge_contractor(
      v_ticket_id,
      (v_match_contract->>'id')::uuid,
      jsonb_build_object(
        'status','replied',
        'replied_at', to_jsonb(v_now),
        'reply_text', to_jsonb(CASE WHEN p_body <> '' THEN p_body ELSE COALESCE(v_flows_value, '') END),
        'quote_amount', CASE WHEN v_num_fmt IS NOT NULL THEN to_jsonb(v_num_fmt) ELSE NULL::jsonb END,
        'quote_notes', CASE WHEN v_flows_notes IS NOT NULL AND v_flows_notes <> '' THEN to_jsonb(v_flows_notes) ELSE NULL::jsonb END,
        'inbound_sid', to_jsonb(p_message_sid),
        'inbound_media', to_jsonb(p_num_media),
        'via_flows', to_jsonb(p_interactive_data IS NOT NULL AND p_interactive_data <> '')
      )
    );

    PERFORM public.c1_message_next_action(v_ticket_id);

    UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
    RETURN jsonb_build_object(
      'ok', true, 'actor', 'contractor', 'ticket_id', v_ticket_id,
      'sid_matched', v_sid_matched, 'quote_amount', v_num_fmt,
      'contractor_id', v_sid_matched_contractor_id,
      'via_flows', p_interactive_data IS NOT NULL AND p_interactive_data <> ''
    );
  END IF;

  --------------------------------------------------------------------
  -- MANAGER REPLY (hardened keyword matching)
  --------------------------------------------------------------------
  IF v_actor = 'manager' THEN
    -- ▶ GUARD: If manager already decided, reject stale WhatsApp flow response
    IF (v_msg.manager->>'approval') IS NOT NULL THEN
      UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
      RETURN jsonb_build_object(
        'ok', true,
        'actor', 'manager',
        'ticket_id', v_ticket_id,
        'path', 'decision-already-made',
        'reason', 'Manager decision was already recorded; ignoring stale WhatsApp flow reply'
      );
    END IF;

    v_review_contractor_id :=
      COALESCE(
        (v_msg.manager->>'reviewing_contractor_id')::uuid,
        (
          SELECT (elem->>'id')::uuid
          FROM jsonb_array_elements(coalesce(v_msg.contractors,'[]'::jsonb)) elem
          WHERE elem->>'status'='replied'
          ORDER BY (elem->>'replied_at')::timestamptz DESC NULLS LAST
          LIMIT 1
        )
      );

    IF v_num IS NULL THEN
      v_num := substring(v_text from '([0-9]+(?:\.[0-9]{1,2})?)')::numeric;
    END IF;

    IF v_num IS NOT NULL THEN
      v_num_fmt := trim(to_char(v_num,'FM£999999990.00'));
      IF right(v_num_fmt,3) = '.00' THEN v_num_fmt := left(v_num_fmt, length(v_num_fmt)-3); END IF;
    END IF;

    -- HARDENED: Use word boundaries to prevent false positives
    v_has_decline_keyword := (v_text ~* '\y(decline|declined|reject|rejected|cancel|refused)\y');
    v_has_approve_keyword := (v_text ~* '\y(approve|approved|yes|accept|accepted|confirmed|proceed)\y');
    v_has_amount := (v_num IS NOT NULL);

    IF v_has_decline_keyword AND NOT v_has_amount THEN
      UPDATE public.c1_messages
         SET manager = jsonb_set(
                         jsonb_set(
                           jsonb_set(coalesce(manager,'{}'::jsonb), '{last_text}',
                             to_jsonb(COALESCE(NULLIF(p_body,''), v_flows_decision, 'decline')), true),
                           '{replied_at}', to_jsonb(v_now), true
                         ),
                         '{approval}', to_jsonb(false), true
                       )
             - 'reviewing_contractor_id' - 'approval_amount',
             updated_at = v_now
       WHERE ticket_id = v_ticket_id;

      IF v_review_contractor_id IS NOT NULL THEN
        PERFORM public.c1_msg_merge_contractor(
          v_ticket_id, v_review_contractor_id,
          jsonb_build_object('status','declined','manager_decision','declined_by_manager','declined_at', to_jsonb(v_now))
        );
      END IF;

    ELSIF v_has_approve_keyword OR v_has_amount THEN
      v_manager_new := coalesce(v_msg.manager,'{}'::jsonb);
      v_manager_new := jsonb_set(v_manager_new,'{approval}', to_jsonb(true), true);
      v_manager_new := jsonb_set(v_manager_new,'{replied_at}', to_jsonb(v_now), true);
      v_manager_new := jsonb_set(v_manager_new,'{last_text}',
        to_jsonb(COALESCE(NULLIF(p_body,''), v_flows_decision, 'approve')), true);
      IF v_num_fmt IS NOT NULL THEN
        v_manager_new := jsonb_set(v_manager_new,'{approval_amount}', to_jsonb(v_num_fmt), true);
      END IF;

      UPDATE public.c1_messages SET manager = v_manager_new, updated_at = v_now WHERE ticket_id = v_ticket_id;

      IF v_review_contractor_id IS NOT NULL THEN
        PERFORM public.c1_msg_merge_contractor(
          v_ticket_id, v_review_contractor_id,
          jsonb_build_object('manager_decision','approved','approved_at', to_jsonb(v_now))
        );
      END IF;

    ELSE
      -- Unrecognized manager message - log but don't change approval state
      UPDATE public.c1_messages
         SET manager = jsonb_set(coalesce(manager,'{}'::jsonb), '{last_text}',
               to_jsonb(COALESCE(NULLIF(p_body,''), 'unknown')), true),
             updated_at = v_now
       WHERE ticket_id = v_ticket_id;
    END IF;

    PERFORM public.c1_message_next_action(v_ticket_id);

    UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
    RETURN jsonb_build_object(
      'ok', true, 'actor', 'manager', 'ticket_id', v_ticket_id,
      'sid_matched', v_sid_matched, 'decision', v_text, 'markup', v_num_fmt,
      'via_flows', p_interactive_data IS NOT NULL AND p_interactive_data <> ''
    );
  END IF;

  --------------------------------------------------------------------
  -- LANDLORD REPLY (supports both Flows and free-text)
  --------------------------------------------------------------------
  IF v_actor = 'landlord' THEN
    -- ▶ GUARD: If landlord already decided, reject stale WhatsApp flow response
    IF (v_msg.landlord->>'approval') IS NOT NULL THEN
      UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
      RETURN jsonb_build_object(
        'ok', true,
        'actor', 'landlord',
        'ticket_id', v_ticket_id,
        'path', 'decision-already-made',
        'reason', 'Landlord decision was already recorded; ignoring stale WhatsApp flow reply'
      );
    END IF;

    -- HARDENED: Use word boundaries
    IF v_text ~* '\y(decline|declined|reject|rejected|cancel|refused)\y' THEN
      UPDATE public.c1_messages
         SET landlord = jsonb_set(jsonb_set(jsonb_set(
               jsonb_set(coalesce(landlord,'{}'::jsonb),
               '{approval}', to_jsonb(false), true),
               '{replied_at}', to_jsonb(v_now), true),
               '{last_text}', to_jsonb(COALESCE(NULLIF(p_body,''), v_flows_decision, 'decline')), true),
               '{reason}', to_jsonb(COALESCE(v_flows_notes, '')), true),
             updated_at = v_now
       WHERE ticket_id = v_ticket_id;
    ELSIF v_text ~* '\y(approve|approved|yes|accept|accepted|confirmed|proceed)\y' THEN
      UPDATE public.c1_messages
         SET landlord = jsonb_set(jsonb_set(jsonb_set(
               jsonb_set(coalesce(landlord,'{}'::jsonb),
               '{approval}', to_jsonb(true), true),
               '{replied_at}', to_jsonb(v_now), true),
               '{last_text}', to_jsonb(COALESCE(NULLIF(p_body,''), v_flows_decision, 'approve')), true),
               '{reason}', to_jsonb(COALESCE(v_flows_notes, '')), true),
             updated_at = v_now
       WHERE ticket_id = v_ticket_id;
    ELSE
      -- Unrecognized landlord message - log but don't change approval state
      UPDATE public.c1_messages
         SET landlord = jsonb_set(coalesce(landlord,'{}'::jsonb), '{last_text}',
               to_jsonb(COALESCE(NULLIF(p_body,''), 'unknown')), true),
             updated_at = v_now
       WHERE ticket_id = v_ticket_id;

      UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
      RETURN jsonb_build_object('ok', true, 'actor','landlord','ticket_id', v_ticket_id, 'path', 'unrecognized-no-action');
    END IF;

    PERFORM public.c1_finalize_job(v_ticket_id);
    UPDATE public.c1_messages SET stage = 'closed', updated_at = v_now WHERE ticket_id = v_ticket_id;

    UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
    RETURN jsonb_build_object('ok', true, 'actor','landlord','ticket_id', v_ticket_id, 'sid_matched', v_sid_matched,
      'via_flows', p_interactive_data IS NOT NULL AND p_interactive_data <> '',
      'reason', v_flows_notes);
  END IF;

  UPDATE public.c1_messages SET suppress_webhook = FALSE WHERE ticket_id = v_ticket_id;
  RETURN jsonb_build_object('ok', true, 'ticket_id', v_ticket_id);
END;
$function$;
