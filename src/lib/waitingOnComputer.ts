/**
 * waitingOnComputer.ts — the one thing the "Continue on your computer" screen
 * tells the server (docs/COMPUTER-ONLY-TESTS.md, "Staff").
 *
 * When a phone or a tablet reaches a step the computer-only rule covers, the
 * screen shows instead of the test. Until now it wrote nothing, so the hiring
 * team could not tell "has not opened the step" from "stuck at the gate on a
 * phone". This asks public.mark_waiting_on_computer
 * (supabase/migrations/20261006191020_waiting_on_computer.sql) to stamp
 * applications.notes.waiting_on_computer = {step_id, at, device_kind}, which
 * the staff record and the applicants list read as "Waiting to continue on a
 * computer".
 *
 * The server stamps a step at most once and opens no attempt; this file asks
 * once per page load and step, and never fails the screen: a refusal (the
 * step finished meanwhile, an older database without the function) is only
 * logged. Nothing here starts a test, a timer or an integrity record.
 */
import { supabase } from "@/integrations/supabase/client";

const asked = new Set<string>();

export async function markWaitingOnComputer(
  applicationId: string,
  stepId: string,
  deviceKind: "phone" | "tablet",
): Promise<void> {
  if (!applicationId || !stepId) return;
  const key = `${applicationId}\u0000${stepId}`;
  if (asked.has(key)) return;
  asked.add(key);
  try {
    const { error } = await supabase.rpc("mark_waiting_on_computer", {
      p_application_id: applicationId,
      p_step_id: stepId,
      p_device_kind: deviceKind,
    });
    if (error) console.warn("[waitingOnComputer] not stamped:", error.code ?? "", error.message);
  } catch (err) {
    console.warn("[waitingOnComputer] not stamped:", err);
  }
}
