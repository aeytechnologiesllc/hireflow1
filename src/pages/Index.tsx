import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { ArrowDown, ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { GemRail, type GemRailNode } from "@/components/rail/GemRail";
import { glyphForKind } from "@/components/glyphForKind";
import { ChatDemo } from "@/components/careers/ChatDemo";
import { isStaffHost, isStaffRole, staffSignInHref } from "@/lib/hosts";
import { jobPagePath, rootDestination, usableSlug } from "@/lib/jobSlug";
import { jobLevelLabel, jobTypeLabel } from "@/lib/jobLabels";
import "@/styles/careers.css";

/**
 * The Zulu Support Team careers page — hireflownow.com (2026-10-04).
 *
 * HireFlow's own green theme (src/styles/careers.css): Fraunces, ivory ink,
 * jade and brass on warm near-black. Owner: "professional … absolutely
 * premium and stunning animation but simple." The animation is the job
 * itself — a chat that answers itself while a typing meter climbs past the
 * 45 wpm the role needs — plus the headline rising in, numbers counting up,
 * and HireFlow's Gemline rail walking the five hiring steps.
 *
 * Open roles come straight from published_jobs_public (the same anon-readable
 * view the job page reads); Apply goes to the public job page, so no job code
 * is needed (/candidate/apply still takes one).
 *
 * With exactly one open role this page steps aside: hireflownow.com/ opens
 * that role's page (its short link, hireflownow.com/<slug>), replacing this
 * entry so Back does not bounce. Owner, 2026-10-06: applicants "could hit the
 * back button or get confused easily" (docs/SHORT-JOB-LINKS.md).
 *
 * On staff.hireflownow.com this route is only a doorway: HostGate sends the
 * hiring team to sign-in or their dashboard (src/lib/hosts.ts).
 */

const EASE_OUT: [number, number, number, number] = [0.2, 0.7, 0.3, 1];

interface OpenRole {
  id: string;
  slug: string | null;
  title: string;
  location: string | null;
  job_type: string | null;
  experience_level: string | null;
  is_remote: boolean | null;
  description: string | null;
  created_at: string | null;
}

const STEPS = [
  { kind: "application", title: "Apply", copy: "A few questions about you and the hours you can work. A resume is welcome, not required.", time: "5–10 min" },
  { kind: "quiz", title: "Skills check", copy: "Ten questions on real situations from the job.", time: "5–15 min" },
  { kind: "connection", title: "Computer check", copy: "A 20-second speed test on the computer you will work from.", time: "Under 1 min" },
  { kind: "typing", title: "Typing test", copy: "One timed minute. We look at speed and accuracy, because that is the job.", time: "2–5 min" },
  { kind: "chat", title: "Chat practice", copy: "A practice player writes in. Answer the way you would on a real shift.", time: "10–20 min" },
  { kind: "interview", title: "Written interview", copy: "A short back-and-forth about how you work. No video, no phone call.", time: "15–25 min" },
];

const RAIL_NODES: GemRailNode[] = [
  ...STEPS.map((s) => ({ id: s.kind, label: s.title, icon: glyphForKind(s.kind), receipt: s.time })),
  { id: "decision", label: "Decision", icon: glyphForKind("decision"), receipt: "Yes or no by email", sealed: true },
];


function excerpt(text: string | null, max = 220): string {
  if (!text) return "";
  const plain = text.replace(/<[^>]+>/g, " ").replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 150)).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

function postedAgo(iso: string | null): string {
  if (!iso) return "Open now";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  return "Open now";
}

/** "Customer Support Chat Agent (Zulu Royal & Zulu Rush)" → main + the line it serves. */
function splitTitle(title: string): { main: string; sub: string | null } {
  const m = title.match(/^(.*?)\s*\((.+)\)\s*$/);
  return m ? { main: m[1], sub: m[2] } : { main: title, sub: null };
}

/** Fades and lifts a block in once it scrolls into view. */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Counts a number up once it is on screen. */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!inView || reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1400);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, to]);
  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

/** Mounts the Gemline rail only once it is on screen, so its walk is seen. */
function HiringRail() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  return (
    <div ref={ref} className="cr-railbox__rail">
      {inView && (
        <GemRail
          nodes={RAIL_NODES}
          current={RAIL_NODES.length - 1}
          traveler="You"
          ariaLabel="The five hiring steps, then a decision"
        />
      )}
    </div>
  );
}

const heroWord: Variants = {
  hidden: { opacity: 0, y: "0.45em" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.12 + i * 0.075, duration: 0.7, ease: EASE_OUT },
  }),
};

export default function Index() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const reduce = useReducedMotion();
  const sentToCallback = useRef(false);
  const staffHost = isStaffHost();
  const [scrolled, setScrolled] = useState(false);

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

  // The page scrolls inside #root (html/body/#root are 100% tall), not the window.
  useEffect(() => {
    if (staffHost) return;
    const scroller = document.getElementById("root");
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 8);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [staffHost]);

  const { data: roles, isLoading, isError } = useQuery({
    queryKey: ["careers-open-roles"],
    queryFn: async (): Promise<OpenRole[]> => {
      // The whole row (the same select the job page makes), so the one-role
      // hop below can hand it over and the job opens without a second load.
      const { data, error } = await supabase
        .from("published_jobs_public")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenRole[];
    },
    enabled: !staffHost,
    staleTime: 60_000,
  });

  // One open role: go straight to it. Waits for sign-in to settle, so the
  // role-less account above still reaches /auth/callback first.
  const singleRole = !staffHost && !loading && !(session && role === null) ? rootDestination(roles) : null;
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!singleRole || !roles?.[0]) return;
    // The job page reads this very row (published_jobs_public, select *):
    // seed its cache so it opens on the job, not on a loading skeleton.
    const only = roles[0];
    const slug = usableSlug(only.slug);
    queryClient.setQueryData(["job-details", slug ? `slug:${slug}` : only.id, true], only);
    navigate(singleRole, { replace: true });
  }, [singleRole, roles, queryClient, navigate]);

  const account = useMemo(() => {
    if (role === "candidate") return { to: "/applications", label: "My applications" };
    if (isStaffRole(role)) return { to: "/dashboard", label: "Dashboard" };
    return { to: "/candidate/auth", label: "Sign in" };
  }, [role]);

  // On the staff host this route is only a doorway (HostGate moves them on).
  if (staffHost) return <AuthLoadingScreen variant="employer" />;

  // Until the open roles are known the page cannot say whether it is the
  // careers page or a step on the way to the one role, so it shows a plain
  // ground rather than flashing a page that is about to leave. The app's own
  // theme-aware ground (not the careers page's always-Night one): with one
  // role what follows is the job page, which follows the theme, so Day no
  // longer flashes dark first.
  if (singleRole || ((isLoading || loading) && !isError)) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background" aria-busy="true">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading open roles" />
      </div>
    );
  }

  const jump = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const words: Array<{ text: string; line: 0 | 1; em?: boolean }> = [
    { text: "Help", line: 0 },
    { text: "players,", line: 0 },
    { text: "from", line: 1 },
    { text: "anywhere.", line: 1, em: true },
  ];

  return (
    <div className="cr-page">
      <div className="cr-grain" aria-hidden="true" />

      <header className="cr-head" data-scrolled={scrolled ? "true" : "false"}>
        <div className="cr-wrap cr-head__in">
          <Link to="/" className="cr-brand" aria-label="Zulu Support Team careers">
            <span className="cr-brand__mark" aria-hidden="true">Z</span>
            <span className="cr-brand__name">Zulu Support Team</span>
            <span className="cr-brand__tag">Careers</span>
          </Link>
          <nav className="cr-nav" aria-label="Careers">
            <a href="#roles" onClick={jump("roles")} className="cr-nav__link">Open roles</a>
            <a href="#how" onClick={jump("how")} className="cr-nav__link">How hiring works</a>
            <Link to={account.to} className="cr-btn cr-btn--ghost cr-btn--sm">{account.label}</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="cr-hero" aria-labelledby="cr-hero-title">
          <div className="cr-hero__glow" aria-hidden="true" />
          <div className="cr-wrap cr-hero__in">
            <div>
              <motion.span
                className="cr-kicker"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              >
                <span className="cr-dot" aria-hidden="true" />
                Now hiring · Remote
              </motion.span>

              <h1 id="cr-hero-title" className="cr-h1">
                {[0, 1].map((line) => (
                  <span key={line} className="cr-h1__line">
                    {words
                      .map((w, i) => ({ ...w, i }))
                      .filter((w) => w.line === line)
                      .map((w) => (
                        <motion.span
                          key={w.text}
                          className="cr-h1__word"
                          custom={w.i}
                          variants={heroWord}
                          initial={reduce ? false : "hidden"}
                          animate="show"
                        >
                          {w.em ? (
                            <em>
                              {w.text}
                              <svg className="cr-swoosh" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
                                <motion.path
                                  d="M3 14 C 50 5, 120 4, 197 10"
                                  initial={reduce ? false : { pathLength: 0 }}
                                  animate={{ pathLength: 1 }}
                                  transition={{ delay: 0.95, duration: 0.9, ease: [0.65, 0, 0.35, 1] as [number, number, number, number] }}
                                />
                              </svg>
                            </em>
                          ) : (
                            w.text
                          )}
                          {w.i < words.length - 1 && w.line === words[w.i + 1]?.line ? " " : ""}
                        </motion.span>
                      ))}
                  </span>
                ))}
              </h1>

              <Reveal delay={reduce ? 0 : 0.45}>
                <p className="cr-lede">
                  Join the <strong>Zulu Support Team</strong>: remote customer-chat roles for Zulu Royal and Zulu Rush.
                  Players write in, you sort it out, clearly and kindly. Everything happens in chat.
                </p>
                <div className="cr-ctas">
                  <a href="#roles" onClick={jump("roles")} className="cr-btn cr-btn--primary">
                    See open roles
                    <ArrowDown className="cr-nudge-y" aria-hidden="true" />
                  </a>
                  <a href="#how" onClick={jump("how")} className="cr-btn cr-btn--ghost">
                    How hiring works
                  </a>
                </div>
                <ul className="cr-trust">
                  <li><Check aria-hidden="true" />Apply in your browser</li>
                  <li><Check aria-hidden="true" />No phone calls, ever</li>
                  <li><Check aria-hidden="true" />A yes or no once you finish every step</li>
                </ul>
              </Reveal>
            </div>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.9, ease: EASE_OUT }}
              style={{ display: "grid" }}
            >
              <ChatDemo />
            </motion.div>
          </div>
        </section>

        <section className="cr-wrap cr-section" aria-labelledby="cr-job-title">
          <Reveal>
            <span className="cr-label">The job</span>
            <h2 id="cr-job-title" className="cr-h2">
              The job, in <em>four numbers.</em>
            </h2>
          </Reveal>
          <div className="cr-stats">
            <Reveal className="cr-stat">
              <span className="cr-stat__num cr-stat__num--jade">0</span>
              <span className="cr-stat__label">Phone calls</span>
              <p className="cr-stat__copy">Every conversation with a player is written. You will never be on the phone.</p>
            </Reveal>
            <Reveal className="cr-stat" delay={0.08}>
              <span className="cr-stat__num">
                <CountUp to={45} suffix="+" />
              </span>
              <span className="cr-stat__label">Words per minute</span>
              <p className="cr-stat__copy">Players are waiting on the other side of the chat. Fast, accurate typing is the job.</p>
            </Reveal>
            <Reveal className="cr-stat" delay={0.16}>
              <span className="cr-stat__num cr-stat__num--brass">
                <CountUp to={24} suffix="/7" />
              </span>
              <span className="cr-stat__label">Shifts around the clock</span>
              <p className="cr-stat__copy">Day, evening, overnight and weekends. You tell us the hours you can cover.</p>
            </Reveal>
            <Reveal className="cr-stat" delay={0.24}>
              <span className="cr-stat__num">Any</span>
              <span className="cr-stat__label">Country</span>
              <p className="cr-stat__copy">Fully remote. Fluent written English, a reliable connection and a quiet place to work.</p>
            </Reveal>
          </div>
        </section>

        <section id="roles" className="cr-wrap cr-section" aria-labelledby="cr-roles-title">
          <Reveal>
            <span className="cr-label">Open roles</span>
            <h2 id="cr-roles-title" className="cr-h2">
              We're hiring <em>now.</em>
            </h2>
            <p className="cr-sub">Tap a role to read the full description and apply. No job code needed.</p>
          </Reveal>

          <div className="cr-roles">
            {isLoading ? (
              <div className="cr-roles__skeleton" aria-busy="true" aria-label="Loading open roles" />
            ) : isError ? (
              <div className="cr-empty" role="status">
                <h3>We couldn't load the roles</h3>
                <p>
                  Refresh the page in a moment. If our team gave you a job code,{" "}
                  <Link to="/candidate/apply" className="cr-link">apply with it here</Link>.
                </p>
              </div>
            ) : !roles || roles.length === 0 ? (
              <div className="cr-empty" role="status">
                <h3>No open roles right now</h3>
                <p>
                  Check back soon. If our team gave you a job code,{" "}
                  <Link to="/candidate/apply" className="cr-link">apply with it here</Link>.
                </p>
              </div>
            ) : (
              roles.map((job, i) => {
                const { main, sub } = splitTitle(job.title);
                const level = jobLevelLabel(job.experience_level);
                const type = jobTypeLabel(job.job_type);
                return (
                  <Reveal key={job.id} delay={i * 0.08}>
                    <Link to={jobPagePath(job)} className="cr-role" aria-label={`Apply for ${job.title}`}>
                      <div>
                        <div className="cr-chips">
                          {job.is_remote !== false && <span className="cr-chip cr-chip--jade">Remote</span>}
                          {type && <span className="cr-chip">{type}</span>}
                          {level && <span className="cr-chip">{level}</span>}
                        </div>
                        <h3 className="cr-role__title">
                          {main}
                          {sub && <span className="cr-role__for">for {sub}</span>}
                        </h3>
                        <p className="cr-role__copy">{excerpt(job.description)}</p>
                        <p className="cr-role__meta">
                          {postedAgo(job.created_at)}
                          {job.location ? ` · ${job.location}` : ""}
                        </p>
                      </div>
                      <div className="cr-role__go">
                        <span className="cr-btn cr-btn--primary">
                          Apply now
                          <ArrowRight className="cr-nudge-x" aria-hidden="true" />
                        </span>
                        <span className="cr-role__hint">No job code needed</span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })
            )}
          </div>
        </section>

        <section id="how" className="cr-wrap cr-section" aria-labelledby="cr-how-title">
          <Reveal>
            <span className="cr-label">How hiring works</span>
            <h2 id="cr-how-title" className="cr-h2">
              Six steps. <em>All online.</em>
            </h2>
            <p className="cr-sub">
              Your progress saves after every step, so you can stop and come back. Everyone who finishes every step gets a yes or no by email.
            </p>
          </Reveal>
          <Reveal className="cr-railbox" delay={0.1}>
            <HiringRail />
            <ol className="cr-steps">
              {STEPS.map((step, i) => (
                <li key={step.kind}>
                  <span className="cr-step__num">Step {i + 1}</span>
                  <h3 className="cr-step__title">{step.title}</h3>
                  <p className="cr-step__copy">{step.copy}</p>
                </li>
              ))}
            </ol>
            <p className="cr-railbox__note">Every applicant rides the same track, in the same order.</p>
          </Reveal>
        </section>

        <section className="cr-close" aria-labelledby="cr-close-title">
          <div className="cr-close__glow" aria-hidden="true" />
          <Reveal className="cr-wrap cr-close__in">
            <span className="cr-label">Ready?</span>
            <h2 id="cr-close-title" className="cr-h2">
              Your next shift starts <em>with one chat.</em>
            </h2>
            <p className="cr-sub">Applying is all online and takes about an hour; you can stop and come back.</p>
            <div className="cr-close__actions">
              <a href="#roles" onClick={jump("roles")} className="cr-btn cr-btn--cream">
                See open roles
                <ArrowRight className="cr-nudge-x" aria-hidden="true" />
              </a>
              <Link to="/candidate/apply" className="cr-link">Have a job code? Use it here</Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="cr-foot">
        <div className="cr-wrap cr-foot__in">
          <span>© {new Date().getFullYear()} Zulu Support Team · Remote chat support for Zulu Royal and Zulu Rush</span>
          <nav className="cr-foot__links" aria-label="Footer">
            <Link to="/candidate/apply" className="cr-link">Apply with a job code</Link>
            <Link to="/privacy" className="cr-link">Privacy</Link>
            <Link to="/terms" className="cr-link">Terms</Link>
            <a href={staffSignInHref()} className="cr-link">Team sign in</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
