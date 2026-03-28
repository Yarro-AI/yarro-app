import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient, type SupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";
import { sendWhatsApp } from "../_shared/twilio.ts";
import { TEMPLATES, formatFriendlyDate } from "../_shared/templates.ts";

const FN = "yarro-rent-reminder";

// ─── Types ──────────────────────────────────────────────────────────────

interface RentReminder {
  ledger_id: string;
  room_id: string;
  tenant_id: string;
  property_manager_id: string;
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

  // Send WhatsApp
  const variables = buildVariables(entry);
  const result = await sendWhatsApp(entry.tenant_phone, templateSid, variables);

  if (!result.ok) {
    console.error(
      `[${FN}] WhatsApp failed for ledger ${entry.ledger_id}:`,
      result.error,
    );
    await alertTelegram(FN, `reminder_${entry.reminder_level}`, result.error || "unknown", {
      ledger_id: entry.ledger_id,
      tenant: entry.tenant_name,
      property: entry.property_address,
    });

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
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!entries || entries.length === 0) {
      console.log(`[${FN}] No rent reminders due today`);
      return new Response(
        JSON.stringify({ message: "No rent reminders due", count: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`[${FN}] Processing ${entries.length} rent reminders`);

    const results: ReminderResult[] = [];
    for (const entry of entries as RentReminder[]) {
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

    const summary = { total: results.length, sent, skipped, failed, results };

    console.log(
      `[${FN}] Done: ${sent} sent, ${skipped} skipped, ${failed} failed`,
    );

    if (sent > 0) {
      await alertInfo(
        FN,
        `Rent reminders: ${sent} sent, ${skipped} skipped, ${failed} failed`,
      );
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
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
