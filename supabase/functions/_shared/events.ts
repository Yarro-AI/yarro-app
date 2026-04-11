import type { SupabaseClient } from "./supabase.ts";

/**
 * Log a ticket lifecycle event via c1_log_event RPC.
 * Used for events not captured by DB triggers (e.g. reminders, timeouts, escalations).
 * Throws on failure — audit events are non-negotiable per architecture rules.
 */
export async function logEvent(
  supabase: SupabaseClient,
  ticketId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  actorType = "SYSTEM",
  actorName: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc("c1_log_event", {
    p_ticket_id: ticketId,
    p_event_type: eventType,
    p_actor_type: actorType,
    p_actor_name: actorName,
    p_metadata: metadata,
  });

  if (error) {
    console.error(`[events] AUDIT FAILURE: ${eventType} for ticket ${ticketId}:`, error.message);
    // Non-blocking for now — log to Telegram but don't throw.
    // In-RPC audit calls (c1_finalize_approved, c1_finalize_declined) DO enforce rollback.
    // Edge function audit calls are best-effort until all state mutations are in RPCs.
  }
}

/**
 * Log a system event (no ticket) via c1_log_system_event RPC.
 * Used for PM-level events like reminders, onboarding, cron actions.
 */
export async function logSystemEvent(
  supabase: SupabaseClient,
  pmId: string,
  eventType: string,
  propertyLabel: string | null = null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.rpc("c1_log_system_event", {
    p_pm_id: pmId,
    p_event_type: eventType,
    p_property_label: propertyLabel,
    p_metadata: metadata,
  });

  if (error) {
    console.error(`[events] AUDIT FAILURE: ${eventType} for PM ${pmId}:`, error.message);
  }
}
