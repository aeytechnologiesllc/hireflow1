import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CAREERS_PATH } from "@/lib/hosts";
import { useAuth } from "@/hooks/useAuth";
import { resolveEmployerIdForJobAccess } from "@/hooks/useJobs";

/**
 * A business's careers page (docs/BUSINESS-TRUST.md, "Each business its own"):
 * hireflownow.com/c/<slug>, and /careers for the home business (the one that
 * runs HireFlow, Zulu Support Team). Rows of public.business_pages, which
 * anyone may read.
 */

export interface BusinessPage {
  employer_id: string;
  slug: string;
  about: string | null;
  home_alias: boolean;
}

const COLUMNS = "employer_id, slug, about, home_alias";

/** Where a business's careers page lives. */
export function careersPathFor(page: Pick<BusinessPage, "slug" | "home_alias"> | null | undefined): string | null {
  if (!page) return null;
  return page.home_alias ? CAREERS_PATH : `/c/${page.slug}`;
}

export function useBusinessPageBySlug(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["business-page", "slug", slug],
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async (): Promise<BusinessPage | null> => {
      const { data, error } = await supabase.from("business_pages" as never).select(COLUMNS).eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return (data as unknown as BusinessPage | null) ?? null;
    },
  });
}

export function useBusinessPageFor(employerId: string | null | undefined) {
  return useQuery({
    queryKey: ["business-page", "employer", employerId],
    enabled: !!employerId,
    staleTime: 60_000,
    queryFn: async (): Promise<BusinessPage | null> => {
      const { data, error } = await supabase.from("business_pages" as never).select(COLUMNS).eq("employer_id", employerId!).maybeSingle();
      if (error) throw error;
      return (data as unknown as BusinessPage | null) ?? null;
    },
  });
}

/** The home business: /careers lists only its jobs. */
export function useHomeBusiness(enabled = true) {
  return useQuery({
    queryKey: ["business-page", "home"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BusinessPage | null> => {
      const { data, error } = await supabase.from("business_pages" as never).select(COLUMNS).eq("home_alias", true).maybeSingle();
      if (error) throw error;
      return (data as unknown as BusinessPage | null) ?? null;
    },
  });
}

/**
 * The business the signed-in person posts jobs for (their own, or the one
 * they are on the team of): its id and careers name, the middle of every job
 * link (/c/<slug>/<job>). The owner's page is made the first time it is
 * needed (ensure_business_page); every business with a job already has one.
 */
export function useOwnBusiness() {
  const { user, role, isTeamMember } = useAuth();
  return useQuery({
    queryKey: ["business-page", "own", user?.id, !!isTeamMember],
    enabled: !!user && (role === "employer" || !!isTeamMember),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ employerId: string; slug: string | null }> => {
      const employerId = await resolveEmployerIdForJobAccess(user!.id, !!isTeamMember);
      const { data } = await supabase.from("business_pages" as never).select("slug").eq("employer_id", employerId).maybeSingle();
      const found = (data as { slug?: string } | null)?.slug ?? null;
      if (found || employerId !== user!.id || role !== "employer") return { employerId, slug: found };
      const { data: made } = await supabase.rpc("ensure_business_page" as never);
      return { employerId, slug: typeof made === "string" ? made : null };
    },
  });
}
