import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

const GuestChat = lazy(() => import("./pages/guest"));
const CeoPanel = lazy(() => import("./pages/ceo"));
const Landing = lazy(() => import("./pages/landing"));
const HostDashboard = lazy(() => import("./pages/host-dashboard"));
const HostProperties = lazy(() => import("./pages/host-properties"));
const HostLogin = lazy(() => import("./pages/login"));
const ForgotPassword = lazy(() => import("./pages/forgot-password"));
const ResetPassword = lazy(() => import("./pages/reset-password"));
const SetupPassword = lazy(() => import("./pages/setup-password"));
const PrivacyPolicy = lazy(() => import("./pages/privacy"));
const DiarioDiBordo = lazy(() => import("./pages/diario"));
const SignupRedirect = lazy(() => import("./pages/signup-redirect"));
const DemoPage = lazy(() => import("./pages/demo"));

function RouteFallback() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={HostLogin} />
        <Route path="/ceo" component={CeoPanel} />
        <Route path="/admin">
          <Redirect to="/ceo" />
        </Route>
        <Route path="/demo" component={DemoPage} />
        <Route path="/guest/:slug" component={GuestChat} />
        <Route path="/signup" component={SignupRedirect} />
        <Route path="/host/dashboard" component={HostProperties} />
        <Route path="/host/:slug" component={HostDashboard} />
        <Route path="/diario/:slug" component={DiarioDiBordo} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password/:token" component={ResetPassword} />
        <Route path="/setup-password/:token" component={SetupPassword} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <Analytics />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
