import { CallProvider } from "./contexts/CallContext";
import React, { lazy, Suspense, useEffect } from "react";
import { HelmetProvider, Helmet } from "react-helmet-async";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { ThemeProvider } from "./lib/ThemeContext";
import { syncClerkUserToSupabase, isAdmin } from "./lib/authUtils";
import { PortfolioAccessProvider, usePortfolioAccess } from "./lib/PortfolioContext";
import { setSupabaseAuth, supabase } from "./lib/supabase";
import { OnlinePresenceProvider } from "./contexts/OnlinePresenceContext";
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from "motion/react";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

import Home from "./pages/Home";
import OnboardingPage from "./pages/OnboardingPage";
import Products from "./pages/Products";
import Medals from "./pages/Medals";
import CheckoutConfirm from "./pages/CheckoutConfirm";
import Login from "./pages/Login";
import Register from "./pages/Register";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import Chat from "./pages/Chat";
import Learn from "./pages/Learn";
const DYNAMIC_IMPORT_RELOAD_KEY = "plugsy-dynamic-import-reload";
const lazyWithDeploymentRecovery = <T extends React.ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) => lazy(async () => {
  try {
    const module = await load();
    sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
    return module;
  } catch (error) {
    // A deploy can replace hashed chunks while a previous HTML shell remains
    // open. Reload once to retrieve a matching shell and asset manifest.
    if (typeof window !== "undefined" && sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) !== window.location.href) {
      sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, window.location.href);
      window.location.reload();
      return new Promise<never>(() => {});
    }
    throw error;
  }
});

const ChatHub = lazyWithDeploymentRecovery(() => import("./pages/ChatHub"));
import JoinInvite from "./pages/JoinInvite";
import PublicProfile from "./pages/PublicProfile";
const PersonalChat = lazyWithDeploymentRecovery(() => import("./pages/PersonalChat"));
import OrderHistory from "./pages/OrderHistory";
const Admin = lazyWithDeploymentRecovery(() => import("./pages/Admin"));
const AdminChats = lazyWithDeploymentRecovery(() => import("./pages/AdminChats"));
const AdminPortfolioSales = lazyWithDeploymentRecovery(() => import("./pages/AdminPortfolioSales"));
const AdminBroadcast = lazyWithDeploymentRecovery(() => import("./pages/AdminBroadcast"));
import PaymentCallback from "./pages/PaymentCallback";
import PortfolioCallback from "./pages/PortfolioCallback";
const PortfolioDashboard = lazyWithDeploymentRecovery(() => import("./pages/PortfolioDashboard"));
const OneLinkPage = lazyWithDeploymentRecovery(() => import("./pages/OneLinkPage"));
const CreatePortfolio = lazyWithDeploymentRecovery(() => import("./pages/CreatePortfolio").then((module) => ({ default: module.CreatePortfolio })));
const EditPortfolio = lazyWithDeploymentRecovery(() => import("./pages/EditPortfolio").then((module) => ({ default: module.EditPortfolio })));
const PublicPortfolio = lazyWithDeploymentRecovery(() => import("./pages/PublicPortfolio").then((module) => ({ default: module.PublicPortfolio })));
const Wallet = lazyWithDeploymentRecovery(() => import("./pages/Wallet").then((module) => ({ default: module.Wallet })));
const WalletCallback = lazyWithDeploymentRecovery(() => import("./pages/WalletCallback").then((module) => ({ default: module.WalletCallback })));
import { TermsOfService } from "./pages/TermsOfService";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { BackgroundGradientAnimationDemo } from "./components/effects/background-gradient-animation-demo";
import { BackgroundComponentsDemo } from "./components/effects/background-components-demo";
import { DemoHeroGeometric } from "./components/effects/shape-landing-hero-demo";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import ChatWidget from "./components/chat/ChatWidget";
import NotificationBell from "./components/NotificationBell";
import InstallApp from "./components/InstallApp";
import SplashScreen from "./components/SplashScreen";
import LoadingSplash from "./components/LoadingSplash";
import RealtimeNotifications from "./components/RealtimeNotifications";
import { Toaster } from "react-hot-toast";
import { initOneSignal, clearAppBadge, silentlyLinkOneSignalUser, logoutOneSignalUser } from "./utils/onesignal";

const EditPortfolioGuard = () => {
  const { id } = useParams()
  const [allowed, setAllowed] = React.useState<boolean | null>(null)
  const { user } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    const check = async () => {
      if (!id || !user?.id) return

      const { data: portfolio } = await supabase
        .from("vp_portfolios")
        .select("id, user_id, is_paid, admin_granted")
        .eq("id", id)
        .single()

      if (!portfolio) {
        navigate("/portfolio")
        return
      }

      // Must be the owner
      if (portfolio.user_id !== user.id) {
        navigate("/portfolio")
        return
      }

      // Must have paid or be admin granted
      if (!portfolio.is_paid && !portfolio.admin_granted) {
        navigate("/portfolio/new")
        return
      }

      setAllowed(true)
    }
    check()
  }, [id, user?.id, navigate])

  if (allowed === null) return <div>Loading...</div>
  return <EditPortfolio />
}

const LegacyOneLinkRedirect = () => {
  const { username = "" } = useParams<{ username: string }>();
  const location = useLocation();
  return (
    <Navigate
      replace
      to={`/one/${encodeURIComponent(username)}${location.search}${location.hash}`}
    />
  );
};

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { isLoaded: authLoaded, userId, getToken } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();

  const [isSupabaseReady, setIsSupabaseReady] = React.useState(false);
  const [loadTimedOut, setLoadTimedOut] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(!window.navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isReady = authLoaded && userLoaded;

  const isUserAdmin = isAdmin(user);

  useEffect(() => {
    void initOneSignal();
  }, []);

  useEffect(() => {
    if (!user?.id) { void logoutOneSignalUser(); return; }

    const link = async () => {
      await initOneSignal();
      if (!window.OneSignal) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("clerk_id", user.id)
        .single();

      await silentlyLinkOneSignalUser(user.id, profile?.role || "user", getToken);
    };

    void link();
    return () => { void logoutOneSignalUser(); };
  }, [user?.id, getToken]);


  useEffect(() => {
    const unlockAudio = () => {
      const ctx = new (window.AudioContext || 
        (window as any).webkitAudioContext)()
      if (ctx.state === "suspended") ctx.resume()
      document.removeEventListener("click", unlockAudio)
      document.removeEventListener("touchstart", unlockAudio)
    }
    document.addEventListener("click", unlockAudio, { once: true })
    document.addEventListener("touchstart", unlockAudio, { once: true })
  }, [])

  // Presence is the primary source of live online state. This timestamp is a
  // deliberately coarse fallback for clients that cannot join Realtime; a
  // 30-second write per open tab becomes a significant database workload.
  useEffect(() => {
    if (!userId) return;

    let inFlight = false;
    const updateHeartbeat = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await supabase
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .or(`id.eq.${userId},clerk_id.eq.${userId}`);
      } catch (e) {
        console.warn("[heartbeat] Failed to update user heartbeat:", e);
      } finally {
        inFlight = false;
      }
    };

    // Keep the server-side admin fallback accurate even when the browser cannot
    // join Supabase Presence. This only runs for visible tabs.
    // Also refresh when the tab returns to the foreground.
    void updateHeartbeat();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void updateHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = setInterval(() => void updateHeartbeat(), 90 * 1000);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [userId]);

  // Synchronize and clear PWA home-screen app icon badges on load and visibility change
  useEffect(() => {
    // Immediate clear if focused, else sync state
    if (document.visibilityState === "visible") {
      clearAppBadge();
    }

    const handleFocusOrVisibility = () => {
      if (document.visibilityState === "visible") {
        clearAppBadge();
      }
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "NEW_UNREAD_COUNT") {
        const count = event.data.count;
        if (count > 0 && document.visibilityState !== "visible") {
          // Clean existing prefix and prepended badge count representation
          const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
          document.title = `(${count}) ${baseTitle}`;
        }
      }
    };

    window.addEventListener("focus", handleFocusOrVisibility);
    document.addEventListener("visibilitychange", handleFocusOrVisibility);
    
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
    }

    return () => {
      window.removeEventListener("focus", handleFocusOrVisibility);
      document.removeEventListener("visibilitychange", handleFocusOrVisibility);
      if (typeof navigator !== "undefined" && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener("message", handleServiceWorkerMessage);
      }
    };
  }, []);

  useEffect(() => {
    // Failsafe timeout for initialization
    const timer = setTimeout(() => {
      if (!isReady || (userId && !isSupabaseReady)) {
        console.warn(
          "Auth initialization is taking longer than expected. Attempting to continue...",
        );
        setLoadTimedOut(true);
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [isReady, userId, isSupabaseReady]);

  useEffect(() => {
    async function initAuth() {
      if (isReady) {
        try {
          if (userId) {
            await setSupabaseAuth(getToken);
          }
        } catch (error) {
          console.error("Supabase Auth bridge initialization failed:", error);
        } finally {
          setIsSupabaseReady(true);
        }
      }
    }
    initAuth();
  }, [isReady, userId, getToken]);

  useEffect(() => {
    async function syncUser() {
      if (isReady && userId && user && isSupabaseReady) {
        try {
          await syncClerkUserToSupabase(user, getToken);
        } catch (error) {
          console.error("Error syncing user:", error);
        }
      }
    }
    syncUser();
  }, [isReady, userId, user, isSupabaseReady, getToken]);

  // Combined loading condition
  const showSpinner =
    !loadTimedOut && (!isReady || (userId && !isSupabaseReady));

  if (showSpinner) {
    return <LoadingSplash />;
  }

  if (isOffline) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-white/10 dark:bg-[#0D0D0F]/70 backdrop-blur-3xl border border-white/20 p-8 rounded-3xl shadow-2xl relative flex flex-col items-center max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">You're Offline</h2>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            Please check your internet connection. We will automatically reconnect you once your network is restored.
          </p>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/50 w-1/3 animate-ping rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <HelmetProvider>
      <Toaster position="top-center" containerStyle={{ zIndex: 99999 }} />
      <RealtimeNotifications />
      <Helmet>
        <title>Plugsy | smart, low cost &amp; for all.</title>
        <meta
          name="description"
          content="Simple digital solution built around what you actually need."
        />
      </Helmet>
      <SplashScreen />
      <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
      <ThemeProvider>
        <PortfolioAccessProvider>
          <Router>
            <OnlinePresenceProvider>
              <ScrollToTop />
              <AppContent user={user} userId={userId} isUserAdmin={isUserAdmin} />
            </OnlinePresenceProvider>
          </Router>
        </PortfolioAccessProvider>
      </ThemeProvider>
      </MotionConfig>
    </HelmetProvider>
  );
}


function AppContent({
  user,
  userId,
  isUserAdmin,
}: {
  user: any;
  userId: string | null | undefined;
  isUserAdmin: boolean;
}) {
  const { isPortfolioUnlocked } = usePortfolioAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const isAdminPage = location.pathname.startsWith("/admin");
  const isVpPage = location.pathname.startsWith("/vp/");
  const isChatsPage = location.pathname === "/admin/chats";
  const isMessagingPage = 
    location.pathname.startsWith("/chats") || 
    location.pathname === "/status" || 
    location.pathname === "/chat" || 
    location.pathname === "/support";
  const isPersonalChatPage = location.pathname.startsWith("/chats/") && location.pathname !== "/chats";

  useEffect(() => {
    // If authenticated and on login/register pages, force immediate redirect
    const authPaths = [
      "/login",
      "/register",
      "/signup",
      "/sign-in",
      "/sign-up",
    ];
    if (
      userId &&
      authPaths.some((path) => location.pathname.startsWith(path))
    ) {
      navigate(isUserAdmin ? "/admin" : "/dashboard", { replace: true });
    }
  }, [userId, location.pathname, navigate, isUserAdmin]);

  // Deep linking: navigate to targeted paths from notification payload data on tap
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push((OneSignal: any) => {
      OneSignal.Notifications.addEventListener("click", (event: any) => {
        console.log("[OneSignal] Notification tap detected:", event);
        const data = event.notification?.additionalData;
        if (data) {
          if (data.chatId || data.type === "message") {
            navigate("/dashboard/messages");
          } else if (data.portfolioId || data.type === "reaction") {
            navigate(`/portfolio/${data.portfolioId}`);
          } else if (data.url) {
            try {
              const urlObj = new URL(data.url, window.location.origin);
              navigate(urlObj.pathname + urlObj.search);
            } catch {
              if (data.url.startsWith("/")) {
                navigate(data.url);
              }
            }
          }
        }
      });
    });
  }, [navigate]);

  const mainRoutes = (
    <AnimatePresence initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="w-full h-full flex-grow flex flex-col overflow-x-hidden"
      >
        <GlobalErrorBoundary>
        <Suspense fallback={<LoadingSplash />}>
        <Routes location={location}>
          <Route
            path="/"
            element={
              userId ? (
                <Navigate to={isUserAdmin ? "/admin" : "/dashboard"} replace />
              ) : (
                <OnboardingPage />
              )
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/products" element={<Products />} />
          <Route path="/medals" element={<Medals />} />
          <Route
            path="/checkout/confirm"
            element={
              userId ? (
                <CheckoutConfirm />
              ) : (
                <Navigate to="/login?redirect=/checkout/confirm" />
              )
            }
          />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/portfolio/callback" element={<PortfolioCallback />} />
          <Route
            path="/demo/gradient"
            element={<BackgroundGradientAnimationDemo />}
          />
          <Route path="/demo/glow" element={<BackgroundComponentsDemo />} />
          <Route path="/demo/shape" element={<DemoHeroGeometric />} />
          <Route 
            path="/vp/:slug" 
            element={
              <GlobalErrorBoundary>
                <PublicPortfolio />
              </GlobalErrorBoundary>
            } 
          />
          <Route path="/coming-soon" element={<ComingSoon />} />
          <Route
            path="/login"
            element={
              !userId ? (
                <Login />
              ) : (
                <Navigate to={isUserAdmin ? "/admin" : "/dashboard"} />
              )
            }
          />
          <Route
            path="/register"
            element={
              !userId ? (
                <Register />
              ) : (
                <Navigate to={isUserAdmin ? "/admin" : "/dashboard"} />
              )
            }
          />
          <Route
            path="/signup"
            element={
              !userId ? (
                <Register />
              ) : (
                <Navigate to={isUserAdmin ? "/admin" : "/dashboard"} />
              )
            }
          />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              userId ? (
                isUserAdmin ? (
                  <Navigate to="/admin" />
                ) : (
                  <Dashboard />
                )
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/wallet"
            element={
              userId ? <Wallet /> : <Navigate to="/login?redirect=/wallet" />
            }
          />
          <Route
            path="/wallet/history"
            element={
              userId ? <Wallet showHistoryOnly={true} /> : <Navigate to="/login?redirect=/wallet" />
            }
          />
          <Route path="/wallet/callback" element={<WalletCallback />} />
          <Route
            path="/portfolio"
            element={
              userId ? <PortfolioDashboard /> : <Navigate to="/login" />
            }
          />
          <Route
            path="/portfolio/new"
            element={
              userId ? (
                <GlobalErrorBoundary>
                  <CreatePortfolio />
                </GlobalErrorBoundary>
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/portfolio/:id/edit"
            element={
              userId ? <EditPortfolioGuard /> : <Navigate to="/login" />
            }
          />
          <Route
            path="/chat"
            element={userId ? <Chat /> : <Navigate to="/login" />}
          />
          <Route
            path="/support"
            element={userId ? <Chat /> : <Navigate to="/login" />}
          />
          <Route
            path="/chats"
            element={userId ? <ChatHub /> : <Navigate to="/login" />}
          />
          <Route
            path="/status"
            element={userId ? <ChatHub defaultTab="status" /> : <Navigate to="/login" />}
          />
          <Route
            path="/chats/:chatId"
            element={userId ? <PersonalChat /> : <Navigate to="/login" />}
          />
          <Route
            path="/join/:inviteCode"
            element={<JoinInvite />}
          />
          <Route
            path="/u/:username"
            element={<LegacyOneLinkRedirect />}
          />
          <Route
            path="/one/:username"
            element={<PublicProfile />}
          />
          <Route
            path="/learn"
            element={userId ? <Learn /> : <Navigate to="/login" />}
          />
          <Route
            path="/orders"
            element={userId ? <OrderHistory /> : <Navigate to="/login" />}
          />
          <Route
            path="/onelink"
            element={userId ? <OneLinkPage /> : <Navigate to="/login" />}
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              userId && isUserAdmin ? (
                <Admin />
              ) : userId ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/admin/chats"
            element={
              userId && isUserAdmin ? (
                <AdminChats />
              ) : userId ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/admin/portfolio-sales"
            element={
              userId && isUserAdmin ? (
                <AdminPortfolioSales />
              ) : userId ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/admin/broadcast"
            element={
              userId && isUserAdmin ? (
                <AdminBroadcast />
              ) : userId ? (
                <Navigate to="/dashboard" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        </Suspense>
        </GlobalErrorBoundary>
      </motion.div>
    </AnimatePresence>
  );

  const isChatsView = location.pathname.startsWith("/chats");
  const isStandalonePage = isVpPage || location.pathname === "/onelink" || location.pathname.startsWith("/one/") || location.pathname.startsWith("/u/");

  if (isStandalonePage) {
    return (
      <CallProvider>
        <div className="min-h-screen w-full overflow-x-hidden">{mainRoutes}</div>
      </CallProvider>
    );
  }

  return (
    <CallProvider>
      <div className={`min-h-screen flex flex-col ${isChatsPage || isChatsView ? "h-screen overflow-hidden" : ""}`}>
        {!isAdminPage && !isChatsView && <Navbar />}
        <main
          className={`flex-grow ${isAdminPage || isChatsView ? "" : "pt-16"} transition-all duration-300 ease-in-out w-full max-w-[100vw] ${isChatsPage || isChatsView ? "h-full overflow-hidden" : "overflow-x-hidden"}`}
        >
          {mainRoutes}
        </main>
        {!isMessagingPage && <ChatWidget />}
        <NotificationBell />
        <InstallApp />
      </div>
    </CallProvider>
  );
}
