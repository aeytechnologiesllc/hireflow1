// The one server-side switch. Every function that can lock, seal, charge or
// show a price as due must read this FIRST and behave exactly like today
// (billing_enabled=false) unless it says otherwise. See
// supabase/migrations/20260916170000_job_billing_schema.sql for the table
// and get_billing_flags() RPC this mirrors on the client side.

export interface BillingFlags {
  billingEnabled: boolean;
  boostEnabled: boolean;
}

const CLOSED: BillingFlags = { billingEnabled: false, boostEnabled: false };

/**
 * Reads app_settings via the service-role admin client (bypasses RLS, same
 * as every other server-only table this project uses). app_settings is a
 * generic key/value table (`key text primary key, value jsonb`) shared with
 * fix/w1-coaching-report's 'blueprint_paid' key — billing_enabled and
 * boost_enabled are two more rows in it, not columns. Fails CLOSED: any
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
      .select("key, value")
      .in("key", ["billing_enabled", "boost_enabled"]);
    if (error || !Array.isArray(data)) return CLOSED;
    const byKey = new Map(data.map((row: { key: string; value: unknown }) => [row.key, row.value]));
    return {
      billingEnabled: byKey.get("billing_enabled") === true,
      boostEnabled: byKey.get("boost_enabled") === true,
    };
  } catch {
    return CLOSED;
  }
}
