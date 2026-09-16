// The one server-side switch. Every function that can lock, seal, charge or
// show a price as due must read this FIRST and behave exactly like today
// (billing_enabled=false) unless it says otherwise. See
// supabase/migrations/20260916160000_job_billing_schema.sql for the table
// and get_billing_flags() RPC this mirrors on the client side.

export interface BillingFlags {
  billingEnabled: boolean;
  boostEnabled: boolean;
}

const CLOSED: BillingFlags = { billingEnabled: false, boostEnabled: false };

/**
 * Reads app_settings via the service-role admin client (bypasses RLS, same
 * as every other server-only table this project uses). Fails CLOSED: any
 * error (missing row, network blip, table not migrated yet on some branch)
 * returns billing_enabled=false rather than throwing — a read failure must
 * never accidentally turn billing on.
 */
export async function getBillingFlags(supabaseAdmin: {
  from: (table: string) => any;
}): Promise<BillingFlags> {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("billing_enabled, boost_enabled")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return CLOSED;
    return {
      billingEnabled: data.billing_enabled === true,
      boostEnabled: data.boost_enabled === true,
    };
  } catch {
    return CLOSED;
  }
}
