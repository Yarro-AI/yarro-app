-- Update get_onboarding_send_targets to return contact_method + email.
-- Also include email-only entities (no phone but has email + prefers email).

CREATE OR REPLACE FUNCTION public.get_onboarding_send_targets(p_pm_id uuid, p_entity_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_results jsonb;
BEGIN
  IF p_entity_type = 'tenant' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.full_name,
      'phone', t.phone,
      'email', t.email,
      'contact_method', COALESCE(t.contact_method, 'whatsapp'),
      'verification_sent_at', t.verification_sent_at,
      'verified_at', t.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_tenants t
    WHERE t.property_manager_id = p_pm_id
      AND t.verification_sent_at IS NULL
      AND (
        (t.phone IS NOT NULL AND t.phone != '')
        OR (COALESCE(t.contact_method, 'whatsapp') = 'email' AND t.email IS NOT NULL AND t.email != '')
      );

  ELSIF p_entity_type = 'contractor' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.contractor_name,
      'phone', c.contractor_phone,
      'email', c.contractor_email,
      'contact_method', COALESCE(c.contact_method, 'whatsapp'),
      'verification_sent_at', c.verification_sent_at,
      'verified_at', c.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_contractors c
    WHERE c.property_manager_id = p_pm_id
      AND c.verification_sent_at IS NULL
      AND (
        (c.contractor_phone IS NOT NULL AND c.contractor_phone != '')
        OR (COALESCE(c.contact_method, 'whatsapp') = 'email' AND c.contractor_email IS NOT NULL AND c.contractor_email != '')
      );

  ELSIF p_entity_type = 'landlord' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'name', l.full_name,
      'phone', l.phone,
      'email', l.email,
      'contact_method', COALESCE(l.contact_method, 'whatsapp'),
      'verification_sent_at', l.verification_sent_at,
      'verified_at', l.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_landlords l
    WHERE l.property_manager_id = p_pm_id
      AND l.verification_sent_at IS NULL
      AND (
        (l.phone IS NOT NULL AND l.phone != '')
        OR (COALESCE(l.contact_method, 'whatsapp') = 'email' AND l.email IS NOT NULL AND l.email != '')
      );

  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
  END IF;

  RETURN v_results;
END;
$function$;
