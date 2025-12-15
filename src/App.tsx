import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Applicants from "./pages/Applicants";
import ApplicantDetails from "./pages/ApplicantDetails";
import Interviews from "./pages/Interviews";
import Messages from "./pages/Messages";
import Documents from "./pages/Documents";
import Team from "./pages/Team";
import TeamPortal from "./pages/TeamPortal";
import JoinTeam from "./pages/JoinTeam";
import Analytics from "./pages/Analytics";
import ApplyWithCode from "./pages/ApplyWithCode";
import JobDetails from "./pages/JobDetails";
import Applications from "./pages/Applications";
import CandidateApplicationDetail from "./pages/CandidateApplicationDetail";
import TypingTestPhase from "./pages/TypingTestPhase";
import QuizPhase from "./pages/QuizPhase";
import VideoIntroPhase from "./pages/VideoIntroPhase";
import ChatSimulationPhase from "./pages/ChatSimulationPhase";
import ChatInterviewPhase from "./pages/ChatInterviewPhase";
import SalesSimulationPhase from "./pages/SalesSimulationPhase";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import CreateJob from "./pages/CreateJob";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            
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
              <Route path="/applications/:id/typing-test/:stepId" element={<TypingTestPhase />} />
              <Route path="/applications/:id/quiz/:stepId" element={<QuizPhase />} />
              <Route path="/applications/:id/video-intro/:stepId" element={<VideoIntroPhase />} />
              <Route path="/applications/:id/chat-simulation/:stepId" element={<ChatSimulationPhase />} />
              <Route path="/applications/:id/chat-interview/:stepId" element={<ChatInterviewPhase />} />
              <Route path="/applications/:id/sales-simulation/:stepId" element={<SalesSimulationPhase />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            
            {/* Join Team (outside AppLayout) */}
            <Route path="/join-team/:code" element={<JoinTeam />} />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
