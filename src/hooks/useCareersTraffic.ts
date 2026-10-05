import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";

/** One day of candidate-side visits (public.get_careers_traffic). */
export interface CareersTrafficDay {
  day: string; // yyyy-mm-dd
  careers_views: number;
  job_views: number;
  apply_views: number;
}

/**
 * "Is anyone looking?" before the first application lands: daily visits to
 * the careers page, the job pages and the apply / sign-up pages, read from
 * the site's cookieless page counter. Visits the team makes from the staff
 * site are left out server-side. Not available on the showcase schema.
 */
export function useCareersTraffic(days = 14) {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  return useQuery({
    queryKey: ["careers-traffic", user?.id, days],
    enabled: !!user && mode !== undefined && mode !== "showcase",
    staleTime: 60_000,
    queryFn: async (): Promise<CareersTrafficDay[]> => {
      const { data, error } = await supabase.rpc("get_careers_traffic", { p_days: days });
      if (error) throw error;
      return (data ?? []) as CareersTrafficDay[];
    },
  });
}

/** Sum of the three kinds of visit over the last `n` days of the series. */
export function visitsInLast(days: CareersTrafficDay[] | undefined, n: number): number {
  if (!days?.length) return 0;
  return days.slice(-n).reduce((sum, d) => sum + d.careers_views + d.job_views + d.apply_views, 0);
}
