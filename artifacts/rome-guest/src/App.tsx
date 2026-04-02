import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import GuestChat from "./pages/guest";
import CeoPanel from "./pages/ceo";
import Landing from "./pages/landing";
import HostDashboard from "./pages/host-dashboard";
import HostProperties from "./pages/host-properties";
import HostLogin from "./pages/login";
import ForgotPassword from "./pages/forgot-password";
import ResetPassword from "./pages/reset-password";
import SetupPassword from "./pages/setup-password";
import PrivacyPolicy from "./pages/privacy";
import DiarioDiBordo from "./pages/diario";
import SignupRedirect from "./pages/signup-redirect";
import DemoPage from "./pages/demo";

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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
