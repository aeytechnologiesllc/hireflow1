import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { subDays, format } from "date-fns";

export interface PageViewRow {
  day: string;
  path: string;
  referrer_host: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  device_class: string;
  view_count: number;
}

export interface PageViewSummary {
  dailyTotals: { date: string; count: number }[];
  topPages: { path: string; count: number }[];
  topReferrers: { host: string; count: number }[];
  topUtmSources: { source: string; count: number }[];
  totalViews: number;
}

// See the matching comment in useClientErrorEvents.ts: page_view_daily is
// not in the generated Database type yet because it's generated from the
// live DB and this migration hasn't been applied there. RLS gates real
// access, not this cast.
const db = supabase as unknown as {
  from(table: "page_view_daily"): {
    select: (cols: string) => {
      gte: (col: string, value: string) => Promise<{ data: PageViewRow[] | null; error: unknown }>;
    };
  };
};

const DAYS_BACK = 30;

export function usePageViewAnalytics() {
  const { role } = useAuth();
  const isDeveloper = (role as string) === "developer";

  return useQuery({
    queryKey: ["developer-page-view-analytics"],
    queryFn: async (): Promise<PageViewSummary> => {
      const since = format(subDays(new Date(), DAYS_BACK - 1), "yyyy-MM-dd");
      const { data, error } = await db
        .from("page_view_daily")
        .select("day, path, referrer_host, utm_source, utm_medium, utm_campaign, device_class, view_count")
        .gte("day", since);
      if (error) throw error;
      const rows = data ?? [];

      const byDay = new Map<string, number>();
      const byPath = new Map<string, number>();
      const byReferrer = new Map<string, number>();
      const byUtmSource = new Map<string, number>();
      let totalViews = 0;

      for (const row of rows) {
        totalViews += row.view_count;
        byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.view_count);
        byPath.set(row.path, (byPath.get(row.path) ?? 0) + row.view_count);
        if (row.referrer_host) {
          byReferrer.set(row.referrer_host, (byReferrer.get(row.referrer_host) ?? 0) + row.view_count);
        }
        if (row.utm_source) {
          byUtmSource.set(row.utm_source, (byUtmSource.get(row.utm_source) ?? 0) + row.view_count);
        }
      }

      const dailyTotals = Array.from({ length: DAYS_BACK }, (_, i) => {
        const date = format(subDays(new Date(), DAYS_BACK - 1 - i), "yyyy-MM-dd");
        return { date, count: byDay.get(date) ?? 0 };
      });

      const topN = (m: Map<string, number>, n = 10) =>
        Array.from(m.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, n);

      return {
        dailyTotals,
        topPages: topN(byPath).map(([path, count]) => ({ path, count })),
        topReferrers: topN(byReferrer).map(([host, count]) => ({ host, count })),
        topUtmSources: topN(byUtmSource).map(([source, count]) => ({ source, count })),
        totalViews,
      };
    },
    enabled: isDeveloper,
    staleTime: 60 * 1000,
  });
}
