import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import GuestChat from "./pages/guest";
import CeoPanel from "./pages/ceo";
import Landing from "./pages/landing";
import HostDashboard from "./pages/host-dashboard";

// Create a client — no background refetching on reconnect or window focus
// to prevent HMR reconnections from resetting in-progress form state
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000, // data stays fresh 5 minutes
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/ceo" component={CeoPanel} />
      <Route path="/admin">
        <Redirect to="/ceo" />
      </Route>
      <Route path="/guest/:slug" component={GuestChat} />
      <Route path="/host/:slug" component={HostDashboard} />
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
