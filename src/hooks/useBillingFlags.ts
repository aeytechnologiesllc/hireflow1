import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BillingFlags {
  billingEnabled: boolean;
  boostEnabled: boolean;
}

const CLOSED: BillingFlags = { billingEnabled: false, boostEnabled: false };

/**
 * The one server-side switch (and Boost's own), read straight from Postgres
 * via the public.get_billing_flags() RPC — see
 * supabase/migrations/20260916160000_job_billing_schema.sql. Two booleans,
 * no auth required, safe to call from anywhere. Fails closed: any error
 * (network, RPC missing on an older branch) reads as "billing is off" so a
 * fetch failure can never accidentally reveal billing UI.
 */
export function useBillingFlags() {
  return useQuery({
    queryKey: ["billing-flags"],
    queryFn: async (): Promise<BillingFlags> => {
      const { data, error } = await supabase.rpc("get_billing_flags");
      if (error || !data) return CLOSED;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return CLOSED;
      return {
        billingEnabled: row.billing_enabled === true,
        boostEnabled: row.boost_enabled === true,
      };
    },
    staleTime: 60_000,
    retry: 1,
    // Never let a loading/error state block other UI — treat "not yet known" as closed.
    placeholderData: CLOSED,
  });
}
