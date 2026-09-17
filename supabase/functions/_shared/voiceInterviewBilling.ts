// Records (and, when it's an overage, charges) one candidate voice
// interview against its job's billing — called once from ava-voice-session,
// right after it mints a real OpenAI session and writes the
// voice_session_log row for it. Never throws: a live candidate interview
// must never be blocked by a billing hiccup (no saved card, a decline,
// Stripe being unreachable) — a failure is recorded on the
// voice_interview_charges row for the employer to see and resolve, and the
// interview proceeds regardless.
//
// While billing is off, this is a no-op — no read, no write — so the app
// behaves exactly as it does today (see the header comment in
// 20260916170000_job_billing_schema.sql for the full pricing model this
// implements: 10 interviews included per job once it's ever been unlocked,
// unmetered before that, $2 each after the 10th).
import Stripe from "https://esm.sh/stripe@14.21.0";
import { getBillingFlags } from "./billingFlags.ts";
import { isNextVoiceInterviewBillable, VOICE_OVERAGE_PRICE_CENTS } from "./jobBillingPricing.ts";

export type VoiceInterviewChargeStatus = "skipped" | "included" | "charged" | "failed";

export interface VoiceInterviewChargeResult {
  billingEnabled: boolean;
  billable: boolean;
  status: VoiceInterviewChargeStatus;
}

// Structural, not the real SupabaseClient type — matches only the
// select()/insert() chains this file calls, as a PromiseLike (a real
// supabase-js call returns a thenable PostgrestFilterBuilder, not a native
// Promise — see _shared/googleIndexing.ts's SupabaseAdminClient for the
// same shape). `data` stays `unknown` rather than a specific row type: the
// real client's resolved row type differs per table/column-list, and a
// concrete shape here only needs to match one call site to break every
// other caller (see git history — voiceInterviewBilling once hard-coded
// SubscriptionPaymentRow here, which broke ava-voice-session's real,
// concretely-typed client on the unrelated job_unlocks/voice_interview_charges
// head-count calls). Callers cast the one field they read after `await`.
// Also: `.select()`'s own return type is deliberately NOT itself
// PromiseLike — every real call here chains at least one `.eq()`/`.in()`
// before it's ever awaited, and making the pre-filter step thenable too
// would force it to resolve to the same shape as the post-filter step,
// which the real builder does not.
interface VoiceBillingFilterBuilder extends PromiseLike<{ data: unknown; count: number | null; error: unknown }> {
  eq: (column: string, value: unknown) => VoiceBillingFilterBuilder;
  in: (column: string, values: unknown[]) => VoiceBillingFilterBuilder;
  maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }>;
}

interface SupabaseAdminLike {
  from: (table: string) => {
    select: (
      columns: string,
      options?: { count?: "exact"; head?: boolean },
    ) => {
      eq: (column: string, value: unknown) => VoiceBillingFilterBuilder;
      in: (column: string, values: unknown[]) => VoiceBillingFilterBuilder;
    };
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
  };
}

export async function recordVoiceInterviewCharge(input: {
  supabaseAdmin: SupabaseAdminLike;
  jobId: string;
  employerId: string;
  applicationId: string | null;
  voiceSessionLogId: string;
  stripeSecretKey: string;
}): Promise<VoiceInterviewChargeResult> {
  const billing = await getBillingFlags(input.supabaseAdmin);
  if (!billing.billingEnabled) {
    return { billingEnabled: false, billable: false, status: "skipped" };
  }

  try {
    const [{ count: unlockCount }, { count: priorCount }] = await Promise.all([
      input.supabaseAdmin.from("job_unlocks").select("id", { count: "exact", head: true }).eq("job_id", input.jobId).eq("status", "active"),
      input.supabaseAdmin
        .from("voice_interview_charges")
        .select("id", { count: "exact", head: true })
        .eq("job_id", input.jobId)
        .in("status", ["included", "charged", "pending"]),
    ]);

    const billable = isNextVoiceInterviewBillable({
      completedUnlockCount: unlockCount ?? 0,
      priorSettledInterviewCount: priorCount ?? 0,
    });
    const ordinal = (priorCount ?? 0) + 1;

    if (!billable) {
      await input.supabaseAdmin.from("voice_interview_charges").insert({
        job_id: input.jobId,
        employer_id: input.employerId,
        application_id: input.applicationId,
        voice_session_log_id: input.voiceSessionLogId,
        ordinal,
        billable: false,
        amount_cents: 0,
        status: "included",
      });
      return { billingEnabled: true, billable: false, status: "included" };
    }

    const { data: subData } = await input.supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, stripe_default_payment_method_id")
      .eq("user_id", input.employerId)
      .maybeSingle();
    const sub = subData as { stripe_customer_id: string | null; stripe_default_payment_method_id: string | null } | null;

    if (!sub?.stripe_customer_id || !sub?.stripe_default_payment_method_id) {
      console.warn("[voiceInterviewBilling] No saved payment method for overage charge; recording as failed, interview proceeds", {
        jobId: input.jobId,
        employerId: input.employerId,
      });
      await input.supabaseAdmin.from("voice_interview_charges").insert({
        job_id: input.jobId,
        employer_id: input.employerId,
        application_id: input.applicationId,
        voice_session_log_id: input.voiceSessionLogId,
        ordinal,
        billable: true,
        amount_cents: 0,
        status: "failed",
      });
      return { billingEnabled: true, billable: true, status: "failed" };
    }

    try {
      const stripe = new Stripe(input.stripeSecretKey, { apiVersion: "2023-10-16" });
      const paymentIntent = await stripe.paymentIntents.create({
        amount: VOICE_OVERAGE_PRICE_CENTS,
        currency: "usd",
        customer: sub.stripe_customer_id,
        payment_method: sub.stripe_default_payment_method_id,
        off_session: true,
        confirm: true,
        description: `HireFlow voice interview overage (job ${input.jobId})`,
        metadata: { kind: "voice_overage", job_id: input.jobId, employer_id: input.employerId },
      });
      await input.supabaseAdmin.from("voice_interview_charges").insert({
        job_id: input.jobId,
        employer_id: input.employerId,
        application_id: input.applicationId,
        voice_session_log_id: input.voiceSessionLogId,
        ordinal,
        billable: true,
        amount_cents: VOICE_OVERAGE_PRICE_CENTS,
        status: "charged",
        stripe_payment_intent_id: paymentIntent.id,
      });
      return { billingEnabled: true, billable: true, status: "charged" };
    } catch (chargeError) {
      console.error("[voiceInterviewBilling] Off-session $2 overage charge failed; interview proceeds regardless:", chargeError);
      await input.supabaseAdmin.from("voice_interview_charges").insert({
        job_id: input.jobId,
        employer_id: input.employerId,
        application_id: input.applicationId,
        voice_session_log_id: input.voiceSessionLogId,
        ordinal,
        billable: true,
        amount_cents: 0,
        status: "failed",
      });
      return { billingEnabled: true, billable: true, status: "failed" };
    }
  } catch (error) {
    console.error("[voiceInterviewBilling] Unexpected error; interview proceeds regardless:", error);
    return { billingEnabled: true, billable: false, status: "skipped" };
  }
}
