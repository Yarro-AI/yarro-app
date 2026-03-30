-- supabase:disable-transaction
-- Add insurance document types to the certificate_type enum.
-- These are NOT auto-populated — operators add them manually per property.

ALTER TYPE public.certificate_type ADD VALUE IF NOT EXISTS 'building_insurance';
ALTER TYPE public.certificate_type ADD VALUE IF NOT EXISTS 'landlord_insurance';
ALTER TYPE public.certificate_type ADD VALUE IF NOT EXISTS 'rent_guarantee_insurance';
