// Shared "find or create this user's Stripe customer" — the same lookup
// stripe-checkout/purchase-voice-credits/purchase-blueprint each already
// duplicated by listing customers by email. Centralized here for the new
// job-billing checkout functions (unlock-job, purchase-applicant-pack,
// ava-boost-checkout), and persists the id onto subscriptions.stripe_customer_id
// so every checkout for the same employer reuses one customer.

export interface StripeLike {
  customers: {
    list: (params: { email?: string; limit?: number }) => Promise<{ data: Array<{ id: string }> }>;
    create: (params: { email?: string; metadata?: Record<string, string> }) => Promise<{ id: string }>;
  };
}

export async function getOrCreateStripeCustomerId(
  stripe: StripeLike,
  supabaseAdmin: { from: (table: string) => any },
  user: { id: string; email?: string | null },
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id as string;

  if (user.email) {
    const found = await stripe.customers.list({ email: user.email, limit: 1 });
    if (found.data[0]?.id) {
      await persistCustomerId(supabaseAdmin, user.id, found.data[0].id);
      return found.data[0].id;
    }
  }

  const created = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });
  await persistCustomerId(supabaseAdmin, user.id, created.id);
  return created.id;
}

async function persistCustomerId(supabaseAdmin: { from: (table: string) => any }, userId: string, customerId: string) {
  // upsert without clobbering an existing subscriptions row's other columns:
  // update if present, insert a bare row if this user has never had one
  // (job-billing checkouts can be the very first Stripe touchpoint now that
  // there's no subscription signup step).
  const { data: updated } = await supabaseAdmin
    .from("subscriptions")
    .update({ stripe_customer_id: customerId })
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (!updated) {
    await supabaseAdmin.from("subscriptions").insert({ user_id: userId, stripe_customer_id: customerId });
  }
}
