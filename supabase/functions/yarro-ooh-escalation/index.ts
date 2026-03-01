import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseClient } from "../_shared/supabase.ts";
import { alertTelegram, alertInfo } from "../_shared/telegram.ts";

const FN = "yarro-ooh-escalation";

// Cron: runs hourly. For each PM with OOH enabled, checks if we're in the
// first hour of their business day. If so, escalates any OOH-dispatched tickets
// that never got a response — sets handoff = true so they appear in the
// handoff banner for the PM to review.

Deno.serve(async (_req: Request) => {
  const supabase = createSupabaseClient();

  try {
    // Find PMs with OOH enabled
    const { data: pms, error: pmErr } = await supabase
      .from("c1_property_managers")
      .select("id, business_hours_start, business_days")
      .eq("ooh_enabled", true);

    if (pmErr) {
      await alertTelegram(FN, "fetch PMs", pmErr.message);
      return new Response(JSON.stringify({ ok: false, error: pmErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!pms || pms.length === 0) {
      return new Response(JSON.stringify({ ok: true, escalated: 0, message: "No OOH-enabled PMs" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let totalEscalated = 0;

    for (const pm of pms) {
      // Check if current time is within the first hour of their business day
      // Using Europe/London as default timezone (matching c1_is_within_business_hours)
      const now = new Date();
      const londonTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));

      const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const currentDay = dayNames[londonTime.getDay()];
      const businessDays: string[] = pm.business_days || ["mon", "tue", "wed", "thu", "fri"];

      if (!businessDays.includes(currentDay)) continue;

      // Parse business_hours_start (e.g. "09:00:00")
      const startParts = (pm.business_hours_start || "09:00:00").split(":");
      const startHour = parseInt(startParts[0], 10);
      const startMinute = parseInt(startParts[1] || "0", 10);

      const currentHour = londonTime.getHours();
      const currentMinute = londonTime.getMinutes();
      const currentTotalMinutes = currentHour * 60 + currentMinute;
      const startTotalMinutes = startHour * 60 + startMinute;

      // Only escalate within first hour of business day
      if (currentTotalMinutes < startTotalMinutes || currentTotalMinutes >= startTotalMinutes + 60) {
        continue;
      }

      // Find OOH-dispatched tickets with no response
      const { data: tickets, error: ticketErr } = await supabase
        .from("c1_tickets")
        .select("id")
        .eq("property_manager_id", pm.id)
        .eq("ooh_dispatched", true)
        .is("ooh_outcome", null)
        .eq("status", "Open")
        .or("handoff.is.null,handoff.eq.false");

      if (ticketErr) {
        await alertTelegram(FN, `fetch tickets for PM ${pm.id}`, ticketErr.message);
        continue;
      }

      if (!tickets || tickets.length === 0) continue;

      // Escalate: set handoff = true
      const ticketIds = tickets.map((t: { id: string }) => t.id);
      const { error: updateErr } = await supabase
        .from("c1_tickets")
        .update({ handoff: true })
        .in("id", ticketIds);

      if (updateErr) {
        await alertTelegram(FN, `escalate tickets for PM ${pm.id}`, updateErr.message, {
          Tickets: ticketIds.join(", "),
        });
        continue;
      }

      totalEscalated += ticketIds.length;

      await alertInfo(FN, `OOH escalation: ${ticketIds.length} ticket(s) for PM ${pm.id}`, {
        Tickets: ticketIds.join(", "),
        Reason: "OOH contact did not respond before business hours",
      });
    }

    return new Response(
      JSON.stringify({ ok: true, escalated: totalEscalated }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
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
