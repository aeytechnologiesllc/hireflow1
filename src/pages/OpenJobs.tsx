import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageHead } from "@/components/seo/usePageHead";
import { Wordmark } from "@/cockpit/components/Wordmark";
import { jobPagePath } from "@/lib/jobSlug";
import { payWords } from "@/lib/jobPost";
import { hiringLink, withVisitorTags } from "@/lib/hiringLink";
import { placeLine } from "@/lib/jobLocation";

/**
 * Open jobs: hireflownow.com/open-jobs (the owner approved the mock-up,
 * 2026-10-11). Every live job from every business on HireFlow, newest first,
 * each with its business's name and logo; Apply opens that business's own job
 * page. The front page's "Looking for a job?" and "Open jobs" lead here; the
 * home business keeps its own careers page at /careers.
 *
 * Nothing to look after: it reads published_jobs_public, which already leaves
 * out closed jobs and a business that is paused.
 */

interface OpenJob {
  id: string;
  employer_id: string;
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

interface Brand {
  name: string;
  logo: string | null;
}

/** More jobs than this and a search box appears. */
const SEARCH_FROM = 10;

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export default function OpenJobs() {
  const { user, role } = useAuth();
  const [search, setSearch] = useState("");
  usePageHead({
    title: "Open jobs — HireFlow",
    path: "/open-jobs",
    description: "Jobs from businesses hiring on HireFlow, newest first. Apply from your phone or computer; it's free.",
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["open-jobs"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ jobs: OpenJob[]; brands: Map<string, Brand> }> => {
      const { data: rows, error } = await supabase
        .from("published_jobs_public")
        .select("id, employer_id, title, slug, business_slug, root_link, location, is_remote, salary_min, salary_max, salary_currency, salary_period")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const jobs = ((rows ?? []) as OpenJob[]).filter((j) => j.id && j.title);
      const ids = [...new Set(jobs.map((j) => j.employer_id).filter(Boolean))];
      const brands = new Map<string, Brand>();
      if (ids.length > 0) {
        const { data: branding } = await supabase.from("employer_public_branding").select("user_id, company_name, company_logo").in("user_id", ids);
        for (const b of (branding ?? []) as { user_id: string | null; company_name: string | null; company_logo: string | null }[]) {
          if (b.user_id && b.company_name?.trim()) brands.set(b.user_id, { name: b.company_name.trim(), logo: b.company_logo });
        }
      }
      return { jobs, brands };
    },
  });

  const jobs = data?.jobs ?? [];
  const brands = data?.brands ?? new Map<string, Brand>();
  const showSearch = jobs.length > SEARCH_FROM;
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) => j.title.toLowerCase().includes(q) || (brands.get(j.employer_id)?.name ?? "").toLowerCase().includes(q));
  }, [jobs, brands, search]);

  const signedInApplicant = !!user && role === "candidate";

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 sm:py-12" data-open-jobs>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <a href={withVisitorTags("/", window.location.href, document.referrer)} aria-label="HireFlow home" className="text-foreground">
            <Wordmark size={28} />
          </a>
          {signedInApplicant ? (
            <Link to="/applications" className="text-sm font-medium text-muted-foreground hover:text-foreground" data-open-jobs-mine>
              My applications
            </Link>
          ) : (
            <Link to="/candidate/auth?redirect=%2Fapplications" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          )}
        </div>

        <header className="mt-8 max-w-xl">
          <h1 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">Open jobs</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Jobs from businesses hiring on HireFlow. Apply from your phone or computer; it's free.</p>
        </header>

        {isLoading ? (
          <div className="grid place-items-center py-16" aria-busy="true">
            <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading open jobs" />
          </div>
        ) : isError ? (
          <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            We couldn't load the jobs just now.{" "}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground" data-open-jobs-empty>
            No open jobs right now. Check back soon.
          </p>
        ) : (
          <section className="mt-6" aria-labelledby="open-jobs-count">
            {showSearch && (
              <label className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  id="open-jobs-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search jobs or businesses"
                  className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                  aria-label="Search jobs or businesses"
                />
              </label>
            )}
            <h2 id="open-jobs-count" className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {search.trim() ? `${shown.length} of ${jobs.length} open jobs` : `${jobs.length} open job${jobs.length === 1 ? "" : "s"}`}
            </h2>
            {shown.length === 0 ? (
              <p className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">No jobs match &ldquo;{search.trim()}&rdquo;.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {shown.map((job) => {
                  const brand = brands.get(job.employer_id);
                  const name = brand?.name ?? "A business on HireFlow";
                  const where = placeLine(job.location, job.is_remote !== false);
                  const pay = payWords(job);
                  return (
                    <li key={job.id}>
                      <Link
                        to={withVisitorTags(jobPagePath(job), window.location.href, document.referrer)}
                        className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/50 sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:gap-3.5 sm:p-4"
                        data-open-job={job.id}
                      >
                        {brand?.logo ? (
                          <img src={brand.logo} alt="" className="h-10 w-10 rounded-xl object-cover sm:h-11 sm:w-11" />
                        ) : (
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary font-display text-[15px] font-semibold text-primary-foreground sm:h-11 sm:w-11" aria-hidden>
                            {initials(name)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold leading-snug text-foreground">{job.title}</span>
                          <span className="mt-0.5 block text-[13px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">{name}</span>
                            {[where, pay].filter(Boolean).map((part) => ` · ${part}`).join("")}
                          </span>
                        </span>
                        <span className="col-span-2 rounded-lg bg-primary px-3.5 py-2 text-center text-sm font-semibold text-primary-foreground sm:col-span-1">Apply</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <p className="mt-6 flex items-start gap-2.5 rounded-xl bg-primary/10 p-3.5 text-[13px] leading-relaxed text-foreground" data-open-jobs-safety>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>Businesses on HireFlow never ask you to pay to apply or to start. If one does, report it from the job's page.</span>
        </p>

        <footer className="mt-8 text-xs text-muted-foreground">
          Hiring?{" "}
          {/* Tagged like the other pages' links, so Admin → Growth sees what this page brings (the Phase 7 growth audit);
              a visitor's own tags, carried here, win (withVisitorTags; the third growth review). */}
          <a href={withVisitorTags(hiringLink("open_jobs"), window.location.href, document.referrer)} className="font-semibold text-primary hover:underline">
            Post a job free
          </a>
        </footer>
      </div>
    </main>
  );
}
