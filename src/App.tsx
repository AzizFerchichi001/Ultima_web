import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { LocaleProvider } from "@/i18n/locale";
import AuthGuard from "./components/AuthGuard";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Reservation from "./pages/Reservation";
import ReservationDetails from "./pages/ReservationDetails";
import PlayerDashboard from "./pages/PlayerDashboard";
import PlayerNotifications from "./pages/PlayerNotifications";
import PlayerProfile from "./pages/PlayerProfile";
import PlayerReservations from "./pages/PlayerReservations";
import Competitions from "./pages/Competitions";
import LiveScores from "./pages/LiveScores";
import Performance from "./pages/Performance";
import SmartPlayAI from "./pages/SmartPlayAI";
import Admin from "./pages/Admin";
import CompetitionDetails from "./pages/CompetitionDetails";
import Coach from "./pages/Coach";
import Coaches from "./pages/Coaches";
import CoachProfilePage from "./pages/CoachProfilePage";
import CoachProfileEditor from "./pages/CoachProfileEditor";
import CoachAvailability from "./pages/CoachAvailability";
import CoachRequests from "./pages/CoachRequests";
import CoachingRequests from "./pages/CoachingRequests";
import Connections from "./pages/Connections";
import NotFound from "./pages/NotFound";
import About from "./pages/About";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import ReservationChoice from "./pages/ReservationChoice";
import CoachBooking from "./pages/CoachBooking";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import LiveSessionPage from "./pages/LiveSessionPage";
import SuperAdminCalibrationPage from "./pages/SuperAdminCalibrationPage";
import AccountHome from "./pages/AccountHome";
import AccountSettings from "./pages/AccountSettings";
import AccountReservations from "./pages/AccountReservations";
import AccountHistory from "./pages/AccountHistory";
import AccountNotifications from "./pages/AccountNotifications";
import AccountAiAnalysis from "./pages/AccountAiAnalysis";
import AccountLiveSessions from "./pages/AccountLiveSessions";
import AccountCompetitions from "./pages/AccountCompetitions";

const queryClient = new QueryClient();

// Redirect to login when the refresh token expires / is invalid
if (typeof window !== "undefined") {
  window.addEventListener("auth:session-expired", () => {
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  });
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LocaleProvider>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/about-us" element={<About />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/padel" element={<Navigate to="/reservation" replace />} />
              <Route path="/padel/:id" element={<Navigate to="/reservation" replace />} />

              {/* Protected Routes */}
              <Route
                path="/reservation"
                element={<AuthGuard><ReservationChoice /></AuthGuard>}
              />
              <Route
                path="/reservation/court"
                element={<Navigate to="/player/reservations/new" replace />}
              />
              <Route
                path="/reservations/:id"
                element={<AuthGuard><ReservationDetails /></AuthGuard>}
              />
              <Route
                path="/reservation/coach"
                element={<Navigate to="/player/coach-booking" replace />}
              />

              {/* Player workspace routes */}
              <Route path="/player" element={<Navigate to="/account" replace />} />
              <Route path="/player/reservations" element={<AuthGuard><PlayerReservations /></AuthGuard>} />
              <Route path="/player/reservations/new" element={<AuthGuard><Reservation /></AuthGuard>} />
              <Route path="/player/reservations/:id" element={<AuthGuard><ReservationDetails /></AuthGuard>} />
              <Route path="/player/coach-booking" element={<AuthGuard><CoachBooking /></AuthGuard>} />
              <Route path="/player/competitions" element={<Navigate to="/account/competitions" replace />} />
              <Route path="/player/competitions/:id" element={<AuthGuard><CompetitionDetails /></AuthGuard>} />
              <Route path="/player/live" element={<AuthGuard><LiveScores /></AuthGuard>} />
              <Route path="/player/live/:id" element={<AuthGuard><LiveSessionPage /></AuthGuard>} />
              <Route path="/player/ai" element={<Navigate to="/account/ai-analysis" replace />} />
              <Route path="/player/history" element={<Navigate to="/account/history" replace />} />
              <Route path="/player/notifications" element={<Navigate to="/account/notifications" replace />} />
              <Route path="/player/profile" element={<Navigate to="/account/settings" replace />} />

              {/* Account area routes */}
              <Route path="/account" element={<AuthGuard><AccountHome /></AuthGuard>} />
              <Route path="/account/settings" element={<AuthGuard><AccountSettings /></AuthGuard>} />
              <Route path="/account/reservations" element={<AuthGuard><AccountReservations /></AuthGuard>} />
              <Route path="/account/history" element={<AuthGuard><AccountHistory /></AuthGuard>} />
              <Route path="/account/notifications" element={<AuthGuard><AccountNotifications /></AuthGuard>} />
              <Route path="/account/ai-analysis" element={<AuthGuard><AccountAiAnalysis /></AuthGuard>} />
              <Route path="/account/live-sessions" element={<AuthGuard><AccountLiveSessions /></AuthGuard>} />
              <Route path="/account/competitions" element={<AuthGuard><AccountCompetitions /></AuthGuard>} />
              <Route 
                path="/competitions" 
                element={<AuthGuard><Competitions /></AuthGuard>} 
              />
              <Route 
                path="/competitions/:id" 
                element={<AuthGuard><CompetitionDetails /></AuthGuard>} 
              />
              <Route 
                path="/live-scores" 
                element={<AuthGuard><LiveScores /></AuthGuard>} 
              />
              <Route 
                path="/performance" 
                element={<AuthGuard><Performance /></AuthGuard>} 
              />
              <Route
                path="/connections"
                element={<AuthGuard><Connections /></AuthGuard>}
              />
              <Route
                path="/smartplay-ai"
                element={<AuthGuard requireAdmin><SmartPlayAI /></AuthGuard>}
              />
              <Route
                path="/live-sessions/:id"
                element={<LiveSessionPage />}
              />
              <Route
                path="/coach"
                element={<AuthGuard requireCoach><Coach /></AuthGuard>}
              />
              {/* Coaching system */}
              <Route
                path="/coaches"
                element={<AuthGuard><Coaches /></AuthGuard>}
              />
              <Route
                path="/coaches/:id"
                element={<AuthGuard><CoachProfilePage /></AuthGuard>}
              />
              <Route
                path="/coach/profile"
                element={<AuthGuard requireCoach><CoachProfileEditor /></AuthGuard>}
              />
              <Route
                path="/coach/availability"
                element={<AuthGuard requireCoach><CoachAvailability /></AuthGuard>}
              />
              <Route
                path="/coach/requests"
                element={<AuthGuard requireCoach><CoachRequests /></AuthGuard>}
              />
              <Route
                path="/coaching-requests"
                element={<AuthGuard><CoachingRequests /></AuthGuard>}
              />

              <Route
                path="/admin"
                element={<AuthGuard requireAdmin><Admin /></AuthGuard>}
              />
              <Route
                path="/super-admin/calibration"
                element={<AuthGuard requireAdmin><SuperAdminCalibrationPage /></AuthGuard>}
              />

              {/* Stripe payment return pages — no auth guard needed (Stripe redirects here) */}
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </LocaleProvider>
  </QueryClientProvider>
);

export default App;
