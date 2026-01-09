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

// All pages loaded eagerly for instant navigation
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Applicants from "./pages/Applicants";
import ApplicantDetails from "./pages/ApplicantDetails";
import Interviews from "./pages/Interviews";
import Messages from "./pages/Messages";
import Documents from "./pages/Documents";
import Team from "./pages/Team";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TeamPortal from "./pages/TeamPortal";
import JoinTeam from "./pages/JoinTeam";
import ApplyWithCode from "./pages/ApplyWithCode";
import JobDetails from "./pages/JobDetails";
import Applications from "./pages/Applications";
import CandidateApplicationDetail from "./pages/CandidateApplicationDetail";
import ApplicationFormPhase from "./pages/ApplicationFormPhase";
import TypingTestPhase from "./pages/TypingTestPhase";
import QuizPhase from "./pages/QuizPhase";
import VideoIntroPhase from "./pages/VideoIntroPhase";
import ChatSimulationPhase from "./pages/ChatSimulationPhase";
import ChatInterviewPhase from "./pages/ChatInterviewPhase";
import SalesSimulationPhase from "./pages/SalesSimulationPhase";
import VoiceInterviewPhase from "./pages/VoiceInterviewPhase";
import PortfolioUploadPhase from "./pages/PortfolioUploadPhase";
import CreateJob from "./pages/CreateJob";
import GuestJobCreator from "./pages/GuestJobCreator";
import NotFound from "./pages/NotFound";
import MarketingDemo from "./pages/MarketingDemo";
import CandidatePortalLanding from "./pages/CandidatePortalLanding";
import CandidateAuth from "./pages/CandidateAuth";
import VerifyDocument from "./pages/VerifyDocument";
import OAuthGoogleCallback from "./pages/OAuthGoogleCallback";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import DeveloperDashboard from "./pages/DeveloperDashboard";
import DeveloperUsers from "./pages/DeveloperUsers";
import DeveloperSubscriptions from "./pages/DeveloperSubscriptions";
import DeveloperJobs from "./pages/DeveloperJobs";
import DeveloperActivity from "./pages/DeveloperActivity";
import DeveloperSettings from "./pages/DeveloperSettings";

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
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/try-job-creator" element={<GuestJobCreator />} />
                
                {/* Candidate Portal (separate entry point) */}
                <Route path="/candidate" element={<CandidatePortalLanding />} />
                <Route path="/candidate/auth" element={<CandidateAuth />} />
                
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
                  <Route path="/jobs/create" element={<CreateJob />} />
                  <Route path="/jobs/edit/:id" element={<CreateJob />} />
                  <Route path="/applicants" element={<Applicants />} />
                  <Route path="/applicants/:id" element={<ApplicantDetails />} />
                  <Route path="/interviews" element={<Interviews />} />
                  <Route path="/messages" element={<Messages />} />
                  <Route path="/documents" element={<Documents />} />
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
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
