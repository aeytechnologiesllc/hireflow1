import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "@/components/AppLayout";
import DeveloperLayout from "@/components/DeveloperLayout";
import { OrbLoader } from "@/components/ava/OrbLoader";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

// Core pages loaded eagerly for instant navigation
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Applicants from "./pages/Applicants";
import ApplicantDetails from "./pages/ApplicantDetails";
import Messages from "./pages/Messages";
import Documents from "./pages/Documents";
import More from "./cockpit/pages/More";
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Recover from stale code-split chunks after a deploy: if a lazy import fails
// because the hashed chunk 404s (the app was open in the browser while a new
// version deployed), reload once to fetch fresh assets instead of white-screening
// the whole app with "Something went wrong".
function lazyWithReload(factory: Parameters<typeof lazy>[0]) {
  return lazy(() =>
    factory()
      .then((m) => { sessionStorage.removeItem("hf-chunk-reload"); return m; })
      .catch((err) => {
        if (!sessionStorage.getItem("hf-chunk-reload")) {
          sessionStorage.setItem("hf-chunk-reload", "1");
          window.location.reload();
          return new Promise<never>(() => {}); // hang while the page reloads
        }
        throw err;
      }),
  );
}

// All other pages lazy-loaded to reduce initial bundle
const Interviews = lazyWithReload(() => import("./pages/Interviews"));
const Team = lazyWithReload(() => import("./pages/Team"));
const Analytics = lazyWithReload(() => import("./pages/Analytics"));
const Settings = lazyWithReload(() => import("./pages/Settings"));
const Profile = lazyWithReload(() => import("./pages/Profile"));
const Notifications = lazyWithReload(() => import("./pages/Notifications"));
const TeamPortal = lazyWithReload(() => import("./pages/TeamPortal"));
const JoinTeam = lazyWithReload(() => import("./pages/JoinTeam"));
const ApplyWithCode = lazyWithReload(() => import("./pages/ApplyWithCode"));
const JobDetails = lazyWithReload(() => import("./pages/JobDetails"));
const Applications = lazyWithReload(() => import("./pages/Applications"));
const CandidateApplicationDetail = lazyWithReload(() => import("./pages/CandidateApplicationDetail"));
const ApplicationFormPhase = lazyWithReload(() => import("./pages/ApplicationFormPhase"));
const TypingTestPhase = lazyWithReload(() => import("./pages/TypingTestPhase"));
const QuizPhase = lazyWithReload(() => import("./pages/QuizPhase"));
const VideoIntroPhase = lazyWithReload(() => import("./pages/VideoIntroPhase"));
const ChatSimulationPhase = lazyWithReload(() => import("./pages/ChatSimulationPhase"));
const ChatInterviewPhase = lazyWithReload(() => import("./pages/ChatInterviewPhase"));
const SalesSimulationPhase = lazyWithReload(() => import("./pages/SalesSimulationPhase"));
const VoiceInterviewPhase = lazyWithReload(() => import("./pages/VoiceInterviewPhase"));
const PortfolioUploadPhase = lazyWithReload(() => import("./pages/PortfolioUploadPhase"));
const CreateJob = lazyWithReload(() => import("./pages/AvaCreateJob"));
const CreateJobLegacy = lazyWithReload(() => import("./pages/CreateJob"));
const GuestJobCreator = lazyWithReload(() => import("./pages/GuestJobCreator"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const MarketingDemo = lazyWithReload(() => import("./pages/MarketingDemo"));
const ShowcaseApplyForm = lazyWithReload(() => import("./pages/ShowcaseApplyForm"));
const CandidateContinue = lazyWithReload(() => import("./pages/CandidateContinue"));
const CandidatePortalLanding = lazyWithReload(() => import("./pages/CandidatePortalLanding"));
const CandidateAuth = lazyWithReload(() => import("./pages/CandidateAuth"));
const VerifyDocument = lazyWithReload(() => import("./pages/VerifyDocument"));
const OAuthGoogleCallback = lazyWithReload(() => import("./pages/OAuthGoogleCallback"));
const AuthCallback = lazyWithReload(() => import("./pages/AuthCallback"));
const Privacy = lazyWithReload(() => import("./pages/Privacy"));
const Terms = lazyWithReload(() => import("./pages/Terms"));
const DeveloperDashboard = lazyWithReload(() => import("./pages/DeveloperDashboard"));
const DeveloperUsers = lazyWithReload(() => import("./pages/DeveloperUsers"));
const DeveloperSubscriptions = lazyWithReload(() => import("./pages/DeveloperSubscriptions"));
const DeveloperJobs = lazyWithReload(() => import("./pages/DeveloperJobs"));
const DeveloperActivity = lazyWithReload(() => import("./pages/DeveloperActivity"));
const DeveloperSettings = lazyWithReload(() => import("./pages/DeveloperSettings"));
const OrbPreview = lazyWithReload(() => import("./pages/OrbPreview"));
const AvaFlowPreview = lazyWithReload(() => import("./pages/AvaFlowPreview"));
const OrbAudit = lazyWithReload(() => import("./pages/OrbAudit"));

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

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense fallback={<LazyFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/try-job-creator" element={<GuestJobCreator />} />
                  
                  {/* Candidate Portal (separate entry point) */}
                  <Route path="/candidate" element={<CandidatePortalLanding />} />
                  <Route path="/candidate/auth" element={<CandidateAuth />} />
                  <Route path="/candidate/apply" element={<ApplyWithCode />} />
                  <Route path="/candidate/apply/:roleId/form" element={<ShowcaseApplyForm />} />
                  <Route path="/candidate/continue" element={<CandidateContinue />} />
                  <Route path="/candidate/job/:id" element={<JobDetails />} />
                  
                  {/* Developer Dashboard (role-based access) */}
                  <Route element={<DeveloperLayout />}>
                    <Route path="/developer" element={<DeveloperDashboard />} />
                    <Route path="/developer/users" element={<DeveloperUsers />} />
                    <Route path="/developer/subscriptions" element={<DeveloperSubscriptions />} />
                    <Route path="/developer/jobs" element={<DeveloperJobs />} />
                    <Route path="/developer/activity" element={<DeveloperActivity />} />
                    <Route path="/developer/settings" element={<DeveloperSettings />} />
                  </Route>
                  
                  {/* Protected routes with AppLayout */}
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/jobs/create-legacy" element={<CreateJobLegacy />} />
                    <Route path="/jobs/edit/:id" element={<CreateJobLegacy />} />
                    <Route path="/applicants" element={<Applicants />} />
                    <Route path="/applicants/:id" element={<ApplicantDetails />} />
                    <Route path="/interviews" element={<Interviews />} />
                    <Route path="/messages" element={<Messages />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/more" element={<More />} />
                    <Route path="/team" element={<Team />} />
                    <Route path="/team-portal" element={<TeamPortal />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/apply" element={<ApplyWithCode />} />
                    <Route path="/job/:id" element={<JobDetails />} />
                    <Route path="/applications" element={<Applications />} />
                    <Route path="/applications/:id" element={<CandidateApplicationDetail />} />
                    <Route path="/applications/:id/application/:stepId" element={<ApplicationFormPhase />} />
                    <Route path="/applications/:id/typing-test/:stepId" element={<TypingTestPhase />} />
                    <Route path="/applications/:id/quiz/:stepId" element={<QuizPhase />} />
                    <Route path="/applications/:id/video-intro/:stepId" element={<VideoIntroPhase />} />
                    <Route path="/applications/:id/chat-simulation/:stepId" element={<ChatSimulationPhase />} />
                    <Route path="/applications/:id/chat-interview/:stepId" element={<ChatInterviewPhase />} />
                    <Route path="/applications/:id/sales-simulation/:stepId" element={<SalesSimulationPhase />} />
                    <Route path="/applications/:id/voice-interview/:stepId" element={<VoiceInterviewPhase />} />
                    <Route path="/applications/:id/portfolio/:stepId" element={<PortfolioUploadPhase />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                  
                  {/* Join Team (outside AppLayout) */}
                  <Route path="/join-team/:code" element={<JoinTeam />} />
                  
                  {/* Marketing Demo (full-screen, no layout) */}
                  <Route path="/marketing-demo" element={<MarketingDemo />} />
                  <Route path="/orb-preview" element={<OrbPreview />} />
                  <Route path="/ava-preview" element={<AvaFlowPreview />} />
                  <Route path="/orb-audit" element={<OrbAudit />} />
                  <Route path="/preview/loading" element={<AuthLoadingScreen variant="employer" />} />
                  <Route path="/jobs/create" element={<CreateJob />} />
                  
                  {/* Document Verification (public, outside AppLayout) */}
                  <Route path="/verify/:documentCode" element={<VerifyDocument />} />
                  
                  {/* OAuth Callback (public, outside AppLayout) */}
                  <Route path="/oauth/google/callback" element={<OAuthGoogleCallback />} />
                  
                  {/* Legal Pages (public, outside AppLayout) */}
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
