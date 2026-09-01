import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  XCircle,
  Loader2,
  AlertTriangle
} from "lucide-react";
import { motion } from "framer-motion";
import { format, isPast } from "date-fns";
// This page is the front door — the one a stranger opens from a shared link.
// It was carrying a stock lucide Briefcase as the job's identity mark and in
// three empty states, which candidate/glyphs.tsx bans by name.
import { GlyphJobPost } from "@/components/ava/employerGlyphs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { detectSchemaMode } from "@/cockpit/data/showcaseSource";
import { fetchRoleById } from "@/lib/showcaseApply";
import { JobPostingJsonLd } from "@/components/seo/JobPostingJsonLd";

export default function JobDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user, signOut } = useAuth();
  const [isStartingApplication, setIsStartingApplication] = useState(false);
  const [applicantLimitReached, setApplicantLimitReached] = useState(false);
  const [isCheckingLimit, setIsCheckingLimit] = useState(false);

  const isEmployer = role === "employer";
  const applyEntryRoute = role === "candidate" ? "/apply" : "/candidate/apply";
  // Where to send someone whose link led nowhere. Both apply routes ask for a
  // job code; a stranger who followed a shared link has never had one, so that
  // was a dead end dressed up as a way out. Signed-out visitors get the
  // candidate portal instead, which is an actual starting point.
  const strandedRoute = user ? applyEntryRoute : "/candidate";
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
    queryKey: ["job-details", id, shouldRestrictToPublished],
    queryFn: async () => {
      // maybeSingle, not single: `.single()` raises PGRST116 when there is no
      // row, so a job that doesn't exist and a request that failed arrived as
      // the same error — and the page then told a stranger the job was gone
      // when in truth their connection dropped. `data === null` now means
      // "no such job (or not published)"; a thrown error means "we failed".
      const { data, error } = await supabase
        .from("published_jobs_public")
        .select("*")
        .eq("id", id!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id && !isShowcase,
  });
  
  // Only asked when the public view came back empty AND the viewer is an
  // employer: "this is yours but candidates cannot see it" is a different
  // message from "this link goes nowhere", and only the owner is owed it.
  const { data: ownedButUnpublished } = useQuery({
    queryKey: ["job-owned-unpublished", id, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("jobs")
        .select("id, status")
        .eq("id", id!)
        .maybeSingle();
      return data;
    },
    enabled: !!id && !isShowcase && isEmployer && !hireflowLoading && !job,
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

  // Check applicant limit when job loads
  useEffect(() => {
    const checkApplicantLimit = async () => {
      if (!job || isEmployer) return;
      
      setIsCheckingLimit(true);
      try {
        const { data, error } = await supabase.functions.invoke("check-applicant-limit", {
          body: { jobId: job.id },
        });
        
        if (error) {
          console.error("Error checking applicant limit:", error);
          return;
        }
        
        setApplicantLimitReached(data?.limitReached || false);
      } catch (err) {
        console.error("Failed to check applicant limit:", err);
      } finally {
        setIsCheckingLimit(false);
      }
    };

    checkApplicantLimit();
  }, [job, isEmployer]);

  const formatSalary = (min?: number | null, max?: number | null, currency?: string | null) => {
    if (!min && !max) return "Competitive Salary";
    const curr = currency || "USD";
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    return `Up to ${curr} ${max?.toLocaleString()}`;
  };

  const handleStartApplication = async () => {
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
          navigate(`/applications/${existingApp.id}`);
          return;
        }
      }

      // Accountless hireflow1 path: the full phase engine still requires auth.
      // Send them to candidate auth with a return path back to this job, rather
      // than a dead route. After signing in they land here and apply for real.
      if (!user) {
        const back = `/candidate/job/${job.id}`;
        navigate(`/candidate/auth?redirect=${encodeURIComponent(back)}`);
        return;
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

      const workflowSteps = job.workflow_steps as Array<{ id: string; type: string }> | null;
      const applicationStep = workflowSteps?.find(s => s.type === "application");
      const stepId = applicationStep?.id || "application";

      navigate(`/applications/${newApp.id}/application/${stepId}`);
    } catch (err) {
      console.error("Error starting application:", err);
      toast.error("Failed to start application. Please try again.");
    } finally {
      setIsStartingApplication(false);
    }
  };

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
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
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
          <CardContent className="p-8 space-y-6">
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
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
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
                {user ? "Back to Apply" : "Browse HireFlow"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeRole) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <GlyphJobPost size={48} className="mx-auto mb-4 opacity-60" style={{ color: "var(--hf-text-muted)" }} />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {ownedButUnpublished ? "Candidates can\u2019t see this yet" : "This role isn\u2019t available"}
            </h2>
            <p className="text-muted-foreground mb-4">
              {ownedButUnpublished
                ? `This posting is ${ownedButUnpublished.status ?? "not published"}, so it has no candidate view yet. Publish it and this link goes live.`
                : user
                ? "This job may no longer be available or the link is invalid."
                : "It may have closed, or the link may be incomplete. You can still see what HireFlow is about."}
            </p>
            <Button onClick={() => navigate(ownedButUnpublished ? "/jobs" : strandedRoute)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {ownedButUnpublished ? "Back to Jobs" : user ? "Back to Apply" : "Browse HireFlow"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {job && (
        <JobPostingJsonLd job={job} company={employerProfile?.company_name} logo={employerProfile?.company_logo} />
      )}
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button — "Back to Apply" is meaningless to an employer, who
            came from their own postings list. */}
        <Button
          variant="ghost"
          onClick={() => navigate(isEmployer ? "/jobs" : applyEntryRoute)}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {isEmployer ? "Back to Jobs" : "Back to Apply"}
        </Button>

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
                  const back = `/candidate/job/${id}`;
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
                    {/* No icon: "Full-Time" says it already, and the stock
                        briefcase that used to sit here is on the kit's banned
                        list. An icon that adds nothing is not worth a rule. */}
                    <Badge variant="secondary">
                      {job.job_type || "Full-Time"}
                    </Badge>
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {formatSalary(job.salary_min, job.salary_max, job.salary_currency)}
                    </Badge>
                    {job.experience_level && (
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {job.experience_level}
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
                <CardContent className="p-6 space-y-6">
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
            {/* Apply CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className={`bg-card overflow-hidden ${isDeadlinePassed || applicantLimitReached ? 'border-destructive/50' : 'border-primary/50'}`}>
                <CardContent className="p-6 space-y-4">
                  {isCheckingLimit ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : isDeadlinePassed ? (
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
                  ) : applicantLimitReached ? (
                    <>
                      <div className="text-center">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-[var(--brass)]" />
                        <h3 className="text-lg font-semibold text-foreground">Not Accepting Applications</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          This employer is not currently accepting new applications
                        </p>
                      </div>
                      
                      <Button
                        disabled
                        size="lg"
                        variant="outline"
                        className="w-full h-14 text-lg font-semibold"
                      >
                        <AlertTriangle className="h-5 w-5 mr-2" />
                        Applications Paused
                      </Button>

                      <p className="text-xs text-center text-muted-foreground">
                        Please check back later or contact the employer directly
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

            {/* Skills */}
            {job.skills_required && job.skills_required.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6">
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
            {job.benefits && job.benefits.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card className="bg-card border-border">
                  <CardContent className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Benefits</h3>
                    <ul className="space-y-2">
                      {job.benefits.map((benefit, index) => (
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
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Job Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Posted</span>
                      <span className="text-foreground">{format(new Date(job.created_at), "MMM d, yyyy")}</span>
                    </div>
                    {job.job_code && (
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
      </div>

    </>
  );
}
