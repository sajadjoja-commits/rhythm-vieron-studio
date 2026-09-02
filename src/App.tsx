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

const App = () => (
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
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AdGateProvider>
    </MediaProvider>
  </TooltipProvider>
);

export default App;
