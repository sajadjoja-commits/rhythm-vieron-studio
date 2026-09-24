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
import ErrorBoundary from "./components/ErrorBoundary";
import { useEffect } from "react";
import { webUpdateService } from "@/services/ota";

const queryClient = new QueryClient();

function OtaLifecycleManager() {
  useEffect(() => {
    // 1. Notify native engine that React has mounted and hydrated successfully
    webUpdateService.notifyStartupSuccess();

    // 2. Non-blocking asynchronous update check after app startup
    const timer = setTimeout(() => {
      webUpdateService.checkForUpdate().catch(() => {});
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OtaLifecycleManager />
        <MediaProvider>
          <AdGateProvider>
            <BrowserRouter>
              <InstallPrompt />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
