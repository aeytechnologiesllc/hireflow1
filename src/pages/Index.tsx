import { useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe2, Keyboard, MessageSquare, Clock, MapPin, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CandidateShell } from "@/components/candidate/CandidateShell";

/**
 * The careers page for the Zulu Support Team (2026-10-04).
 *
 * hireflownow.com is Zulu's own hiring tool now, not a product for sale, so
 * the marketing landing that used to sit here (public/landing.html) is gone.
 * A visitor sees who we are, the open roles straight from
 * published_jobs_public (the same anon-readable view the job page reads),
 * and an Apply button that goes to the public job page. No job code needed;
 * /candidate/apply still takes one as a backup.
 */

interface OpenRole {
  id: string;
  title: string;
  location: string | null;
  job_type: string | null;
  is_remote: boolean | null;
  description: string | null;
  created_at: string | null;
}

const FACTS = [
  { icon: Globe2, title: "Remote, any country", desc: "You need a reliable internet connection and a quiet place to work. That is it." },
  { icon: MessageSquare, title: "Chat only, no calls", desc: "Every conversation with a player is written. You will never be on the phone." },
  { icon: Keyboard, title: "Clear English, fast typing", desc: "Players are waiting on the other side of the chat, so speed and accuracy matter." },
  { icon: Clock, title: "Shifts around the clock", desc: "Players are online day and night. Tell us the hours you can cover." },
];

const STEPS = [
  { title: "Apply online", desc: "A few questions about you and the hours you can work. A resume is welcome but not required." },
  { title: "Typing test", desc: "One minute. We measure speed and accuracy, because that is the job." },
  { title: "Chat practice", desc: "You handle a player the way you would on a real shift. We look at tone, clarity and judgment." },
  { title: "Written interview", desc: "A short back-and-forth about how you work. No video, no phone call." },
  { title: "We reply either way", desc: "Sign in any time to see where you stand. Everyone hears back." },
];

function excerpt(text: string | null, max = 180): string {
  if (!text) return "";
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120))}…`;
}

function postedAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return "Open";
}

export default function Index() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const sentToCallback = useRef(false);

  // Signed in, auth finished, and still no role: this account never had its
  // user_roles row written (an OAuth sign-in that didn't pass through
  // /auth/callback, or a callback that was closed mid-way). Every shell treats
  // a null role as "not one of ours", so the person can't get anywhere.
  // /auth/callback runs the role assignment and routes them. Once only — it
  // navigates away on success and shows its own error on failure, so this
  // cannot ping-pong.
  useEffect(() => {
    if (loading || !session || role !== null || sentToCallback.current) return;
    sentToCallback.current = true;
    navigate("/auth/callback", { replace: true });
  }, [loading, session, role, navigate]);

  const { data: roles, isLoading, isError } = useQuery({
    queryKey: ["careers-open-roles"],
    queryFn: async (): Promise<OpenRole[]> => {
      const { data, error } = await supabase
        .from("published_jobs_public")
        .select("id, title, location, job_type, is_remote, description, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenRole[];
    },
    staleTime: 60_000,
  });

  const accountLink = useMemo(() => {
    if (role === "candidate") return { to: "/applications", label: "My applications" };
    if (role === "employer" || role === "team_member") return { to: "/dashboard", label: "Dashboard" };
    return { to: "/candidate/auth", label: "Sign in" };
  }, [role]);

  return (
    <CandidateShell>
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <header className="mb-12 flex items-center justify-between">
          <span className="font-display text-lg tracking-wide" style={{ color: "var(--hf-text)" }}>
            ZULU SUPPORT TEAM
          </span>
          <Link to={accountLink.to} className="cand-btn-ghost text-sm">
            {accountLink.label}
          </Link>
        </header>

        <section className="cand-rise mx-auto mb-12 max-w-2xl text-center" style={{ ["--cand-i" as string]: 0 }}>
          <p className="cand-kicker mb-4">Careers</p>
          <h1 className="font-display text-4xl font-medium leading-tight md:text-5xl" style={{ color: "var(--hf-text)" }}>
            Help players, from anywhere.
            <span className="mt-1 block" style={{ color: "var(--hf-gold)" }}>
              Remote customer-chat roles.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed" style={{ color: "var(--hf-text-soft)" }}>
            We run player support for Zulu Royal and Zulu Rush. The whole job happens in chat: players write in,
            you sort it out, clearly and kindly. Every step of applying is online and takes minutes.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a href="#open-roles" className="cand-btn-primary w-full sm:w-auto">
              See open roles
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link to="/candidate/auth" className="cand-btn-ghost w-full sm:w-auto">
              Already applied? Sign in
            </Link>
          </div>
        </section>

        <section className="cand-rise mb-12 grid gap-4 sm:grid-cols-2" style={{ ["--cand-i" as string]: 1 }}>
          {FACTS.map((fact) => (
            <div key={fact.title} className="cand-panel p-5 text-left">
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}
              >
                <fact.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg" style={{ color: "var(--hf-text)" }}>{fact.title}</h3>
              <p className="mt-1.5 text-sm leading-snug" style={{ color: "var(--hf-text-muted)" }}>{fact.desc}</p>
            </div>
          ))}
        </section>

        <section id="open-roles" className="cand-rise mb-12 scroll-mt-6" style={{ ["--cand-i" as string]: 2 }}>
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="font-display text-2xl" style={{ color: "var(--hf-text)" }}>Open roles</h2>
            {roles && roles.length > 0 && (
              <span className="text-sm" style={{ color: "var(--hf-text-muted)" }}>
                {roles.length} open
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading open roles">
              {[0, 1].map((i) => (
                <div key={i} className="cand-panel h-32 animate-pulse p-5" />
              ))}
            </div>
          ) : isError ? (
            <div className="cand-panel p-6 text-center">
              <p className="font-medium" style={{ color: "var(--hf-text)" }}>We could not load the open roles.</p>
              <p className="mt-1 text-sm" style={{ color: "var(--hf-text-muted)" }}>
                Refresh the page, or if you have a job code, use it below.
              </p>
            </div>
          ) : !roles || roles.length === 0 ? (
            <div className="cand-panel p-6 text-center">
              <p className="font-medium" style={{ color: "var(--hf-text)" }}>No open roles right now.</p>
              <p className="mt-1 text-sm" style={{ color: "var(--hf-text-muted)" }}>
                Check back soon. If our team gave you a job code, you can still apply with it below.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {roles.map((job) => {
                const where = job.is_remote ? `Remote${job.location ? ` · ${job.location}` : ""}` : job.location || "Remote";
                const summary = excerpt(job.description);
                return (
                  <li key={job.id} className="cand-panel p-5 md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-display text-xl" style={{ color: "var(--hf-text)" }}>{job.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "var(--hf-text-muted)" }}>
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" style={{ color: "var(--hf-gold)" }} />
                            {where}
                          </span>
                          {job.job_type && (
                            <span className="inline-flex items-center gap-1.5">
                              <Briefcase className="h-3.5 w-3.5" style={{ color: "var(--hf-gold)" }} />
                              {job.job_type.replace(/_/g, " ")}
                            </span>
                          )}
                          <span>{postedAgo(job.created_at)}</span>
                        </div>
                        {summary && (
                          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--hf-text-soft)" }}>{summary}</p>
                        )}
                      </div>
                      <Link
                        to={`/candidate/job/${job.id}`}
                        className="cand-btn-primary w-full shrink-0 md:w-auto"
                        aria-label={`Apply for ${job.title}`}
                      >
                        Apply
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="cand-rise cand-panel mx-auto max-w-2xl p-6 md:p-8" style={{ ["--cand-i" as string]: 3 }}>
          <h2 className="font-display text-center text-2xl" style={{ color: "var(--hf-text)" }}>How applying works</h2>
          <div className="mt-6 space-y-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex items-start gap-4 border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "var(--hf-border-strong)" }}>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: "var(--hf-green-soft)", color: "var(--hf-green)" }}
                >
                  {i + 1}
                </span>
                <div>
                  <span className="font-medium" style={{ color: "var(--hf-text)" }}>{step.title}</span>
                  <p className="mt-0.5 text-sm" style={{ color: "var(--hf-text-muted)" }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 space-y-2 text-center text-sm" style={{ color: "var(--hf-text-muted)" }}>
          <p>
            Have a job code from our team?{" "}
            <Link to="/candidate/apply" style={{ color: "var(--hf-gold)" }}>
              Apply with a code
            </Link>
          </p>
          <p>
            <Link to="/auth" style={{ color: "var(--hf-text-muted)" }}>
              Team sign in
            </Link>
          </p>
        </footer>
      </div>
    </CandidateShell>
  );
}
