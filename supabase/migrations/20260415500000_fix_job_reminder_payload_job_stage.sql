-- Fix: c1_job_reminder_payload still references dropped job_stage column.
-- Replace 'job_stage', t.job_stage with 'next_action_reason', t.next_action_reason.
-- This caused "record t has no field job_stage" error after contractor scheduling.

-- Full function recreated from production with single field change.
-- See c1_job_reminder_payload in 20260327041845_remote_schema.sql for original.

CREATE OR REPLACE FUNCTION public.c1_job_reminder_payload(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  t    c1_tickets%rowtype;
  p    c1_properties%rowtype;
  pm   c1_property_managers%rowtype;
  ten  c1_tenants%rowtype;
  msg  c1_messages%rowtype;
  conv c1_conversations%rowtype;

  contr_row  c1_contractors%rowtype;
  chosen     jsonb;

  access_text           text;
  update_pref           text;
  update_contact_phone  text;
  update_contacts       jsonb := '[]'::jsonb;
begin
  select * into t from c1_tickets where id = p_ticket_id limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'ticket-not-found', 'ticket_id', p_ticket_id);
  end if;

  select * into p from c1_properties where id = t.property_id limit 1;
  select * into pm from c1_property_managers where id = t.property_manager_id limit 1;
  select * into ten from c1_tenants where id = t.tenant_id limit 1;
  select * into msg from c1_messages where ticket_id = p_ticket_id limit 1;

  if t.conversation_id is not null then
    select * into conv from c1_conversations where id = t.conversation_id limit 1;
  end if;

  if t.contractor_id is not null then
    select * into contr_row from c1_contractors where id = t.contractor_id limit 1;
    chosen := jsonb_build_object(
      'id', t.contractor_id::text,
      'contractor_name', contr_row.contractor_name,
      'contractor_email', contr_row.contractor_email,
      'contractor_phone', contr_row.contractor_phone
    );
  else
    chosen := (
      select elem from jsonb_array_elements(coalesce(msg.contractors,'[]'::jsonb)) elem
      where elem->>'manager_decision' = 'approved'
      order by (elem->>'approved_at')::timestamptz desc nulls last limit 1
    );
    if chosen is null then
      chosen := (
        select elem from jsonb_array_elements(coalesce(msg.contractors,'[]'::jsonb)) elem
        where elem->>'status' = 'replied'
        order by (elem->>'replied_at')::timestamptz desc nulls last limit 1
      );
    end if;
    if chosen is not null then
      if (chosen ? 'id') and (nullif(chosen->>'id','') is not null) then
        select * into contr_row from c1_contractors where id = (chosen->>'id')::uuid limit 1;
      end if;
      chosen := jsonb_build_object(
        'id', coalesce(contr_row.id::text, chosen->>'id'),
        'contractor_name', coalesce(contr_row.contractor_name, chosen->>'contractor_name', chosen->>'name'),
        'contractor_email', coalesce(contr_row.contractor_email, chosen->>'contractor_email', chosen->>'email'),
        'contractor_phone', coalesce(contr_row.contractor_phone, chosen->>'contractor_phone', chosen->>'phone')
      );
    end if;
  end if;

  if t.access_granted then
    access_text := nullif(trim(coalesce(p.access_instructions,'')), '');
    if access_text is null then
      access_text := 'Access granted. Instructions will be shared directly if needed.';
    end if;
  else
    access_text := 'Access to be arranged with tenant. If the tenant does not answer, contact the property manager on '
                   || coalesce(pm.phone,'[number]') || '.';
  end if;

  update_pref := lower(coalesce(t.updates_recipient, 'tenant'));
  if coalesce(ten.phone, '') <> '' then
    update_contacts := update_contacts || jsonb_build_object('kind', 'tenant', 'name', ten.full_name, 'phone', ten.phone);
  end if;
  if coalesce(conv.caller_phone, '') <> '' then
    update_contacts := update_contacts || jsonb_build_object('kind', 'caller', 'name', conv.caller_name, 'phone', conv.caller_phone, 'role', conv.caller_role);
  end if;
  if coalesce(pm.phone, '') <> '' then
    update_contacts := update_contacts || jsonb_build_object('kind', 'manager', 'name', pm.name, 'phone', pm.phone);
  end if;
  if update_pref = 'tenant' then
    update_contact_phone := ten.phone;
  else
    update_contact_phone := coalesce(conv.caller_phone, ten.phone, pm.phone);
  end if;

  return jsonb_build_object(
    'ok', true,
    'ticket', jsonb_build_object(
      'id', p_ticket_id,
      'ref', 'T-'||p_ticket_id::text,
      'issue_title', COALESCE(t.issue_title, t.issue_description),
      'issue_description', t.issue_description,
      'category', t.category,
      'priority', t.priority,
      'verified_by', t.verified_by,
      'status', t.status,
      'date_logged', t.date_logged,
      'next_action_reason', t.next_action_reason,
      'images', t.images,
      'access_granted', t.access_granted,
      'contractor_quote', t.contractor_quote,
      'final_amount', t.final_amount,
      'scheduled_date', t.scheduled_date,
      'confirmation_date', t.confirmation_date,
      'tenant_token', t.tenant_token,
      'contractor_token', t.contractor_token
    ),
    'property', jsonb_build_object(
      'id', p.id,
      'address', p.address,
      'landlord_name', p.landlord_name,
      'landlord_phone', p.landlord_phone
    ),
    'tenant', jsonb_build_object(
      'name', ten.full_name,
      'email', ten.email,
      'phone', ten.phone
    ),
    'manager', jsonb_build_object(
      'name', pm.name,
      'phone', pm.phone,
      'email', pm.email
    ),
    'contractor', chosen,
    'access', jsonb_build_object(
      'granted', t.access_granted,
      'text', access_text
    ),
    'update_contact_phone', update_contact_phone,
    'update_contacts', update_contacts
  );
end;
$function$;
