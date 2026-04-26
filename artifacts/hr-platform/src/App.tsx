import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

// Public Pages
import Home from "@/pages/public/home";
import Careers from "@/pages/public/careers";
import JobDetailPublic from "@/pages/public/job-detail";
import Login from "@/pages/login";

// Protected Pages
import Dashboard from "@/pages/dashboard";
import Jobs from "@/pages/jobs/index";
import NewJob from "@/pages/jobs/new";
import EditJob from "@/pages/jobs/[id]";
import JobCandidates from "@/pages/jobs/[id]-candidates";
import Candidates from "@/pages/candidates/index";
import CandidateProfile from "@/pages/candidates/[id]";
import UploadResume from "@/pages/resumes/upload";
import Interviews from "@/pages/interviews/index";
import NewInterview from "@/pages/interviews/new";
import Analytics from "@/pages/analytics";
import Admin from "@/pages/admin/index";
import AITools from "@/pages/ai-tools";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component, adminOnly = false, ...rest }: any) {
  return (
    <Route
      {...rest}
      component={(props) => {
        const { user, isLoading } = useAuth();

        if (isLoading) {
          return <div className="min-h-screen flex items-center justify-center bg-slate-50">Loading...</div>;
        }

        if (!user) {
          window.location.href = import.meta.env.BASE_URL + "login";
          return null;
        }

        if (adminOnly && user.role !== "admin") {
          return <div className="min-h-screen flex items-center justify-center">Access Denied. Admins only.</div>;
        }

        return <Component {...props} />;
      }}
    />
  );
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/careers" component={Careers} />
      <Route path="/login" component={Login} />

      {/* Protected Routes — specific paths before parameterized ones */}
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/jobs/new" component={NewJob} />
      <ProtectedRoute path="/jobs/:id/edit" component={EditJob} />
      <ProtectedRoute path="/jobs/:id/candidates" component={JobCandidates} />
      <ProtectedRoute path="/jobs" component={Jobs} />

      {/* Public job detail — after protected /jobs/* routes */}
      <Route path="/jobs/:id" component={JobDetailPublic} />
      <ProtectedRoute path="/candidates" component={Candidates} />
      <ProtectedRoute path="/candidates/:id" component={CandidateProfile} />
      <ProtectedRoute path="/upload-resume" component={UploadResume} />
      <ProtectedRoute path="/interviews" component={Interviews} />
      <ProtectedRoute path="/interviews/new" component={NewInterview} />
      <ProtectedRoute path="/analytics" component={Analytics} />
      <ProtectedRoute path="/admin" component={Admin} adminOnly />
      <ProtectedRoute path="/ai-tools" component={AITools} />
      <ProtectedRoute path="/settings" component={SettingsPage} />

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
