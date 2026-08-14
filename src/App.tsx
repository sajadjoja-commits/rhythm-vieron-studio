import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { MediaProvider } from "./context/MediaContext";
import { AdGateProvider } from "./context/AdGateContext";
import InstallPrompt from "./components/InstallPrompt";
import UpdateNotifier from "./components/UpdateNotifier";
import ErrorBoundary from "./components/ErrorBoundary";
import EditorEnhancements from "./components/editor/EditorEnhancements";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <MediaProvider>
          <AdGateProvider>
            <BrowserRouter>
              <InstallPrompt />
              <UpdateNotifier />
              <EditorEnhancements />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </AdGateProvider>
        </MediaProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
