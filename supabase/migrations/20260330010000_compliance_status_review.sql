-- Add 'review' and 'verified' to compliance certificate status constraint
-- 'review' = has info but needs human verification
-- 'verified' = human confirmed certificate is correct

ALTER TABLE public.c1_compliance_certificates
  DROP CONSTRAINT c1_compliance_certificates_status_check;

ALTER TABLE public.c1_compliance_certificates
  ADD CONSTRAINT c1_compliance_certificates_status_check
  CHECK (status = ANY (ARRAY['valid', 'expiring', 'expired', 'missing', 'review', 'verified']));
