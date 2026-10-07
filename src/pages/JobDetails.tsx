import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin,
  DollarSign, 
  Building2,
  Calendar,
  Users,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  XCircle,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { format, isPast } from "date-fns";
// This page is the front door — the one a stranger opens from a shared link.
// It was carrying a stock lucide Briefcase as the job's identity mark and in
// three empty states, which candidate/glyphs.tsx bans by name.
import { GlyphJobPost } from "@/components/ava/employerGlyphs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectSchemaMode } from "@/cockpit/data/showcaseSource";
import { fetchRoleById } from "@/lib/showcaseApply";
import { JobPageHead } from "@/components/seo/JobPageHead";
import { isStaffHost } from "@/lib/hosts";
import { jobPagePath, shortLinkFor, slugFromParam, withApplyAsk } from "@/lib/jobSlug";
import { jobLevelLabel, jobTypeLabel } from "@/lib/jobLabels";
import { APPLICANT_BLOCKED_MESSAGE, isApplicantBlockedError } from "@/lib/applicantBlocked";

export default function JobDetails() {
  // Three doors to this one page (docs/SHORT-JOB-LINKS.md): the short link
  // hireflownow.com/<slug>, and the old /candidate/job/:id and /job/:id.
  const { id, slug: slugParam } = useParams<{ id?: string; slug?: string }>();
  const lookupSlug = id ? null : slugFromParam(slugParam);
  const lookupKey = id ?? (lookupSlug ? `slug:${lookupSlug}` : null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { role, user, signOut, loading: authLoading } = useAuth();
  const [isStartingApplication, setIsStartingApplication] = useState(false);

  const isEmployer = role === "employer";
  const applyEntryRoute = role === "candidate" ? "/apply" : "/candidate/apply";
  // Where to send someone whose link led nowhere: the open roles. Both apply
  // routes ask for a job code, and a person who followed a shared link has
  // never had one, so the code box was a dead end dressed up as a way out
  // (for a signed-in candidate too). With one open role the careers page
  // opens it.
  const strandedRoute = "/";
  // This page IS the candidate's view, so it always reads the candidate's
  // source: published_jobs_public. It used to be
  //   !user || role === "candidate"
  // which sent every signed-in NON-candidate to the RLS-locked `jobs` table,
  // whose SELECT policies only cover jobs you own, jobs assigned to you, or
  // developers. So an employer opening another company's public posting — or
  // any signed-in user whose role row had not resolved yet — read nothing and
  // was told "Job Not Found" about a live, public job. It also meant the
  // employer preview rendered the PRIVATE row, so a draft or closed posting
  // previewed as a complete live page under a banner promising this is what
  // candidates see. It is not: candidates see nothing at all.
  const shouldRestrictToPublished = true;
  const { data: schemaMode } = useQuery({
    queryKey: ["cockpit-schema-mode"],
    queryFn: detectSchemaMode,
    staleTime: Infinity,
  });

  const isShowcase = schemaMode === "showcase";

  const { data: showcaseRole, isLoading: showcaseLoading, error: showcaseError } = useQuery({
    queryKey: ["showcase-job-details", id],
    queryFn: () => fetchRoleById(id!),
    enabled: !!id && isShowcase,
  });

  const { data: job, isLoading: hireflowLoading, error: hireflowError, refetch: refetchJob, isFetching: isFetchingJob } = useQuery({
    queryKey: ["job-details", lookupKey, shouldRestrictToPublished],
    queryFn: async () => {
      // maybeSingle, not single: `.single()` raises PGRST116 when there is no
      // row, so a job that doesn't exist and a request that failed arrived as
      // the same error — and the page then told a stranger the job was gone
      // when in truth their connection dropped. `data === null` now means
      // "no such job (or not published)"; a thrown error means "we failed".
      const base = supabase.from("published_jobs_public").select("*");
      const { data, error } = await (id ? base.eq("id", id) : base.eq("slug", lookupSlug!)).maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!lookupKey && !isShowcase,
  });
  
  // Only asked when the public view came back empty AND the viewer is an
  // employer: "this is yours but candidates cannot see it" is a different
  // message from "this link goes nowhere", and only the owner is owed it.
  const { data: ownedButUnpublished } = useQuery({
    queryKey: ["job-owned-unpublished", lookupKey, user?.id],
    queryFn: async () => {
      const base = supabase.from("jobs").select("id, status");
      const { data } = await (id ? base.eq("id", id) : base.eq("slug", lookupSlug!)).maybeSingle();
      return data;
    },
    enabled: !!lookupKey && !isShowcase && isEmployer && !hireflowLoading && !job,
  });

  // Employer company name/logo (for JobPosting structured data hiringOrganization).
  const { data: employerProfile } = useQuery({
    queryKey: ["job-employer-profile", job?.employer_id],
    queryFn: async () => {
      // employer_public_branding, not profiles. This is the page a STRANGER
      // opens from a shared link, and `profiles` is RLS-locked — a signed-out
      // visitor could never read it, so the company name simply never resolved.
      // The query was also gated off on the public path, so on the one route
      // where it matters most it did not even run. The view exists precisely to
      // expose these two fields safely.
      const { data } = await supabase
        .from("employer_public_branding")
        .select("user_id, company_name, company_logo")
        .eq("user_id", job!.employer_id)
        .maybeSingle();
      return data;
    },
    enabled: !!job?.employer_id,
  });

  // Check if application deadline has passed
  const isDeadlinePassed = job?.application_deadline && isPast(new Date(job.application_deadline));

  // An old link (/candidate/job/:id, /job/:id) or a short link typed another
  // way (/Team-Lead/) moves to the job's short link. `replace`, so Back never
  // lands on a page that sends the person forward again. Not on the staff
  // host: the short link lives on the candidates' site, and the team's own
  // preview there stays where it is.
  // shortLinkFor ignores a name the site cannot open (one of its own paths),
  // so such a job stays on the link it has instead of being sent away.
  const shortPath = shortLinkFor(job);
  const forwardTo = shortPath && !isStaffHost() && location.pathname !== shortPath ? shortPath : null;
  useEffect(() => {
    if (!forwardTo || !job) return;
    // The short link's page reads the same row: hand it over, so it opens
    // without a second request or a loading flash.
    queryClient.setQueryData(["job-details", `slug:${job.slug}`, shouldRestrictToPublished], job);
    navigate(`${forwardTo}${location.search}${location.hash}`, { replace: true });
  }, [forwardTo, job, location.search, location.hash, navigate, queryClient, shouldRestrictToPublished]);

  // Apply → sign in → straight into the form (docs/SHORT-JOB-LINKS.md §2).
  // The sign-in screen brings the person back here with ?apply=1, and the
  // application starts by itself, replacing this entry: Back from the form is
  // the job page, never the sign-in screen and never a page that bounces.
  const wantsToApply = searchParams.get("apply") === "1";
  const autoStartedRef = useRef(false);
  const startingByItselfRef = useRef(false);

  // published_jobs_public now selects jobs.benefits (see
  // supabase/migrations/20260916200000_published_jobs_public_benefits.sql),
  // so this reads straight off the real, regenerated column type.
  const jobBenefits = job ? job.benefits : null;


  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null, period?: string | null) => {
    if (!min && !max) return "Competitive Salary";
    const curr = currency || "USD";
    // "a month", not a bare number: a monthly 500 read as a yearly figure is
    // the difference between applying and scrolling past.
    const per = ({ HOUR: " an hour", DAY: " a day", WEEK: " a week", MONTH: " a month", YEAR: " a year" } as Record<string, string>)[(period || "").toUpperCase()] ?? "";
    if (min && max && min === max) return `${curr} ${min.toLocaleString()}${per}`;
    if (min && max) return `${curr} ${min.toLocaleString()} to ${max.toLocaleString()}${per}`;
    if (min) return `${curr} ${min.toLocaleString()}+${per}`;
    return `Up to ${curr} ${max?.toLocaleString()}${per}`;
  };

  const handleStartApplication = async () => {
    // Started by itself (the ?apply=1 return from sign-in): every move
    // replaces this history entry. Pressed by the person: a normal step.
    const automatic = startingByItselfRef.current;
    startingByItselfRef.current = false;
    const go = (to: string) => navigate(to, automatic ? { replace: true } : undefined);

    if (isShowcase && showcaseRole) {
      navigate(`/candidate/apply/${showcaseRole.id}/form`);
      return;
    }

    if (!job) return;

    // The applications INSERT policy is
    //   (auth.uid() = candidate_id) AND has_role(auth.uid(), 'candidate')
    // so an employer's insert is rejected by the database every time. Firing it
    // anyway produced "Failed to start application. Please try again." — untrue
    // twice over: it is not a failure they caused, and retrying can never work.
    // Not just employers. The policy demands has_role(uid,'candidate'), so it
    // also rejects a team_member, a developer, and — the case that actually
    // bites — anyone whose user_roles row has not been written yet, whose role
    // resolves to null. All of them used to get "Failed to start application.
    // Please try again." from the catch below, which is untrue twice: not their
    // failure, and no retry can ever succeed.
    // A stranger arriving from a shared link is not "the wrong kind of account" —
    // they have no account yet. Send them to the candidate door with a way back
    // here, before any role check can mistake them for a signed-in non-candidate.
    // The sign-in screen opens on Sign Up: someone who followed a job's link
    // almost always has no account yet (Sign In is one tap away).
    if (!user) {
      navigate(`/candidate/auth?redirect=${encodeURIComponent(withApplyAsk(jobPagePath(job)))}&tab=signup`);
      return;
    }

    if (role !== "candidate") {
      toast.info(
        isEmployer ? "You're signed in as an employer" : "This account can't apply yet",
        {
          description: isEmployer
            ? "Applications belong to a candidate account. Sign out to apply to this role."
            : "Applying needs a candidate account. Sign out and sign up as a job seeker to continue.",
        },
      );
      return;
    }

    setIsStartingApplication(true);
    try {
      if (user) {
        const { data: existingApp } = await supabase
          .from("applications")
          .select("id, status")
          .eq("job_id", job.id)
          .eq("candidate_id", user.id)
          .maybeSingle();

        if (existingApp) {
          go(`/applications/${existingApp.id}`);
          return;
        }
      }

      const { data: newApp, error: createError } = await supabase
        .from("applications")
        .insert({
          job_id: job.id,
          candidate_id: user.id,
          status: "in_progress",
          phase: "application",
        })
        .select()
        .single();

      if (createError) throw createError;

      // candidateJourney's buildCandidateJourney always synthesizes the
      // application stage with the literal id "application" — it never uses
      // an "application"-typed entry from workflow_steps (that would
      // duplicate the stage, so it's filtered out there). Use the same
      // canonical id here so CandidateStepGate's strict resolveGatedStep
      // check finds it.
      go(`/applications/${newApp.id}/application/application`);
    } catch (err) {
      console.error("Error starting application:", err);
      // An employer who removed and blocked this account: the database says
      // so in its own plain words (applications_refuse_blocked). "Please try
      // again" would be untrue, a retry can never work.
      if (isApplicantBlockedError(err)) {
        toast.error(APPLICANT_BLOCKED_MESSAGE, { duration: 10_000 });
        if (automatic) navigate(location.pathname, { replace: true });
        return;
      }
      toast.error("Failed to start application. Please try again.");
      // Leave the page as a plain job page: the Apply button is the retry.
      if (automatic) navigate(location.pathname, { replace: true });
    } finally {
      setIsStartingApplication(false);
    }
  };

  // The ask carried back from sign-in, answered once: only on the job's own
  // page (an old link moves first, and the moved page answers it), only for a
  // signed-in candidate, and only while the role is open. Anyone else just
  // sees the job, with the ask taken off the address.
  useEffect(() => {
    if (!wantsToApply || autoStartedRef.current || authLoading || !job || forwardTo) return;
    if (user && role === null) return; // the role is still being read
    autoStartedRef.current = true;
    if (user && role === "candidate" && !isDeadlinePassed) {
      startingByItselfRef.current = true;
      void handleStartApplication();
      return;
    }
    if (user) navigate(location.pathname, { replace: true });
    // handleStartApplication is recreated every render; the ref above makes
    // this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsToApply, authLoading, job, forwardTo, user, role, isDeadlinePassed, navigate, location.pathname]);

  // The short link and /candidate/job/:id stand alone; /job/:id sits inside
  // the app's own shell, which brings its padding. Alone, the page keeps its
  // cards off the screen's edges.
  const standalone = !location.pathname.startsWith("/job/");
  const pagePad = standalone ? "px-4 py-6 sm:px-6 sm:py-10" : "";

  // On a phone the one Apply card sits under the job's header. Once it has
  // scrolled up out of sight, the same Apply rises in a slim bar at the
  // bottom, so whoever reads to the end of a long description has it in reach
  // (and it leaves again when the card is back on screen).
  const reduceMotion = useReducedMotion();
  const mobileApplyRef = useRef<HTMLDivElement>(null);
  const [applyScrolledAway, setApplyScrolledAway] = useState(false);
  useEffect(() => {
    const el = mobileApplyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setApplyScrolledAway(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [job?.id, isDeadlinePassed]);

  const isLoading = isShowcase ? showcaseLoading : hireflowLoading;
  const loadError = isShowcase ? showcaseError : hireflowError;
  const activeRole = isShowcase ? showcaseRole : job;

  // An employer used to hit a hard "Candidate Access Only" card here, with no
  // button on it at all — no preview, no sign-out, no way onward. A job posting
  // is PUBLIC: any stranger with the link can read this page, so walling off the
  // one person who wrote it was backwards. It also meant nobody could ever check
  // their own live posting the way a candidate sees it, which is exactly the
  // check you want to run right after publishing. The page now renders for
  // employers too, with an honest banner and a real way through.

  if (isLoading) {
    return (
      <div className={`max-w-4xl mx-auto space-y-6 ${pagePad}`}>
        {/* The bar stands for the Back button, which only a signed-in
            candidate or employer gets; a stranger's page starts with the
            job's header, so a bar here made everything jump up on load. */}
        {(isEmployer || role === "candidate") && <Skeleton className="h-8 w-32" />}
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isShowcase && showcaseRole) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 px-4 py-6">
        <Button variant="ghost" onClick={() => navigate(applyEntryRoute)} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Apply
        </Button>
        <Card className="overflow-hidden border-border">
          <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8">
            <h1 className="text-3xl font-bold text-foreground">{showcaseRole.title}</h1>
            <p className="mt-2 text-muted-foreground">{showcaseRole.location} · {showcaseRole.pay}</p>
            {showcaseRole.role_code && (
              <p className="mt-2 font-mono text-sm text-primary">Code: {showcaseRole.role_code}</p>
            )}
          </div>
          <CardContent className="p-8 space-y-6 sm:p-8">
            {showcaseRole.description && (
              <p className="text-muted-foreground whitespace-pre-wrap">{showcaseRole.description}</p>
            )}
            <Button size="lg" className="w-full h-14 text-lg" onClick={() => navigate(`/candidate/apply/${showcaseRole.id}/form`)}>
              Start application — no account needed
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Already applied?{" "}
              <button type="button" className="text-primary hover:underline" onClick={() => navigate("/candidate/continue")}>
                Continue with your phone
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // A failed request is not a missing job, and this is the page strangers open
  // from a shared link. Collapsing the two told someone whose connection
  // blipped that the role was gone — and then offered them, as their only way
  // forward, a page that asks for a job code they have never had.
  // ONE pair of branches, covering both the showcase and hireflow queries via
  // `activeRole`. There used to be a second, earlier `if (loadError ||
  // !activeRole)` above `isLoading`'s sibling that collapsed both cases into a
  // single "Job Not Found" card — and because `activeRole` IS `job` outside
  // showcase mode, it intercepted every hireflow visitor and made this pair
  // unreachable. Splitting the cases below while that stood meant the split
  // never actually ran.
  if (loadError) {
    return (
      <div className={`flex min-h-[70vh] items-center justify-center ${pagePad}`}>
        <Card className="bg-card border-border max-w-md">
          <CardContent className="space-y-4 p-8 text-center sm:p-8">
            <GlyphJobPost size={48} className="mx-auto opacity-60" style={{ color: "var(--hf-text-muted)" }} />
            <h2 className="text-xl font-semibold text-foreground">We couldn&apos;t load this role</h2>
            <p className="text-muted-foreground">
              The role is still there — the connection dropped on the way. Try again.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={() => refetchJob()} disabled={isFetchingJob} className="gap-2">
                {isFetchingJob ? "Trying again" : "Try again"}
              </Button>
              <Button variant="ghost" onClick={() => navigate(strandedRoute)}>
                See open roles
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeRole) {
    return (
      <div className={`flex min-h-[70vh] items-center justify-center ${pagePad}`}>
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center sm:p-8">
            <GlyphJobPost size={48} className="mx-auto mb-4 opacity-60" style={{ color: "var(--hf-text-muted)" }} />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {ownedButUnpublished ? "Candidates can\u2019t see this yet" : "This role isn\u2019t open"}
            </h2>
            <p className="text-muted-foreground mb-4">
              {ownedButUnpublished
                ? `This posting is ${ownedButUnpublished.status ?? "not published"}, so it has no candidate view yet. Publish it and this link goes live.`
                : "It may have closed, or the link may be incomplete. You can still see the roles that are open."}
            </p>
            {/* "See open roles" moves forward (the careers page, or the one
                open role), so its arrow points forward. */}
            <Button onClick={() => navigate(ownedButUnpublished ? "/jobs" : strandedRoute)}>
              {ownedButUnpublished ? (
                <>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Jobs
                </>
              ) : (
                <>
                  See open roles
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // The Apply card. On a phone it sits right under the job's header, so the
  // one Apply button is on the first screen instead of after the whole
  // description; on a wide screen it heads the sidebar. Only one of the two
  // places is ever shown.
  const applyPanel = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className={`bg-card overflow-hidden ${isDeadlinePassed ? 'border-destructive/50' : 'border-primary/50'}`}>
        <CardContent className="p-6 space-y-4 sm:p-6">
          {isDeadlinePassed ? (
            <>
              <div className="text-center">
                <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                <h3 className="text-lg font-semibold text-foreground">Applications Closed</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The application deadline for this position has passed
                </p>
              </div>
              
              <Button
                disabled
                size="lg"
                variant="outline"
                className="w-full h-14 text-lg font-semibold"
              >
                <XCircle className="h-5 w-5 mr-2" />
                Deadline Passed
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                This job is no longer accepting applications
              </p>
            </>
          ) : (
            <>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-foreground">
                  {isEmployer ? "This is where candidates apply" : "Ready to Apply?"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {isEmployer
                    ? "Sign out above to try it the way an applicant would."
                    : "Start your application and take the first step"}
                </p>
              </div>

              {/* One solid action. The shimmer gradient ran through --accent,
                  which is a pale tint in the light theme, so the label used to
                  disappear across the middle of the button. */}
              <Button
                onClick={handleStartApplication}
                disabled={isStartingApplication}
                size="lg"
                className="w-full h-14 text-lg font-semibold"
              >
                {isStartingApplication ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Starting...
                  </span>
                ) : (
                  "Apply Now"
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Your application will be reviewed by the hiring team
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );

  // The phone's Apply bar is for whoever can apply on this page.
  const stickyApply = standalone && !isEmployer && !isDeadlinePassed;

  return (
    <>
      {job && <JobPageHead job={job} company={employerProfile?.company_name} />}
      <div className={`max-w-4xl mx-auto space-y-6 ${pagePad}`}>
        {/* The page a shared link opens: one job and one Apply button
            (docs/SHORT-JOB-LINKS.md). A stranger gets no back button: the
            browser's Back takes them where they came from, which is right.
            It used to say "Back to Apply" and open the job-code box, which a
            person holding a link has never needed. A signed-in candidate gets
            their own applications; an employer, their postings. */}
        {(isEmployer || role === "candidate") && (
          <Button
            variant="ghost"
            onClick={() => navigate(isEmployer ? "/jobs" : "/applications")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {isEmployer ? "Back to Jobs" : "Your applications"}
          </Button>
        )}

        {/* Say plainly whose view this is, and give a real way through. Without
            this an employer either believes they are seeing what a candidate
            sees (they nearly are, but Apply cannot work for them) or hits a
            refusal they cannot act on. */}
        {isEmployer && (
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--brass-line)", background: "var(--amber-bg)" }}
          >
            <p className="text-sm font-medium text-foreground">
              This is the candidate&apos;s view of your posting
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything below is what an applicant sees. Applying needs a candidate
              account, so the button won&apos;t work while you&apos;re signed in as an employer.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  // Sign out, then land straight back on this posting as a
                  // stranger would see it — the check worth running right after
                  // publishing.
                  const back = location.pathname;
                  await signOut();
                  navigate(back, { replace: true });
                }}
              >
                Sign out and view as a candidate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate("/applicants")}>
                See applicants
              </Button>
            </div>
          </div>
        )}

        {/* Job Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-card border-border overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-8">
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-14 h-14 shrink-0 overflow-hidden rounded-xl bg-primary/20 flex items-center justify-center">
                      {employerProfile?.company_logo ? (
                        <img src={employerProfile.company_logo} alt={employerProfile.company_name ?? "Company logo"} className="h-full w-full object-contain" />
                      ) : (
                        <GlyphJobPost size={28} style={{ color: "var(--hf-green)" }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h1 className="break-words text-3xl font-bold text-foreground [overflow-wrap:anywhere]">{job.title}</h1>
                      {/* Only a real company name. The fallback here was
                          job.department — an internal field — so a stranger
                          could be shown "Operations" where the employer's name
                          belongs, which reads as an anonymous listing and is
                          exactly the pattern job-board scam filters look for.
                          Showing nothing is more honest than showing a
                          department and calling it a company. */}
                      {employerProfile?.company_name && (
                        <p className="mt-1 flex min-w-0 items-center gap-1 text-muted-foreground">
                          <Building2 className="h-4 w-4 shrink-0" />
                          <span className="break-words [overflow-wrap:anywhere]">{employerProfile.company_name}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.location || "Remote"}
                    </Badge>
                    {/* No icon: "Full time" says it already, and the stock
                        briefcase that used to sit here is on the kit's banned
                        list. An icon that adds nothing is not worth a rule.
                        In words, not the stored "full-time" (jobLabels.ts). */}
                    <Badge variant="secondary">
                      {jobTypeLabel(job.job_type) ?? "Full time"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period)}
                    </Badge>
                    {job.experience_level && (
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {jobLevelLabel(job.experience_level)}
                      </Badge>
                    )}
                  </div>

                  {job.application_deadline && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Application deadline: {format(new Date(job.application_deadline), "MMMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        <div className="lg:hidden" ref={mobileApplyRef}>{applyPanel}</div>

        {/* Job Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-6 space-y-6 sm:p-6">
                  {/* Description */}
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">About This Role</h3>
                    <p className="text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{job.description}</p>
                  </div>

                  {/* Responsibilities */}
                  {job.responsibilities && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Responsibilities</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{job.responsibilities}</p>
                    </div>
                  )}

                  {/* Requirements */}
                  {job.requirements && (
                    <div>
                      <h3 className="text-lg font-semibold text-foreground mb-3">Requirements</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{job.requirements}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Apply: here on a wide screen, under the job's header on a phone
                (one visible at a time, see applyPanel). */}
            <div className="hidden lg:block">{applyPanel}</div>

            {/* Skills */}
            {job.skills_required && job.skills_required.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6 sm:p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Required Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {job.skills_required.map((skill, index) => (
                        <Badge key={index} variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Benefits */}
            {jobBenefits && jobBenefits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6 sm:p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Benefits</h3>
                    <ul className="space-y-2">
                      {jobBenefits.map((benefit, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Job Meta */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="p-6 sm:p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Job Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posted</span>
                      <span className="text-foreground">{format(new Date(job.created_at), "MMM d, yyyy")}</span>
                    </div>
                    {/* The code is the team's reference; an applicant never
                        needs one (the job's own link opens it). */}
                    {isEmployer && job.job_code && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Job Code</span>
                        <span className="font-mono text-primary">{job.job_code}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Room under the last card, so the bar below never covers it. */}
        {stickyApply && <div aria-hidden="true" className="h-20 lg:hidden" />}
      </div>

      {/* The phone's Apply bar (see mobileApplyRef). Phones only, only on the
          stand-alone job page (inside the app's shell its own bar is there),
          and only while the role takes applications. */}
      <AnimatePresence>
        {stickyApply && applyScrolledAway && (
          <motion.div
            key="sticky-apply"
            data-testid="sticky-apply"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 pt-3 shadow-[0_-8px_20px_-14px_rgba(0,0,0,0.3)] lg:hidden"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-4xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{job.title}</p>
                {employerProfile?.company_name && (
                  <p className="truncate text-xs text-muted-foreground">{employerProfile.company_name}</p>
                )}
              </div>
              <Button
                onClick={handleStartApplication}
                disabled={isStartingApplication}
                size="lg"
                className="h-12 shrink-0 px-6 text-base font-semibold"
              >
                {isStartingApplication ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </span>
                ) : (
                  "Apply Now"
                )}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
