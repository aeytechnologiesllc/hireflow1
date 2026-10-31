// Build marker: applicants-ux ship (sticky back · inline resume dialog · candidate-aware funnel) 2026-06-30
import { Suspense, useEffect, useRef } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { HostGate } from "@/components/HostGate";
import { CAREERS_PATH, isStaffHost } from "@/lib/hosts";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OrbLoader } from "@/components/ava/OrbLoader";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { applicantDetailsImporter, jobDetailImporter, routeImporters, warmStaffPages } from "@/lib/prefetchRoutes";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";
import { useNightWhileOpen } from "@/hooks/useNightWhileOpen";


// The big screens every visitor used to download up front, whichever one
// they were opening (the performance check, 2026-10-11: they were about 90%
// of the app's own first download). Each is fetched when needed, and the one
// a visit is opening is started at once below, beside the rest.
const appLayoutImporter = () => import("@/components/AppLayout");
const indexImporter = () => import("./pages/Index");
const authImporter = () => import("./pages/Auth");
const AppLayout = lazyWithReload(appLayoutImporter);
const Index = lazyWithReload(indexImporter);
const Auth = lazyWithReload(authImporter);
const CandidateStepGate = lazyWithReload(() => import("@/components/candidate/CandidateStepGate"));
const DeveloperLayout = lazyWithReload(() => import("@/components/DeveloperLayout"));

/** The paths a signed-in applicant opens inside the app's frame. */
const CANDIDATE_APP_PATH = /^\/(applications|messages|my-documents|profile|settings|notifications)(\/|$)/;

if (typeof window !== "undefined") {
  const path = window.location.pathname;
  if (path === "/auth" || path.startsWith("/auth/")) authImporter().catch(() => {});
  if (isStaffHost()) appLayoutImporter().catch(() => {});
  else if (path === CAREERS_PATH) indexImporter().catch(() => {});
  else if (CANDIDATE_APP_PATH.test(path)) appLayoutImporter().catch(() => {});
}

/**
 * The staff site's "/" (where the installed app opens): only a doorway.
 * HostGate sends a visitor on to sign-in or the dashboard. This used to be
 * the whole careers page (Index), downloaded to show a loading screen. What
 * it did here is kept: a signed-in account that never had its role written
 * goes to /auth/callback to get one, once.
 */
function StaffDoorway() {
  const { loading, session, role } = useAuth();
  const navigate = useNavigate();
  const sent = useRef(false);
  useEffect(() => {
    if (loading || !session || role !== null || sent.current) return;
    sent.current = true;
    navigate("/auth/callback?role=employer", { replace: true });
  }, [loading, session, role, navigate]);
  return <AuthLoadingScreen variant="employer" />;
}

// The hiring team's core pages. They used to be loaded eagerly "for instant
// navigation", so every applicant who opened the careers page or a job also
// downloaded the whole staff side, PDF tools included: about 1.1 MB
// compressed before the job appeared (2026-10-09, on phones in the
// Philippines). Now they are lazy; on the staff host the page being opened
// is fetched at once and the rest once the first screen is up
// (warmStaffPages, src/lib/prefetchRoutes.ts).
const Dashboard = lazyWithReload(routeImporters["/dashboard"]);
const Jobs = lazyWithReload(routeImporters["/jobs"]);
const Applicants = lazyWithReload(routeImporters["/applicants"]);
const ApplicantDetails = lazyWithReload(applicantDetailsImporter);
const JobDetail = lazyWithReload(jobDetailImporter);
const Messages = lazyWithReload(routeImporters["/messages"]);
const Documents = lazyWithReload(routeImporters["/documents"]);
const More = lazyWithReload(routeImporters["/more"]);
const HelpPage = lazyWithReload(() => import("./cockpit/pages/Help"));
const AdminPage = lazyWithReload(() => import("./cockpit/pages/Admin"));
if (typeof window !== "undefined" && isStaffHost()) warmStaffPages(window.location.pathname);

// All other pages lazy-loaded to reduce initial bundle.
// Routes that are also reachable from a nav item share their import()
// thunk with src/lib/prefetchRoutes.ts, so there's one module path either
// way — see that file for why.
const Interviews = lazyWithReload(routeImporters["/interviews"]);
const Team = lazyWithReload(routeImporters["/team"]);
const Analytics = lazyWithReload(routeImporters["/analytics"]);
const Settings = lazyWithReload(routeImporters["/settings"]);
const Profile = lazyWithReload(routeImporters["/profile"]);
const Notifications = lazyWithReload(routeImporters["/notifications"]);
const TeamPortal = lazyWithReload(routeImporters["/team-portal"]);
const JoinTeam = lazyWithReload(() => import("./pages/JoinTeam"));
const ApplyWithCode = lazyWithReload(routeImporters["/apply"]);
const JobDetails = lazyWithReload(() => import("./pages/JobDetails"));
const BusinessCareers = lazyWithReload(() => import("./pages/BusinessCareers"));
const OpenJobs = lazyWithReload(() => import("./pages/OpenJobs"));
/**
 * "Continue your application" (/candidate/continue). Links across the app
 * point here. On the live schema it sends the applicant to sign in and on to
 * their applications; the phone-number lookup it was written for reads the
 * old prototype's tables and runs only on that schema (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 2, task 7).
 */
const CandidateContinue = lazyWithReload(() => import("./pages/CandidateContinue"));
const Applications = lazyWithReload(routeImporters["/applications"]);
const MyDocuments = lazyWithReload(routeImporters["/my-documents"]);
const CandidateApplicationDetail = lazyWithReload(() => import("./pages/CandidateApplicationDetail"));
const ApplicationFormPhase = lazyWithReload(() => import("./pages/ApplicationFormPhase"));
const TypingTestPhase = lazyWithReload(() => import("./pages/TypingTestPhase"));
const ConnectionCheckPhase = lazyWithReload(() => import("./pages/ConnectionCheckPhase"));
const QuizPhase = lazyWithReload(() => import("./pages/QuizPhase"));
const VideoIntroPhase = lazyWithReload(() => import("./pages/VideoIntroPhase"));
const ChatSimulationPhase = lazyWithReload(() => import("./pages/ChatSimulationPhase"));
const ChatInterviewPhase = lazyWithReload(() => import("./pages/ChatInterviewPhase"));
const SalesSimulationPhase = lazyWithReload(() => import("./pages/SalesSimulationPhase"));
const VoiceInterviewPhase = lazyWithReload(() => import("./pages/VoiceInterviewPhase"));
const InterviewRoom = lazyWithReload(() => import("./pages/InterviewRoom"));
const PortfolioUploadPhase = lazyWithReload(() => import("./pages/PortfolioUploadPhase"));
const CreateJob = lazyWithReload(() => import("./pages/AvaCreateJob"));
const CreateJobLegacy = lazyWithReload(() => import("./pages/CreateJob"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const ShowcaseApplyForm = lazyWithReload(() => import("./pages/ShowcaseApplyForm"));
const CandidatePortalLanding = lazyWithReload(() => import("./pages/CandidatePortalLanding"));
const CandidateAuth = lazyWithReload(() => import("./pages/CandidateAuth"));
const VerifyDocument = lazyWithReload(() => import("./pages/VerifyDocument"));
const OAuthGoogleCallback = lazyWithReload(() => import("./pages/OAuthGoogleCallback"));
const AuthCallback = lazyWithReload(() => import("./pages/AuthCallback"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const DeveloperDashboard = lazyWithReload(() => import("./pages/DeveloperDashboard"));
const DeveloperUsers = lazyWithReload(() => import("./pages/DeveloperUsers"));
const DeveloperJobs = lazyWithReload(() => import("./pages/DeveloperJobs"));
const DeveloperActivity = lazyWithReload(() => import("./pages/DeveloperActivity"));
const DeveloperErrors = lazyWithReload(() => import("./pages/DeveloperErrors"));
const DeveloperVisitors = lazyWithReload(() => import("./pages/DeveloperVisitors"));
const DeveloperSettings = lazyWithReload(() => import("./pages/DeveloperSettings"));
const AvaFlowPreview = lazyWithReload(() => import("./pages/AvaFlowPreview"));

/**
 * The flow lab: walk the create-job flow — voice intake through publish — with
 * Day and Night side by side in lockstep.
 *
 * It ships to PRODUCTION on purpose. It was gated to DEV first, which made the
 * one surface built for the owner to review the one surface he could not reach,
 * since he reviews on his phone against the live site. It renders the canned
 * prototype only — no real jobs, no customer data — and its voice pane is inert
 * because opening a session costs money.
 */
const FlowLab = lazyWithReload(() => import("./pages/FlowLab"));

/** Placeholder for a dev-only page in production builds — never rendered. */
const DevOnlyPage = () => null;

/**
 * The dev-preview harness (src/dev-preview/) — signed-in screens rendered
 * against offline fixture data, for verifying UI that needs a signed-in
 * session without ever signing in. `import.meta.env.DEV` is statically
 * `false` in the production bundle, so this ternary's true branch —
 * including the `import()` call, which is what actually pulls the picker UI
 * and fixture data in — is dead code the bundler drops. See
 * scripts/guards/dev-preview-dev-only.mjs and docs/DEV-PREVIEW.md.
 */
const DevPreview = import.meta.env.DEV ? lazyWithReload(() => import("./pages/DevPreview")) : DevOnlyPage;



// Standard premium loading state — a properly sized, centered Ava orb.
function LazyFallback() {
  return <OrbLoader />;
}

// Configure QueryClient for production
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

// Must live inside <BrowserRouter> to read route changes via useLocation().
function PageViewTracker() {
  usePageViewTracking();
  return null;
}

// Every tab, staff and applicant, moves to the newest build by itself at a
// moment that throws nothing away (src/hooks/useAutoUpdate.ts). Inside the
// router for the same reason as above.
function AutoUpdate() {
  useAutoUpdate();
  return null;
}

// Sign-up stays Night (the bridge from the dark front page) from its first
// frame to its last: held here, outside the lazy page, so the loader shown
// while the Auth chunk downloads is Night too, not a flash of Day between
// index.html's Night start screen and the page's own hold (Auth.tsx). The
// same paths as the start screen's.
const SIGN_UP_PATH = /^\/auth(\/|$)/;
function HoldNight() {
  useNightWhileOpen();
  return null;
}
function NightOnSignUp() {
  const { pathname } = useLocation();
  return SIGN_UP_PATH.test(pathname) ? <HoldNight /> : null;
}

const App = () => (
  <ErrorBoundary>
    {/* The app opens in Day (Sage paper, the owner's choice of 2026-10-30) for everyone; Night is one click on the moon in the sidebar, remembered on this browser, and a saved choice always wins (index.html's start screen agrees). */}
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <PageViewTracker />
              <AutoUpdate />
              <NightOnSignUp />
              <HostGate>
              <Suspense fallback={<LazyFallback />}>
                <Routes>
                  {/* hireflownow.com/ itself is the landing page (middleware.js), so the
                      app only meets "/" from an in-app link: on the applicants' site that
                      means the open roles. On the staff site "/" is the doorway to
                      sign-in or the dashboard (HostGate). */}
                  <Route path="/" element={isStaffHost() ? <StaffDoorway /> : <Navigate to={CAREERS_PATH} replace />} />
                  <Route path={CAREERS_PATH} element={<Index />} />
                  {/* Every business's live jobs (2026-10-11): where the front
                      page's "Looking for a job?" leads. */}
                  {!isStaffHost() && <Route path="/open-jobs" element={<OpenJobs />} />}
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  
                  {/* Candidate Portal (separate entry point) */}
                  <Route path="/candidate" element={<CandidatePortalLanding />} />
                  <Route path="/candidate/auth" element={<CandidateAuth />} />
                  <Route path="/candidate/apply" element={<ApplyWithCode />} />
                  <Route path="/candidate/apply/:roleId/form" element={<ShowcaseApplyForm />} />
                  {/* Accountless — no auth wall, by design: the whole point is
                      getting back to an application you started without one. */}
                  <Route path="/candidate/continue" element={<CandidateContinue />} />
                  <Route path="/candidate/job/:id" element={<JobDetails />} />
                  
                  {/* Developer Dashboard (role-based access) */}
                  <Route element={<DeveloperLayout />}>
                    <Route path="/developer" element={<DeveloperDashboard />} />
                    <Route path="/developer/users" element={<DeveloperUsers />} />
                    <Route path="/developer/jobs" element={<DeveloperJobs />} />
                    <Route path="/developer/activity" element={<DeveloperActivity />} />
                    <Route path="/developer/errors" element={<DeveloperErrors />} />
                    <Route path="/developer/visitors" element={<DeveloperVisitors />} />
                    <Route path="/developer/settings" element={<DeveloperSettings />} />
                  </Route>
                  
                  {/* Protected routes with AppLayout */}
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/jobs/create" element={<CreateJob />} />
                    <Route path="/jobs/create-legacy" element={<CreateJobLegacy />} />
                    <Route path="/jobs/edit/:id" element={<CreateJobLegacy />} />
                    {/* One job from the inside, and a person opened from it:
                        both stay under Jobs (src/cockpit/lib/jobScope.ts). */}
                    <Route path="/jobs/:jobId" element={<JobDetail />} />
                    <Route path="/jobs/:jobId/applicants/:id" element={<ApplicantDetails />} />
                    <Route path="/applicants" element={<Applicants />} />
                    <Route path="/applicants/:id" element={<ApplicantDetails />} />
                    <Route path="/interviews" element={<Interviews />} />
                    <Route path="/interviews/:id/room" element={<InterviewRoom />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/more" element={<More />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/help" element={<HelpPage />} />
                    {/* An applicant's Contact us: their own Help thread with the company (20261025200000). */}
                    <Route path="/contact" element={<HelpPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/team-portal" element={<TeamPortal />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/apply" element={<ApplyWithCode />} />
                    <Route path="/job/:id" element={<JobDetails />} />
                    <Route path="/applications" element={<Applications />} />
                    <Route path="/my-documents" element={<MyDocuments />} />
                    <Route path="/applications/:id" element={<CandidateApplicationDetail />} />
                    <Route path="/applications/:id/application/:stepId" element={<CandidateStepGate phase="application"><ApplicationFormPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/connection/:stepId" element={<CandidateStepGate phase="equipment_check"><ConnectionCheckPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/typing-test/:stepId" element={<CandidateStepGate phase="typing_test"><TypingTestPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/quiz/:stepId" element={<CandidateStepGate phase="quiz"><QuizPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/video-intro/:stepId" element={<CandidateStepGate phase="video_intro"><VideoIntroPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/chat-simulation/:stepId" element={<CandidateStepGate phase="chat_simulation"><ChatSimulationPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/chat-interview/:stepId" element={<CandidateStepGate phase="chat_interview"><ChatInterviewPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/sales-simulation/:stepId" element={<CandidateStepGate phase="sales_simulation"><SalesSimulationPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/voice-interview/:stepId" element={<CandidateStepGate phase="voice_interview"><VoiceInterviewPhase /></CandidateStepGate>} />
                    <Route path="/applications/:id/portfolio/:stepId" element={<CandidateStepGate phase="portfolio_upload"><PortfolioUploadPhase /></CandidateStepGate>} />
                    <Route path="/applications/:appId/interview-room" element={<InterviewRoom />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                  
                  {/* Join Team (outside AppLayout) */}
                  <Route path="/join-team/:code" element={<JoinTeam />} />
                  
                  {/* Retired: the old neon marketing demo. Route kept as a redirect
                      in case it's bookmarked anywhere. */}
                  <Route path="/marketing-demo" element={<Navigate to="/" replace />} />

                  {/* Founder review prototype — canned data, no backend calls. Stays
                      reachable in production so it can be opened from a phone. */}
                  <Route path="/ava-preview" element={<AvaFlowPreview />} />

                  {/* Dev-only. `import.meta.env.DEV` is statically replaced with false
                      at build time, so this is dead code the bundler drops and the route
                      is never reachable on hireflownow.com. React Router skips
                      non-element children, which makes the inline conditional legal
                      inside <Routes>. (The /orb-preview and /orb-audit QA pages that
                      used to live here are gone — the orb they audited is retired.) */}
                  {import.meta.env.DEV && (
                    <Route path="/preview/loading" element={<AuthLoadingScreen variant="employer" />} />
                  )}
                  {import.meta.env.DEV && <Route path="/__preview" element={<DevPreview />} />}
                  <Route path="/flow-lab" element={<FlowLab />} />
                  
                  {/* Document Verification (public, outside AppLayout) */}
                  <Route path="/verify/:documentCode" element={<VerifyDocument />} />
                  
                  {/* OAuth Callback (public, outside AppLayout) */}
                  <Route path="/oauth/google/callback" element={<OAuthGoogleCallback />} />
                  
                  {/* Legal Pages (public, outside AppLayout) */}
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  
                  {/* Short job links: hireflownow.com/<slug> opens that job's page
                      (docs/SHORT-JOB-LINKS.md). On the candidates' site only: on
                      staff.hireflownow.com an unknown path stays NotFound. React
                      Router ranks every static path above a :param one, so /auth,
                      /jobs and every route above always win; only a single segment
                      nothing else claims reaches the job page, which says "this
                      role isn't open" for a name no job has. The job editor refuses
                      every top-level path above as a name (src/lib/jobSlug.ts). */}
                  {!isStaffHost() && <Route path="/:slug" element={<JobDetails />} />}

                  {/* Per business (2026-10-10): hireflownow.com/c/<business> is its
                      careers page, /c/<business>/<job> one of its jobs. The pair
                      names exactly one job, so the link someone follows, and the
                      page sign-up sends them back to, is always that job. */}
                  {!isStaffHost() && <Route path="/c/:business" element={<BusinessCareers />} />}
                  {!isStaffHost() && <Route path="/c/:business/:slug" element={<JobDetails />} />}

                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </HostGate>
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
