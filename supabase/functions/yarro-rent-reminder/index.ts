import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendAndLog } from "../_shared/twilio.ts";
import { TEMPLATES, formatFriendlyDate } from "../_shared/templates.ts";

const FN = "yarro-rent-reminder";

// ─── Types ──────────────────────────────────────────────────────────────

interface RentReminder {
  ledger_id: string;
  room_id: string;
  tenant_id: string;
  property_manager_id: string;
  property_id: string;
  due_date: string;
  amount_due: number;
  amount_paid: number;
  status: string;
  reminder_level: number;
  tenant_name: string;
  tenant_phone: string | null;
  property_address: string;
  room_number: string;
}

interface ReminderResult {
  ledger_id: string;
  tenant_name: string;
  reminder_level: number;
  sent: boolean;
  skipped: boolean;
  error?: string;
}

// ─── Template selection ─────────────────────────────────────────────────

const TEMPLATE_BY_LEVEL: Record<number, keyof typeof TEMPLATES> = {
  1: "rent_reminder_before",
  2: "rent_reminder_due",
  3: "rent_reminder_overdue",
};

function isPlaceholder(sid: string): boolean {
  return sid.startsWith("PLACEHOLDER_");
}

// ─── Build WhatsApp variables ───────────────────────────────────────────

function buildVariables(entry: RentReminder): Record<string, string> {
  const amount = `£${Number(entry.amount_due).toFixed(2)}`;
  const dueDateFormatted = formatFriendlyDate(entry.due_date);

  // All 3 templates use: 1=tenant_name, 2=amount
  // Templates 1 and 3 also use: 3=due_date
  return {
    "1": entry.tenant_name || "Tenant",
    "2": amount,
    "3": dueDateFormatted,
  };
}

// ─── Process a single reminder ──────────────────────────────────────────

async function processReminder(
  supabase: SupabaseClient,
  entry: RentReminder,
): Promise<ReminderResult> {
  const templateKey = TEMPLATE_BY_LEVEL[entry.reminder_level];
  const templateSid = templateKey ? TEMPLATES[templateKey] : undefined;

  // Guard: skip if template is a placeholder
  if (!templateSid || isPlaceholder(templateSid)) {
    console.warn(
      `[${FN}] Skipping ledger ${entry.ledger_id} — template ${templateKey} is a placeholder`,
    );
    return {
      ledger_id: entry.ledger_id,
      tenant_name: entry.tenant_name,
      reminder_level: entry.reminder_level,
      sent: false,
      skipped: true,
    };
  }

  // Guard: skip if tenant has no phone
  if (!entry.tenant_phone) {
    console.warn(
      `[${FN}] Skipping ledger ${entry.ledger_id} — tenant ${entry.tenant_name} has no phone`,
    );

    // Still log the skip as an event
    await supabase.rpc("c1_log_system_event", {
      p_pm_id: entry.property_manager_id,
      p_event_type: "RENT_REMINDER_SKIPPED",
      p_property_label: entry.property_address,
      p_metadata: {
        ledger_id: entry.ledger_id,
        tenant_name: entry.tenant_name,
        reminder_level: entry.reminder_level,
        reason: "no_phone",
      },
    });

    return {
      ledger_id: entry.ledger_id,
      tenant_name: entry.tenant_name,
      reminder_level: entry.reminder_level,
      sent: false,
      skipped: true,
    };
  }

  // Send via sendAndLog (audit trail + Telegram alert on failure)
  const variables = buildVariables(entry);
  const result = await sendAndLog(supabase, FN, `reminder_${entry.reminder_level}`, {
    ticketId: null,
    recipientPhone: entry.tenant_phone,
    recipientRole: "tenant",
    messageType: templateKey,
    templateSid: templateSid,
    variables,
  });

  if (!result.ok) {
    return {
      ledger_id: entry.ledger_id,
      tenant_name: entry.tenant_name,
      reminder_level: entry.reminder_level,
      sent: false,
      skipped: false,
      error: result.error,
    };
  }

  // Mark reminder as sent
  const reminderCol =
    entry.reminder_level === 1
      ? "reminder_1_sent_at"
      : entry.reminder_level === 2
        ? "reminder_2_sent_at"
        : "reminder_3_sent_at";

  const updatePayload: Record<string, string> = {
    [reminderCol]: new Date().toISOString(),
  };

  // Overdue flip: if this is reminder 3 and status is still pending, mark overdue
  if (entry.reminder_level === 3 && entry.status === "pending") {
    (updatePayload as Record<string, string>).status = "overdue";
  }

  const { error: updateError } = await supabase
    .from("c1_rent_ledger")
    .update(updatePayload)
    .eq("id", entry.ledger_id);

  if (updateError) {
    console.error(
      `[${FN}] Failed to update ${reminderCol} for ledger ${entry.ledger_id}:`,
      updateError.message,
    );
  }

  // Log event
  const { error: logError } = await supabase.rpc("c1_log_system_event", {
    p_pm_id: entry.property_manager_id,
    p_event_type: "RENT_REMINDER_SENT",
    p_property_label: entry.property_address,
    p_metadata: {
      ledger_id: entry.ledger_id,
      tenant_name: entry.tenant_name,
      room_number: entry.room_number,
      reminder_level: entry.reminder_level,
      amount_due: entry.amount_due,
      due_date: entry.due_date,
    },
  });

  if (logError) {
    console.error(
      `[${FN}] Failed to log event for ledger ${entry.ledger_id}:`,
      logError.message,
    );
  }

  return {
    ledger_id: entry.ledger_id,
    tenant_name: entry.tenant_name,
    reminder_level: entry.reminder_level,
    sent: true,
    skipped: false,
  };
}

// ─── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const supabase = createSupabaseClient();

  try {
    const { data: entries, error: rpcError } = await supabase.rpc(
      "get_rent_reminders_due",
      {},
    );

    if (rpcError) {
      await alertTelegram(FN, "RPC get_rent_reminders_due", rpcError.message);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const reminderEntries = (entries ?? []) as RentReminder[];
    console.log(`[${FN}] Processing ${reminderEntries.length} rent reminders`);

    const results: ReminderResult[] = [];
    for (const entry of reminderEntries) {
      try {
        const result = await processReminder(supabase, entry);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${FN}] Error processing ledger ${entry.ledger_id}:`, msg);
        await alertTelegram(FN, `ledger_${entry.ledger_id}`, msg, {
          tenant: entry.tenant_name,
          property: entry.property_address,
        });
        results.push({
          ledger_id: entry.ledger_id,
          tenant_name: entry.tenant_name,
          reminder_level: entry.reminder_level,
          sent: false,
          skipped: false,
          error: msg,
        });
      }
    }

    const sent = results.filter((r) => r.sent).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.filter((r) => !r.sent && !r.skipped).length;

    // ─── Ticket pass: create/update arrears tickets for overdue tenants ───
    // Runs independently of reminders — even if no WhatsApp reminders are due,
    // overdue tenants still need tickets created/priority escalated.
    let ticketsCreated = 0;
    let ticketsUpdated = 0;
    try {
      const { data: pmRows } = await supabase
        .from("c1_rent_ledger")
        .select("property_manager_id")
        .in("status", ["overdue", "partial"])
        .gte("due_date", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
        .lt("due_date", new Date().toISOString().split("T")[0]);

      const pmIds = [...new Set((pmRows ?? []).map((r: { property_manager_id: string }) => r.property_manager_id))];

      for (const pmId of pmIds) {
        const { data: overdue, error: overdueError } = await supabase.rpc(
          "get_rent_overdue_for_tickets",
          { p_pm_id: pmId },
        );

        if (overdueError) {
          console.error(`[${FN}] get_rent_overdue_for_tickets failed for PM ${pmId}:`, overdueError.message);
          await alertTelegram(FN, "get_rent_overdue_for_tickets", overdueError.message, { pm_id: pmId });
          continue;
        }

        if (!overdue || overdue.length === 0) continue;

        for (const tenant of overdue as Array<{
          tenant_id: string;
          property_manager_id: string;
          property_id: string;
          tenant_name: string;
          property_address: string;
          months_overdue: number;
          total_arrears: number;
          earliest_overdue: string;
          days_overdue: number;
          priority: string;
        }>) {
          const title = `Rent arrears: ${tenant.tenant_name || "Unknown tenant"}`;
          const desc = `${tenant.months_overdue} month(s) overdue, £${Number(tenant.total_arrears).toFixed(2)} total arrears since ${tenant.earliest_overdue} (${tenant.days_overdue} days)`;

          const { data: ticketResult, error: ticketError } = await supabase.rpc("create_rent_arrears_ticket", {
            p_property_manager_id: tenant.property_manager_id,
            p_property_id: tenant.property_id,
            p_tenant_id: tenant.tenant_id,
            p_issue_title: title,
            p_issue_description: desc,
            p_priority: tenant.priority,
          });

          if (ticketError) {
            console.error(`[${FN}] create_rent_arrears_ticket failed for tenant ${tenant.tenant_id}:`, ticketError.message);
            await alertTelegram(FN, "create_rent_arrears_ticket", ticketError.message, {
              tenant: tenant.tenant_name,
              property: tenant.property_address,
            });
            continue;
          }

          const row = Array.isArray(ticketResult) ? ticketResult[0] : ticketResult;
          const isNew = row?.is_new === true;

          if (isNew) {
            ticketsCreated++;
            console.log(`[${FN}] CREATED rent arrears ticket [${tenant.priority}] for ${tenant.tenant_name} at ${tenant.property_address}`);

            await supabase.rpc("c1_log_system_event", {
              p_pm_id: tenant.property_manager_id,
              p_event_type: "RENT_ARREARS_TICKET_CREATED",
              p_property_label: tenant.property_address,
              p_metadata: {
                tenant_name: tenant.tenant_name,
                months_overdue: tenant.months_overdue,
                total_arrears: tenant.total_arrears,
                days_overdue: tenant.days_overdue,
                priority: tenant.priority,
              },
            });
          } else {
            ticketsUpdated++;
            console.log(`[${FN}] UPDATED rent arrears ticket → [${tenant.priority}] for ${tenant.tenant_name} at ${tenant.property_address} (${tenant.days_overdue}d overdue)`);
          }
        }
      }
    } catch (escErr) {
      const msg = escErr instanceof Error ? escErr.message : String(escErr);
      console.error(`[${FN}] Ticket pass error:`, msg);
      await alertTelegram(FN, "Ticket pass", msg);
    }

    const summary = { total: results.length, sent, skipped, failed, ticketsCreated, ticketsUpdated, results };

    console.log(
      `[${FN}] Done: ${sent} sent, ${skipped} skipped, ${failed} failed | Tickets: ${ticketsCreated} created, ${ticketsUpdated} updated`,
    );

    if (sent > 0 || ticketsCreated > 0) {
      const parts: string[] = [];
      if (sent > 0) parts.push(`${sent} reminder(s) sent`);
      if (ticketsCreated > 0) parts.push(`${ticketsCreated} arrears ticket(s) created`);
      await alertInfo(FN, parts.join(", "));
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${FN}] Unhandled error:`, msg);
    await alertTelegram(FN, "Unhandled exception", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
