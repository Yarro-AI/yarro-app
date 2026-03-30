-- =============================================================
-- CONTAINS LIVE VERSIONS OF CRITICAL RPCs — DO NOT MODIFY
-- =============================================================
-- This migration redefines:
--   c1_context_logic  (lines ~15-975)  — WhatsApp state machine
--   c1_create_ticket  (lines ~981-end) — Ticket creation
--
-- These are the CURRENT production definitions, superseding
-- the versions in 20260327041845_remote_schema.sql.
--
-- DO NOT MODIFY without Adam's explicit approval.
-- See supabase/core-rpcs/ticket-lifecycle.md for callers.
-- =============================================================
--
-- WhatsApp Room Awareness
-- Extends c1_context_logic to return room data for the tenant
-- Extends c1_create_ticket to populate room_id on tickets
-- =============================================================

-- -------------------------------------------------------------
-- 1. c1_context_logic — add room lookup + room in return
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.c1_context_logic(_phone text, _message jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  -- Core rows
  tenant_row          c1_tenants%rowtype;
  property_row        c1_properties%rowtype;
  convo_row           c1_conversations%rowtype;
  pm_row              c1_property_managers%rowtype;
  room_row            c1_rooms%rowtype;           -- NEW: room context

  -- Derived data
  tickets             jsonb := '[]'::jsonb;
  tenant_verified     boolean := false;
  ai_instruction      text    := null;
  v_match_type        text    := 'none';
  v_verification_type text    := null;

  -- Stage + text helpers
  v_stage             text;
  v_text_raw          text := coalesce(_message->>'message', '');
  v_text_lower        text := lower(coalesce(_message->>'message', ''));

  -- Convenience
  v_caller_role       text;
  v_caller_tag        text;

  -- Helper outputs
  v_prop_id           uuid;

  -- Representative tenant helper outputs
  v_rep_tenant_id     uuid;
  v_rep_match_type    text;

  -- For issue/photo sub-stage logic
  v_last_out_message       text;
  v_in_photo_mode          boolean := false;

  -- Duplicate-stage helper: did we just enter duplicate on this turn
  v_just_entered_duplicate boolean := false;

  -- Address-stage helpers
  v_has_prior_out              boolean := false;
  v_has_prior_postcode_prompt  boolean := false;

  -- Phone-match helper
  v_phone_count int := 0;

begin
  -------------------------------------------------------------------
  -- 1) Find or create conversation, append inbound to log
  -------------------------------------------------------------------
  select *
  into convo_row
  from c1_conversations
  where phone = _phone
    and status = 'open'
  limit 1;

  if not found then
    -------------------------------------------------------------------
    -- Phone-based tenant lookup BEFORE address stage
    -------------------------------------------------------------------
    select count(*) into v_phone_count
    from c1_tenants
    where phone = _phone
      and property_id is not null;

    if v_phone_count = 1 then
      select * into tenant_row
      from c1_tenants
      where phone = _phone
        and property_id is not null
      limit 1;

      if tenant_row.id is not null and tenant_row.property_id is not null then
        select * into property_row
        from c1_properties
        where id = tenant_row.property_id
        limit 1;

        if property_row.id is not null and property_row.property_manager_id is not null then
          select * into pm_row
          from c1_property_managers
          where id = property_row.property_manager_id
          limit 1;

          insert into c1_conversations (
            phone, status, log, last_updated, stage, caller_phone,
            handoff, tenant_confirmed,
            tenant_id, property_id, verification_type, property_manager_id
          )
          values (
            _phone, 'open', jsonb_build_array(_message), now(), 'phone_match', _phone,
            false, false,
            tenant_row.id, property_row.id, 'phone_candidate', property_row.property_manager_id
          )
          returning * into convo_row;
        end if;
      end if;
    end if;

    -- If phone match did not succeed, standard address flow
    if convo_row.id is null then
      tenant_row   := null;
      property_row := null;
      pm_row       := null;

      insert into c1_conversations (
        phone, status, log, last_updated, stage, caller_phone,
        handoff, tenant_confirmed
      )
      values (
        _phone, 'open', jsonb_build_array(_message), now(), 'address', _phone,
        false, false
      )
      returning * into convo_row;
    end if;
  else
    update c1_conversations
       set log          = coalesce(log, '[]'::jsonb) || _message,
           last_updated = now()
     where id = convo_row.id
    returning * into convo_row;
  end if;

  -------------------------------------------------------------------
  -- 2) Load existing linked entities if present (based on stage)
  -------------------------------------------------------------------
  v_stage := coalesce(convo_row.stage, 'address');

  if convo_row.tenant_id is not null then
    select *
    into tenant_row
    from c1_tenants
    where id = convo_row.tenant_id;

    if found then
      v_verification_type := convo_row.verification_type;
    end if;
  end if;

  if convo_row.property_id is not null then
    select *
    into property_row
    from c1_properties
    where id = convo_row.property_id;
  end if;

  if property_row.id is not null
     and property_row.property_manager_id is not null then
    select *
    into pm_row
    from c1_property_managers
    where id = property_row.property_manager_id
    limit 1;

    if found
       and (convo_row.property_manager_id is distinct from pm_row.id) then
      update c1_conversations
         set property_manager_id = pm_row.id,
             last_updated        = now()
       where id = convo_row.id
      returning * into convo_row;
    end if;
  end if;

  v_caller_role := convo_row.caller_role;
  v_caller_tag  := convo_row.caller_tag;

  -------------------------------------------------------------------
  -- 3) ADDRESS SUPER-STAGE
  -------------------------------------------------------------------
  if v_stage = 'address' then
    v_has_prior_out := false;

    if convo_row.log is not null then
      select exists (
               select 1
               from jsonb_array_elements(convo_row.log) elem
               where coalesce(elem->>'direction','') = 'out'
             )
      into v_has_prior_out;
    end if;

    if not v_has_prior_out then
      ai_instruction := 'intake/address';
    else
      if length(trim(v_text_raw)) > 5 and property_row.id is null then
        v_prop_id    := null;
        v_match_type := 'none';

        select c.id, c.match_type
        into v_prop_id, v_match_type
        from public.c1_find_property_candidate(v_text_raw) c
        limit 1;

        if v_prop_id is not null then
          select *
          into property_row
          from c1_properties
          where id = v_prop_id;

          update c1_conversations
             set property_id  = v_prop_id,
                 stage        = 'confirm_property',
                 last_updated = now()
           where id = convo_row.id
          returning * into convo_row;

          if property_row.property_manager_id is not null then
            select *
            into pm_row
            from c1_property_managers
            where id = property_row.property_manager_id
            limit 1;

            if found
               and (convo_row.property_manager_id is distinct from pm_row.id) then
              update c1_conversations
                 set property_manager_id = pm_row.id,
                     last_updated        = now()
               where id = convo_row.id
              returning * into convo_row;
            end if;
          end if;

          ai_instruction := 'intake/confirm_property';
        else
          update c1_conversations
             set stage        = 'address_postcode',
                 last_updated = now()
           where id = convo_row.id
          returning * into convo_row;

          property_row   := null;
          v_prop_id      := null;
          v_match_type   := 'none';

          ai_instruction := 'intake/postcode';
        end if;
      end if;

      if v_stage = 'address'
         and ai_instruction is null then
        ai_instruction := 'intake/address';
      end if;
    end if;
  end if;

  -------------------------------------------------------------------
  -- CONFIRM_PROPERTY
  -------------------------------------------------------------------
  if v_stage = 'confirm_property' then
    if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$' then
      update c1_conversations
         set stage        = 'role',
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'intake/role';

    elsif v_text_lower ~ '^\s*(n|no|nah|nope)\s*$' then
      if convo_row.log is not null then
        select exists(
                 select 1
                 from jsonb_array_elements(convo_row.log) elem
                 where coalesce(elem->>'direction','') = 'out'
                   and position('match that property yet' in coalesce(elem->>'message','')) > 0
               )
        into v_has_prior_postcode_prompt;
      end if;

      if v_has_prior_postcode_prompt then
        update c1_conversations
           set property_id  = null,
               handoff      = true,
               stage        = 'address_unmanaged',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        property_row   := null;
        ai_instruction := 'intake/address_unmanaged';
      else
        update c1_conversations
           set property_id  = null,
               stage        = 'address_postcode',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        property_row   := null;
        ai_instruction := 'intake/postcode';
      end if;

    else
      ai_instruction := 'intake/confirm_property';
    end if;
  end if;

  -------------------------------------------------------------------
  -- ADDRESS_POSTCODE
  -------------------------------------------------------------------
  if v_stage = 'address_postcode' then
    if length(trim(v_text_raw)) > 2 and property_row.id is null then
      v_prop_id    := null;
      v_match_type := 'none';

      select c.id, c.match_type
      into v_prop_id, v_match_type
      from public.c1_find_property_candidate(v_text_raw) c
      limit 1;

      if v_prop_id is not null then
        select *
        into property_row
        from c1_properties
        where id = v_prop_id;

        update c1_conversations
           set property_id  = v_prop_id,
               stage        = 'confirm_property',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        if property_row.property_manager_id is not null then
          select *
          into pm_row
          from c1_property_managers
          where id = property_row.property_manager_id
          limit 1;

          if found
             and (convo_row.property_manager_id is distinct from pm_row.id) then
            update c1_conversations
               set property_manager_id = pm_row.id,
                   last_updated        = now()
             where id = convo_row.id
            returning * into convo_row;
          end if;
        end if;

        ai_instruction := 'intake/confirm_property';
      else
        update c1_conversations
           set handoff      = true,
               stage        = 'address_unmanaged',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'intake/address_unmanaged';
      end if;
    end if;

    if v_stage = 'address_postcode'
       and ai_instruction is null then
      ai_instruction := 'intake/postcode';
    end if;
  end if;

  -------------------------------------------------------------------
  -- ADDRESS_UNMANAGED
  -------------------------------------------------------------------
  if v_stage = 'address_unmanaged' then
    ai_instruction := 'intake/address_unmanaged';
  end if;

  -------------------------------------------------------------------
  -- PHONE_MATCH STAGE
  -------------------------------------------------------------------
  if v_stage = 'phone_match' then
    v_has_prior_out := false;

    if convo_row.log is not null then
      select exists (
               select 1
               from jsonb_array_elements(convo_row.log) elem
               where coalesce(elem->>'direction','') = 'out'
             )
      into v_has_prior_out;
    end if;

    if not v_has_prior_out then
      ai_instruction := 'phone_match/confirm';
    else
      if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$' then
        tenant_verified     := true;
        v_verification_type := 'phone';

        update c1_conversations
           set verification_type = 'phone',
               tenant_confirmed  = true,
               stage             = 'duplicate',
               last_updated      = now()
         where id = convo_row.id
        returning * into convo_row;

        v_stage := 'duplicate';
        v_just_entered_duplicate := true;

      elsif v_text_lower ~ '^\s*(n|no|nah|nope)\s*$' then
        update c1_conversations
           set tenant_id          = null,
               property_id        = null,
               property_manager_id = null,
               verification_type  = null,
               tenant_confirmed   = false,
               stage              = 'address',
               last_updated       = now()
         where id = convo_row.id
        returning * into convo_row;

        tenant_row   := null;
        property_row := null;
        pm_row       := null;

        ai_instruction := 'intake/address';

      else
        ai_instruction := 'phone_match/confirm';
      end if;
    end if;
  end if;

  -------------------------------------------------------------------
  -- 4) NAME STAGE
  -------------------------------------------------------------------
  if v_stage = 'name' then
    if convo_row.caller_name is not null then
      if convo_row.caller_role = 'behalf'
         and property_row.id is not null
         and convo_row.tenant_id is null then

        update c1_conversations
           set stage        = 'rep_tenant_name',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        v_stage := 'rep_tenant_name';

      else
        update c1_conversations
           set stage        = 'duplicate',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        v_stage := 'duplicate';
        v_just_entered_duplicate := true;
      end if;
    else
      ai_instruction := 'intake/name';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 5) REP_TENANT_NAME STAGE
  -------------------------------------------------------------------
  if v_stage = 'rep_tenant_name' then
    if property_row.id is not null then
      v_rep_tenant_id  := null;
      v_rep_match_type := null;

      select c.id, c.match_type
      into v_rep_tenant_id, v_rep_match_type
      from public.c1_find_tenant_candidate(property_row.id, v_text_raw) c
      limit 1;

      if v_rep_tenant_id is not null then
        select *
        into tenant_row
        from c1_tenants
        where id = v_rep_tenant_id
        limit 1;

        v_verification_type := 'rep_candidate';

        update c1_conversations
           set tenant_id         = v_rep_tenant_id,
               verification_type = v_verification_type,
               tenant_confirmed  = false,
               stage             = 'rep_verify_tenant',
               last_updated      = now()
         where id = convo_row.id
        returning * into convo_row;

        v_stage        := 'rep_verify_tenant';
        ai_instruction := 'rep/verify_tenant';

      else
        v_verification_type := 'rep_unmatched';

        update c1_conversations
           set verification_type = v_verification_type,
               tenant_id         = null,
               tenant_confirmed  = false,
               stage             = 'issue',
               last_updated      = now()
         where id = convo_row.id
        returning * into convo_row;

        v_stage        := 'issue';
        ai_instruction := 'collect_issue';
      end if;
    else
      update c1_conversations
         set stage        = 'issue',
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      v_stage        := 'issue';
      ai_instruction := 'collect_issue';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 6) REP_VERIFY_TENANT STAGE
  -------------------------------------------------------------------
  if v_stage = 'rep_verify_tenant' then
    if tenant_row.id is null and convo_row.tenant_id is not null then
      select *
      into tenant_row
      from c1_tenants
      where id = convo_row.tenant_id
      limit 1;
    end if;

    if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$' then
      tenant_verified     := true;
      v_verification_type := 'rep';

      update c1_conversations
         set verification_type = v_verification_type,
             tenant_confirmed  = true,
             stage             = 'duplicate',
             last_updated      = now()
       where id = convo_row.id
      returning * into convo_row;

      v_stage := 'duplicate';
      v_just_entered_duplicate := true;

    elsif v_text_lower ~ '^\s*(n|no|nah|nope)\s*$' then
      tenant_row          := null;
      tenant_verified     := false;
      v_verification_type := 'rep_unmatched';

      update c1_conversations
         set tenant_id         = null,
             verification_type = v_verification_type,
             tenant_confirmed  = false,
             stage             = 'duplicate',
             last_updated      = now()
       where id = convo_row.id
      returning * into convo_row;

      v_stage := 'duplicate';
      v_just_entered_duplicate := true;

    else
      ai_instruction := 'rep/verify_tenant';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 7) ROLE STAGE
  -------------------------------------------------------------------
  if v_stage = 'role' then
    if length(trim(v_text_raw)) > 0 then
      update c1_conversations
         set caller_tag   = trim(v_text_raw),
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      v_caller_tag := convo_row.caller_tag;
    end if;

    if position('behalf' in v_text_lower) > 0 then
      v_verification_type := 'manual';

      update c1_conversations
         set verification_type = v_verification_type,
             tenant_confirmed  = false,
             stage             = 'name',
             last_updated      = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'intake/name';

    else
      tenant_row          := null;
      v_verification_type := null;

      select *
      into tenant_row
      from c1_tenants
      where phone = _phone
        and property_id = property_row.id
      limit 1;

      if found then
        v_verification_type := 'phone_candidate';

        update c1_conversations
           set tenant_id         = tenant_row.id,
               verification_type = v_verification_type,
               tenant_confirmed  = false,
               stage             = 'verify_tenant',
               last_updated      = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verify/tenant';

      else
        v_verification_type := 'manual';

        update c1_conversations
           set verification_type = v_verification_type,
               tenant_confirmed  = false,
               stage             = 'name',
               last_updated      = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'intake/name';
      end if;
    end if;
  end if;

  -------------------------------------------------------------------
  -- 8) VERIFY_TENANT STAGE (phone based)
  -------------------------------------------------------------------
  if v_stage = 'verify_tenant' then
    if convo_row.tenant_id is not null then
      select *
      into tenant_row
      from c1_tenants
      where id = convo_row.tenant_id
      limit 1;
    else
      tenant_row := null;
    end if;

    if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$' then
      tenant_verified     := true;
      v_verification_type := 'phone';

      update c1_conversations
         set verification_type = v_verification_type,
             tenant_confirmed  = true,
             stage             = 'duplicate',
             last_updated      = now()
       where id = convo_row.id
      returning * into convo_row;

      v_stage := 'duplicate';
      v_just_entered_duplicate := true;

    elsif v_text_lower ~ '^\s*(n|no|nah|nope)\s*$' then
      tenant_row          := null;
      tenant_verified     := false;
      v_verification_type := 'manual';

      update c1_conversations
         set tenant_id         = null,
             verification_type = v_verification_type,
             tenant_confirmed  = false,
             stage             = 'name',
             last_updated      = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'intake/name';

    else
      ai_instruction := 'verify/tenant';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 9) DUPLICATE STAGE (enriched tickets + expanded regex)
  -------------------------------------------------------------------
  if v_stage = 'duplicate' then
    if property_row.id is not null then
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'id',                 t.id,
                   'status',             t.status,
                   'description',        t.issue_description,
                   'date_logged',        t.date_logged,
                   'next_action_reason', t.next_action_reason,
                   'scheduled_date',     t.scheduled_date,
                   'contractor_name',    ct.contractor_name,
                   'days_since_logged',  floor(extract(epoch from (now() - t.date_logged)) / 86400)
                 )
                 order by t.date_logged desc
               ),
               '[]'::jsonb
             )
      into tickets
      from c1_tickets t
      left join c1_contractors ct on ct.id = t.contractor_id
      where t.property_id = property_row.id
        and upper(coalesce(t.status,'')) <> 'CLOSED'
        and t.archived = false
        and coalesce(t.next_action_reason, '') <> 'handoff_review'
        and t.date_logged > now() - interval '7 days';
    else
      tickets := '[]'::jsonb;
    end if;

    if (tickets is null or tickets = '[]'::jsonb) then
      update c1_conversations
         set stage        = 'issue',
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'collect_issue';
    else
      if v_just_entered_duplicate then
        ai_instruction := 'ask_confirm_duplicate';
      else
        if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah|same|update|status|same\s+issue|status\s+update)\s*$' then
          ai_instruction := 'duplicate_yes_close';

        elsif v_text_lower ~ '^\s*(n|no|nah|nope|new|different|new\s+issue|different\s+issue)\s*$' then
          update c1_conversations
             set stage        = 'issue',
                 last_updated = now()
           where id = convo_row.id
          returning * into convo_row;

          ai_instruction := 'collect_issue';

        else
          ai_instruction := 'ask_confirm_duplicate';
        end if;
      end if;
    end if;

  else
    if property_row.id is not null and (tickets is null or tickets = '[]'::jsonb) then
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'id',                 t.id,
                   'status',             t.status,
                   'description',        t.issue_description,
                   'date_logged',        t.date_logged,
                   'next_action_reason', t.next_action_reason,
                   'scheduled_date',     t.scheduled_date,
                   'contractor_name',    ct.contractor_name,
                   'days_since_logged',  floor(extract(epoch from (now() - t.date_logged)) / 86400)
                 )
                 order by t.date_logged desc
               ),
               '[]'::jsonb
             )
      into tickets
      from c1_tickets t
      left join c1_contractors ct on ct.id = t.contractor_id
      where t.property_id = property_row.id
        and upper(coalesce(t.status,'')) <> 'CLOSED'
        and t.archived = false
        and coalesce(t.next_action_reason, '') <> 'handoff_review'
        and t.date_logged > now() - interval '7 days';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 10) ISSUE STAGE: detail vs photo loop
  -------------------------------------------------------------------
  if v_stage = 'issue' then
    v_in_photo_mode := false;

    if convo_row.log is not null then
      select exists (
               select 1
               from jsonb_array_elements(convo_row.log) elem
               where coalesce(elem->>'direction','') = 'out'
                 and position(E'\U0001F4F8' in coalesce(elem->>'message','')) > 0
             )
      into v_in_photo_mode;
    end if;

    if v_in_photo_mode then
      if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$'
         or v_text_lower ~ '^\s*(n|no|nah|nope)\s*$'
         or v_text_lower like '%no photos%'
         or v_text_lower like '%no photo%'
         or v_text_lower like '%dont have any%'
         or v_text_lower like '%don''t have any%'
         or v_text_lower ~ '^\s*(done|finished|all done|thats all|that''s all|thats it|that''s it)(\s|[,!.?;:]|$)' then

        update c1_conversations
           set stage        = 'access',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verified/ask_access';
      else
        ai_instruction := 'collect_issue';
      end if;
    else
      ai_instruction := 'collect_issue';
    end if;
  end if;

  -------------------------------------------------------------------
  -- 11) ACCESS / AVAILABILITY / SUMMARY / UPDATES RECIPIENT / HANDOFF
  -------------------------------------------------------------------

  if v_stage = 'access' then
    if v_text_lower ~ '^\s*(y|ye|yes|yep|yeah)\s*$' then
      if convo_row.caller_role = 'tenant' then
        update c1_conversations
           set stage        = 'final_summary',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verified/final_summary';

      elsif convo_row.caller_role = 'behalf' then
        update c1_conversations
           set stage        = 'updates_recipient',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'updates/recipient';

      else
        update c1_conversations
           set stage        = 'final_summary',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verified/final_summary';
      end if;

    elsif v_text_lower ~ '^\s*(n|no|nah|nope)\s*$' then
      update c1_conversations
         set stage        = 'availability',
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'availability/collect_slots';

    else
      ai_instruction := 'verified/ask_access';
    end if;
  end if;

  if v_stage = 'availability' then
    if length(trim(v_text_raw)) > 0 then
      if convo_row.caller_role = 'tenant' then
        update c1_conversations
           set stage        = 'final_summary',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verified/final_summary';

      elsif convo_row.caller_role = 'behalf' then
        update c1_conversations
           set stage        = 'updates_recipient',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'updates/recipient';

      else
        update c1_conversations
           set stage        = 'final_summary',
               last_updated = now()
         where id = convo_row.id
        returning * into convo_row;

        ai_instruction := 'verified/final_summary';
      end if;
    else
      ai_instruction := 'availability/collect_slots';
    end if;
  end if;

  if v_stage = 'final_summary' then
    ai_instruction := 'verified/final_summary';
  end if;

  if v_stage = 'updates_recipient' then
    if convo_row.updates_recipient is not null then
      update c1_conversations
         set stage        = 'final_summary',
             last_updated = now()
       where id = convo_row.id
      returning * into convo_row;

      ai_instruction := 'verified/final_summary';
    else
      ai_instruction := 'updates/recipient';
    end if;
  end if;

  if v_stage = 'handoff' then
    ai_instruction := 'handoff';
  end if;

  -------------------------------------------------------------------
  -- 12) Final tenant_verified flag (for prompt)
  -------------------------------------------------------------------
  tenant_verified := (tenant_row.id is not null) and (convo_row.tenant_confirmed = true);

  -------------------------------------------------------------------
  -- 12b) Room lookup — only if tenant is resolved and has a room
  -------------------------------------------------------------------
  if tenant_row.id is not null and tenant_row.room_id is not null then
    select * into room_row
    from c1_rooms
    where id = tenant_row.room_id;
  end if;

  -------------------------------------------------------------------
  -- 13) Return full context
  -------------------------------------------------------------------
  return jsonb_build_object(
    'tenant',            tenant_row,
    'property',          property_row,
    'property_manager',  pm_row,
    'match_type',        v_match_type,
    'verification_type', v_verification_type,
    'conversation',      convo_row,
    'ai_instruction',    ai_instruction,
    'recent_tickets',    coalesce(tickets, '[]'::jsonb),
    'tenant_verified',   tenant_verified,
    'room',              case when room_row.id is not null then jsonb_build_object(
                           'id',           room_row.id,
                           'room_number',  room_row.room_number,
                           'room_name',    room_row.room_name,
                           'floor',        room_row.floor,
                           'monthly_rent', room_row.monthly_rent
                         ) else null end
  );
end;
$function$;


-- -------------------------------------------------------------
-- 2. c1_create_ticket — populate room_id from tenant assignment
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.c1_create_ticket(_conversation_id uuid, _issue jsonb)
 RETURNS public.c1_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_convo   public.c1_conversations;
  v_images  jsonb := '[]'::jsonb;
  v_access_granted boolean;
  v_ticket  public.c1_tickets;
  v_property_id uuid;
  v_category text;
  v_has_contractor boolean := false;
  v_should_handoff boolean := false;
  v_room_id uuid;                                  -- NEW: room from tenant
begin
  select *
  into v_convo
  from public.c1_conversations
  where id = _conversation_id;

  if not found then
    raise exception 'Conversation % not found', _conversation_id;
  end if;

  if coalesce((_issue->>'has_images')::boolean, false) then
    -- Extract individual image URLs from both array and string formats, deduplicated
    select coalesce(jsonb_agg(distinct to_jsonb(url_val)), '[]'::jsonb)
    into v_images
    from (
      -- Case 1: images is a JSON array -> unnest individual URLs
      -- NOTE: no jsonb_array_length check needed; jsonb_array_elements_text on [] returns 0 rows
      select jsonb_array_elements_text(e->'images') as url_val
      from jsonb_array_elements(v_convo.log) as e
      where jsonb_typeof(e->'images') = 'array'

      union

      -- Case 2: images is a string -> use directly
      select e->>'images' as url_val
      from jsonb_array_elements(v_convo.log) as e
      where jsonb_typeof(e->'images') = 'string'
        and e->>'images' <> ''
        and e->>'images' <> 'unprovided'
    ) sub
    where url_val is not null
      and url_val <> ''
      and url_val <> 'unprovided';
  end if;

  v_access_granted :=
    case _issue->>'access'
      when 'GRANTED' then true
      when 'REFUSED' then false
      else null
    end;

  v_property_id := coalesce(nullif(_issue->>'property_id','')::uuid, v_convo.property_id);
  v_category := _issue->>'category';

  v_should_handoff := coalesce(v_convo.handoff, false);

  -------------------------------------------------------------------
  -- NEW: Resolve room_id from tenant, only if the room still exists
  -------------------------------------------------------------------
  select t.room_id into v_room_id
  from c1_tenants t
  inner join c1_rooms r on r.id = t.room_id
  where t.id = coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id);

  if v_property_id is not null and v_category is not null and v_category <> '' then
    select exists(
      select 1
      from c1_properties p
      where p.id = v_property_id
        and p.contractor_mapping is not null
        and p.contractor_mapping::jsonb ? v_category
        and jsonb_typeof(p.contractor_mapping::jsonb -> v_category) = 'array'
        and jsonb_array_length(p.contractor_mapping::jsonb -> v_category) > 0
    )
    into v_has_contractor;

    if not v_has_contractor then
      v_should_handoff := true;
    end if;
  else
    if v_property_id is null or v_category is null or v_category = '' then
      v_should_handoff := true;
    end if;
  end if;

  insert into public.c1_tickets (
    status,
    date_logged,
    tenant_id,
    property_id,
    issue_description,
    issue_title,
    category,
    priority,
    images,
    conversation_id,
    property_manager_id,
    job_stage,
    access_granted,
    verified_by,
    access,
    availability,
    updates_recipient,
    handoff,
    reporter_role,
    room_id                                         -- NEW
  )
  values (
    'open',
    timezone('utc', now()),
    coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id),
    v_property_id,
    _issue->>'issue_summary',
    _issue->>'issue_title',
    v_category,
    _issue->>'priority',
    v_images,
    v_convo.id,
    coalesce(nullif(_issue->>'property_manager_id','')::uuid, v_convo.property_manager_id),
    'created',
    v_access_granted,
    v_convo.verification_type,
    _issue->>'access',
    coalesce(
      nullif(_issue->>'availability',''),
      'The caller did not give any clear availability or access information.'
    ),
    coalesce(
      _issue->>'updates_recipient',
      v_convo.updates_recipient
    ),
    v_should_handoff,
    coalesce(
      _issue->>'caller_role',
      v_convo.caller_role
    ),
    v_room_id                                       -- NEW
  )
  returning *
  into v_ticket;

  return v_ticket;
end;
$function$;
