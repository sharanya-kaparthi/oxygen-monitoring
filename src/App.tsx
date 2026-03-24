import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppHeader from "@/components/AppHeader";
import HomePage from "@/pages/HomePage";
import NurseDashboard from "@/pages/NurseDashboard";
import RoomDetail from "@/pages/RoomDetail";
import MaintenanceDashboard from "@/pages/MaintenanceDashboard";
import AdminPanel from "@/pages/AdminPanel";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppHeader />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/nurse" element={<NurseDashboard />} />
          <Route path="/nurse/room/:id" element={<RoomDetail />} />
          <Route path="/maintenance" element={<MaintenanceDashboard />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
