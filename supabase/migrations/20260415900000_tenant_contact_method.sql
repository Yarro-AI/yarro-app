-- Add contact_method to c1_tenants for email/WhatsApp routing parity.
-- Contractors and landlords already have this column.
-- Default is 'whatsapp' to match existing behaviour.

ALTER TABLE c1_tenants
ADD COLUMN IF NOT EXISTS contact_method text NOT NULL DEFAULT 'whatsapp';
