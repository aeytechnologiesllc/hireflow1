import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePageHead } from "@/components/seo/usePageHead";
import { useBusinessPageBySlug } from "@/hooks/useBusinessPage";
import { businessSlugFromParam, jobPagePath } from "@/lib/jobSlug";
import { CAREERS_PATH } from "@/lib/hosts";
import { payWords } from "@/lib/jobPost";
import { rememberBusiness } from "@/lib/openRoles";

/**
 * A business's careers page: hireflownow.com/c/<business> (docs/BUSINESS-TRUST.md,
 * "Each business its own"; the approved mock-up of 2026-10-11). Its name, its
 * logo, its line about itself, and only its own open roles, each opening at
 * /c/<business>/<job>. The home business (the one that runs HireFlow) has its
 * own page at /careers, so its address goes there.
 */

interface Role {
  id: string;
  title: string;
  slug: string | null;
  business_slug: string | null;
  root_link: boolean | null;
  location: string | null;
  is_remote: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export default function BusinessCareers() {
  const { business } = useParams<{ business: string }>();
  const location = useLocation();
  const slug = businessSlugFromParam(business);
  const { data: page, isLoading: pageLoading, isError: pageError } = useBusinessPageBySlug(slug);

  const { data: brand } = useQuery({
    queryKey: ["business-careers-brand", page?.employer_id],
    enabled: !!page?.employer_id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("employer_public_branding").select("company_name, company_logo").eq("user_id", page!.employer_id).maybeSingle();
      return data;
    },
  });

  const { data: roles, isLoading: rolesLoading, isError: rolesError } = useQuery({
    queryKey: ["business-careers-roles", page?.employer_id],
    enabled: !!page?.employer_id && !page.home_alias,
    staleTime: 60_000,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("published_jobs_public")
        .select("id, title, slug, business_slug, root_link, location, is_remote, salary_min, salary_max, salary_currency, salary_period")
        .eq("employer_id", page!.employer_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Role[];
    },
  });

  const companyName = (brand?.company_name ?? "").trim();
  const name = companyName || "Careers";
  usePageHead({
    // The same head the server render gives (api/careers-prerender.mjs): an
    // unknown address is plain "HireFlow" and never indexed, a business with
    // no name yet "HireFlow — Careers". Both used to read "Careers — Careers".
    title: !page ? "HireFlow" : `${companyName || "HireFlow"} — Careers`,
    path: slug ? `/c/${slug}` : undefined,
    description: page?.about ?? (companyName ? `Open roles at ${companyName}. Apply online with HireFlow.` : "Open roles. Apply online with HireFlow."),
    noindex: !page,
  });
  // "See open roles" elsewhere comes back here (src/lib/openRoles.ts).
  useEffect(() => {
    if (page && !page.home_alias) rememberBusiness(slug);
  }, [page, slug]);

  if (page?.home_alias) return <Navigate to={`${CAREERS_PATH}${location.search}`} replace />;

  if (!slug || (!pageLoading && !pageError && !page)) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background px-4 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl text-foreground">This careers page doesn't exist</h1>
          <p className="mt-2 text-sm text-muted-foreground">The link may have a typo, or the business changed its address.</p>
        </div>
      </main>
    );
  }

  if (pageLoading || (page && rolesLoading && !rolesError)) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background" aria-busy="true">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading open roles" />
      </div>
    );
  }

  const list = roles ?? [];
  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 sm:py-14" data-business-careers={slug}>
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center gap-3.5">
          {brand?.company_logo ? (
            <img src={brand.company_logo} alt="" className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary font-display text-lg font-semibold text-primary-foreground" aria-hidden>
              {initials(name)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">{name}</h1>
            {page?.about && <p className="mt-0.5 text-sm text-muted-foreground">{page.about}</p>}
          </div>
        </header>

        <section className="mt-8" aria-labelledby="open-roles">
          <h2 id="open-roles" className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Open roles
          </h2>
          {pageError || rolesError ? (
            <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">We couldn't load the open roles just now. Please try again in a moment.</p>
          ) : list.length === 0 ? (
            <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No open roles right now. Check back soon.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2.5">
              {list.map((role) => {
                const where = role.is_remote !== false ? "Remote" : (role.location ?? "").trim() || null;
                const pay = payWords(role);
                return (
                  <li key={role.id}>
                    <Link
                      to={jobPagePath(role)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                      data-business-role={role.slug ?? role.id}
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-foreground">{role.title}</span>
                        {(where || pay) && <span className="mt-0.5 block text-[13px] text-muted-foreground">{[where, pay].filter(Boolean).join(" · ")}</span>}
                      </span>
                      <span className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">Apply</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-xs text-muted-foreground">Hiring with HireFlow</footer>
      </div>
    </main>
  );
}
