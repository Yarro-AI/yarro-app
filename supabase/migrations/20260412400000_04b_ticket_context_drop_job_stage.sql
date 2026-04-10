-- Sprint B, Step 4b: Remove job_stage from c1_ticket_context return type
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Column was dropped in 04_drop_job_stage.sql; this RPC still referenced it.
-- Must DROP first because return type is changing.

DROP FUNCTION IF EXISTS public.c1_ticket_context(uuid);

CREATE OR REPLACE FUNCTION public.c1_ticket_context(ticket_uuid uuid)
 RETURNS TABLE(
   handoff boolean, is_matched_tenant boolean, has_images boolean,
   tenant_name text, tenant_phone text, tenant_email text, tenant_role_tag text, tenant_verified_by text,
   property_id uuid, property_address text, property_manager_id uuid,
   manager_name text, manager_phone text, manager_email text, business_name text,
   landlord_id uuid, landlord_name text, landlord_email text, landlord_phone text,
   access_instructions text, emergency_access_contact text,
   auto_approve_limit numeric, contractor_mapping jsonb,
   ticket_id uuid, ticket_status text, date_logged timestamp with time zone,
   issue_description text, category text, maintenance_trade text,
   priority text, access text, access_granted boolean,
   availability text, reporter_role text, updates_recipient text,
   caller_name text, caller_phone text, caller_role text, caller_tag text,
   recipient jsonb, update_contact jsonb, tenant_contact jsonb,
   conversation_id uuid, label text
 )
 LANGUAGE sql
 STABLE
AS $function$
  select
    t.handoff as handoff,
    (t.tenant_id is not null) as is_matched_tenant,
    coalesce(jsonb_array_length(t.images::jsonb) > 0, false) as has_images,

    ten.full_name   as tenant_name,
    ten.phone       as tenant_phone,
    ten.email       as tenant_email,
    ten.role_tag    as tenant_role_tag,
    ten.verified_by as tenant_verified_by,

    t.property_id              as property_id,
    p.address                  as property_address,
    t.property_manager_id      as property_manager_id,
    pm.name                    as manager_name,
    pm.phone                   as manager_phone,
    pm.email                   as manager_email,
    pm.business_name           as business_name,
    p.landlord_id              as landlord_id,
    COALESCE(l.full_name, p.landlord_name)   as landlord_name,
    COALESCE(l.email,     p.landlord_email)  as landlord_email,
    COALESCE(l.phone,     p.landlord_phone)  as landlord_phone,
    p.access_instructions      as access_instructions,
    p.emergency_access_contact as emergency_access_contact,

    p.auto_approve_limit        as auto_approve_limit,
    p.contractor_mapping::jsonb as contractor_mapping,

    t.id                as ticket_id,
    t.status            as ticket_status,
    t.date_logged       as date_logged,
    t.issue_description as issue_description,
    t.category          as category,
    t.maintenance_trade as maintenance_trade,
    t.priority          as priority,
    t.access            as access,
    t.access_granted    as access_granted,
    t.availability      as availability,
    t.reporter_role     as reporter_role,
    t.updates_recipient as updates_recipient,

    convo.caller_name   as caller_name,
    convo.caller_phone  as caller_phone,
    convo.caller_role   as caller_role,
    convo.caller_tag    as caller_tag,

    case
      when t.updates_recipient = 'tenant' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
    end as recipient,

    case
      when t.updates_recipient = 'tenant' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      when t.updates_recipient = 'caller' then
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
      when t.updates_recipient is null
           and t.reporter_role = 'tenant'
           and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
    end as update_contact,

    case
      when t.reporter_role = 'behalf' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else null
    end as tenant_contact,

    t.conversation_id as conversation_id,
    (convo.log -> 0 ->> 'label')::text as label

  from c1_tickets t
  left join c1_tenants ten
    on ten.id = t.tenant_id
  left join c1_conversations convo
    on convo.id = t.conversation_id
  left join c1_properties p
    on p.id = t.property_id
  left join c1_property_managers pm
    on pm.id = t.property_manager_id
  left join c1_landlords l
    on l.id = p.landlord_id
  where t.id = ticket_uuid;
$function$;
