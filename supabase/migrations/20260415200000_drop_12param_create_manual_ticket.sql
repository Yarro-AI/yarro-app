-- Fix BUG-6: Drop the old 12-param c1_create_manual_ticket overload.
-- The 14-param version (with p_maintenance_trade + p_deadline_date) is the correct one.
-- Two overloads with all-default params cause Postgres "ambiguous function" errors
-- when the caller doesn't pass enough args to disambiguate.
--
-- Previous drop attempt (20260414100000) targeted the wrong signature (13-param).
-- This drops the 12-param version (from 20260330100000 compliance_workflow_mvp).

DROP FUNCTION IF EXISTS public.c1_create_manual_ticket(
  uuid, uuid, uuid, uuid[], text, text, text, text, text, text, jsonb, uuid
);
