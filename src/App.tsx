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
import Interviews from "./pages/Interviews";
import Messages from "./pages/Messages";
import Documents from "./pages/Documents";
import Team from "./pages/Team";
import Analytics from "./pages/Analytics";
import FindJobs from "./pages/FindJobs";
import Applications from "./pages/Applications";
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
              <Route path="/applicants" element={<Applicants />} />
              <Route path="/interviews" element={<Interviews />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/team" element={<Team />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/find-jobs" element={<FindJobs />} />
              <Route path="/applications" element={<Applications />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
