import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Business names by owner id, from the public branding view, so an
 * applicant's documents say which business asks for what (the 2026-10-11
 * mock-ups, #9: someone who applied to two businesses could not tell who
 * wanted their ID).
 */
export function useCompanyNames(employerIds: ReadonlyArray<string | null | undefined>): Map<string, string> {
  const ids = [...new Set(employerIds.filter((id): id is string => !!id))].sort();
  const { data } = useQuery({
    queryKey: ["company-names", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase.from("employer_public_branding").select("user_id, company_name").in("user_id", ids);
      return new Map(((rows ?? []) as { user_id: string | null; company_name: string | null }[]).filter((r) => r.user_id && r.company_name?.trim()).map((r) => [r.user_id as string, (r.company_name as string).trim()]));
    },
  });
  return data ?? new Map();
}

/** "Lucky Star Support · Team lead", or whichever half is known. */
export function businessJobLine(company: string | null | undefined, jobTitle: string | null | undefined): string | null {
  const parts = [company?.trim(), jobTitle?.trim()].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
