import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import { MediaProvider } from "./context/MediaContext";
import { AdGateProvider } from "./context/AdGateContext";
import InstallPrompt from "./components/InstallPrompt";
import UpdateNotifier from "./components/UpdateNotifier";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <MediaProvider>
        <AdGateProvider>
          <BrowserRouter>
            <InstallPrompt />
            <UpdateNotifier />
            <Routes>
              <Route path="/" element={<Index />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AdGateProvider>
      </MediaProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
