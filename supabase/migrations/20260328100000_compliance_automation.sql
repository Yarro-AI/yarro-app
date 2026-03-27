-- ============================================================
-- Compliance Automation — Phase 2
-- Adds reminder + contractor dispatch columns, updates RPCs,
-- creates get_compliance_expiring and c1_log_compliance_event
-- ============================================================

-- ─── A1. New columns on c1_compliance_certificates ──────────

ALTER TABLE c1_compliance_certificates
  ADD COLUMN IF NOT EXISTS reminder_days_before integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES c1_contractors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- ─── A2. Update compliance_upsert_certificate ───────────────
-- Adds p_reminder_days_before and p_contractor_id params.
-- reminder_sent_at is NOT carried forward — the delete-then-insert
-- pattern means it defaults to NULL on every upsert, which
-- correctly re-enables reminders when a cert is replaced.

-- Must DROP first because we're adding new parameters
DROP FUNCTION IF EXISTS public.compliance_upsert_certificate(uuid, uuid, text, date, date, text, text, text);

CREATE OR REPLACE FUNCTION public.compliance_upsert_certificate(
  p_property_id uuid,
  p_pm_id uuid,
  p_certificate_type text,
  p_issued_date date DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_certificate_number text DEFAULT NULL,
  p_issued_by text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reminder_days_before integer DEFAULT 60,
  p_contractor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- Delete existing certificate of same type for this property (upsert behavior)
  DELETE FROM c1_compliance_certificates
  WHERE property_id = p_property_id
    AND property_manager_id = p_pm_id
    AND certificate_type = p_certificate_type::public.certificate_type;

  -- Insert new certificate (reminder_sent_at defaults to NULL — re-enables reminders)
  INSERT INTO c1_compliance_certificates (
    property_id,
    property_manager_id,
    certificate_type,
    issued_date,
    expiry_date,
    certificate_number,
    issued_by,
    notes,
    reminder_days_before,
    contractor_id
  ) VALUES (
    p_property_id,
    p_pm_id,
    p_certificate_type::public.certificate_type,
    p_issued_date,
    p_expiry_date,
    p_certificate_number,
    p_issued_by,
    p_notes,
    p_reminder_days_before,
    p_contractor_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ─── A3. Update compliance_get_certificates ──────────────────
-- Now returns reminder_days_before, contractor_id, reminder_sent_at

-- Must DROP first because return type is changing (new columns)
DROP FUNCTION IF EXISTS public.compliance_get_certificates(uuid, uuid);

CREATE OR REPLACE FUNCTION public.compliance_get_certificates(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  property_manager_id uuid,
  certificate_type text,
  issued_date date,
  expiry_date date,
  certificate_number text,
  issued_by text,
  document_url text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  reminder_days_before integer,
  contractor_id uuid,
  reminder_sent_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.property_id,
    c.property_manager_id,
    c.certificate_type::text,
    c.issued_date,
    c.expiry_date,
    c.certificate_number,
    c.issued_by,
    c.document_url,
    c.notes,
    c.created_at,
    c.updated_at,
    CASE
      WHEN c.expiry_date IS NULL THEN 'missing'
      WHEN c.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN c.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring'
      ELSE 'valid'
    END AS status,
    c.reminder_days_before,
    c.contractor_id,
    c.reminder_sent_at
  FROM c1_compliance_certificates c
  WHERE c.property_id = p_property_id
    AND c.property_manager_id = p_pm_id
  ORDER BY c.expiry_date ASC NULLS FIRST;
$$;

-- ─── A4. New RPC: c1_log_compliance_event ────────────────────
-- Logs to c1_events without requiring a ticket_id.
-- Needed because c1_log_event resolves portfolio_id from c1_tickets,
-- and compliance notifications may not have an associated ticket.

CREATE OR REPLACE FUNCTION public.c1_log_compliance_event(
  p_pm_id uuid,
  p_event_type text,
  p_property_label text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO c1_events (
    portfolio_id,
    ticket_id,
    event_type,
    actor_type,
    actor_name,
    property_label,
    metadata
  ) VALUES (
    p_pm_id,
    NULL,
    p_event_type,
    'SYSTEM',
    NULL,
    p_property_label,
    p_metadata
  );
END;
$$;

-- ─── A5. New RPC: get_compliance_expiring ────────────────────
-- Returns certificates approaching expiry within their reminder window,
-- where no reminder has been sent yet. Used by the compliance-reminder cron.

CREATE OR REPLACE FUNCTION public.get_compliance_expiring(
  p_days_ahead integer DEFAULT 90,
  p_pm_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cert_id uuid,
  property_id uuid,
  property_manager_id uuid,
  certificate_type text,
  expiry_date date,
  reminder_days_before integer,
  contractor_id uuid,
  days_remaining integer,
  property_address text,
  pm_name text,
  pm_phone text,
  pm_email text,
  contractor_name text,
  contractor_phone text,
  contractor_email text,
  contractor_contact_method text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    c.id AS cert_id,
    c.property_id,
    c.property_manager_id,
    c.certificate_type::text,
    c.expiry_date,
    c.reminder_days_before,
    c.contractor_id,
    (c.expiry_date - CURRENT_DATE)::integer AS days_remaining,
    p.address AS property_address,
    pm.name AS pm_name,
    pm.phone AS pm_phone,
    pm.email AS pm_email,
    con.contractor_name,
    con.contractor_phone,
    con.contractor_email,
    con.contact_method AS contractor_contact_method
  FROM c1_compliance_certificates c
  JOIN c1_properties p ON p.id = c.property_id
  JOIN c1_property_managers pm ON pm.id = c.property_manager_id
  LEFT JOIN c1_contractors con ON con.id = c.contractor_id
  WHERE
    -- Not already expired
    c.expiry_date > CURRENT_DATE
    -- Within this cert's reminder window
    AND c.expiry_date <= CURRENT_DATE + (c.reminder_days_before * interval '1 day')
    -- No reminder sent yet
    AND c.reminder_sent_at IS NULL
    -- Optional PM filter
    AND (p_pm_id IS NULL OR c.property_manager_id = p_pm_id)
  ORDER BY c.expiry_date ASC;
$$;
