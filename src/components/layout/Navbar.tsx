import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useUser, useAuth, UserButton } from "@clerk/clerk-react";
import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { useUnreadMessages } from "../../hooks/useUnreadMessages";
import {
  LayoutDashboard,
  MessageCircle,
  Home,
  Package,
  Image,
  LogIn,
  ChevronLeft,
  LifeBuoy,
  Award,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeToggle } from "../ui/curtain-theme-toggle";
import { Logo } from "../ui/Logo";
import { isAdmin } from "../../lib/authUtils";
import { GlassBottomNav } from "apple-liquid-glass-ui";

export default function Navbar() {
  const { user } = useUser();
  const { userId } = useAuth();
  const { unreadCount } = useUnreadMessages();
  const location = useLocation();
  const navigate = useNavigate();

  const isUserAdmin = isAdmin(user);
  const effectiveRole = isUserAdmin ? "admin" : "user";

  const handleCloseChat = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeMedal, setActiveMedal] = useState<any>(null);

  useEffect(() => {
    if (!userId) {
      setActiveMedal(null);
      return;
    }

    const fetchMedal = async () => {
      try {
        const res = await fetch(`/api/payments?action=get-medal-status&userId=${userId}&t=${Date.now()}`);
        const data = await res.json();
        if (data?.success && data?.medal) {
          setActiveMedal(data.medal);
        }
      } catch (err) {
        console.warn("Navbar medal fetch error:", err);
      }
    };

    fetchMedal();
  }, [userId]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    
    // Track if 'dark' is in html classes
    setIsDarkMode(document.documentElement.classList.contains("dark"));

    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const userLinks = [
    ...(userId ? [] : [{ name: "Home", href: "/", icon: Home }]),
    { name: "All Products", href: "/products", icon: Package },
    { name: "Portfolio", href: "/portfolio", icon: Image },
    { name: "About", href: "/about", icon: null },
    ...(userId ? [
      { name: "Chats", href: "/chats", icon: MessageCircle },
    ] : []),
    { name: "Support", href: "/chat", icon: LifeBuoy },
  ];

  const adminLinks = [
    { name: "Overview", href: "/admin?tab=overview", icon: LayoutDashboard },
    { name: "Support", href: "/admin/chats", icon: MessageCircle },
    { name: "Inventory", href: "/admin?tab=plans", icon: Package },
    { name: "Orders", href: "/admin?tab=orders", icon: null },
    { name: "Portfolios", href: "/portfolio", icon: Image },
  ];

  const navLinks = effectiveRole === "admin" ? adminLinks : userLinks;

  let mobileLinks = [];
  if (effectiveRole === "admin") {
    mobileLinks = [
      { name: "Admin", href: "/admin?tab=overview", icon: LayoutDashboard },
      { name: "Support", href: "/admin/chats", icon: MessageCircle },
      { name: "Plans", href: "/admin?tab=plans", icon: Package },
      { name: "Portfolios", href: "/portfolio", icon: Image },
    ];
  } else {
    mobileLinks = [
      { name: "Home", href: "/", icon: Home },
      { name: "Products", href: "/products", icon: Package },
      { name: "Portfolio", href: "/portfolio", icon: Image },
      ...(userId ? [
        { name: "Chats", href: "/chats", icon: MessageCircle },
      ] : []),
      { name: "Support", href: "/chat", icon: LifeBuoy },
    ];
  }

  return (
    <>
    <div className="fixed inset-x-0 z-[9999] top-2 sm:top-6 px-4 sm:px-6 pointer-events-none flex justify-center">
      <GlassBottomNav className="nav-bottom-match pointer-events-auto w-full max-w-[360px] md:max-w-7xl grid items-center px-3 py-3 rounded-full overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            {(location.pathname === "/chat" || location.pathname === "/support") && (
              <motion.button 
                whileTap={{ scale: 0.92 }}
                onClick={handleCloseChat}
                className="p-2 mr-1 text-slate-500 hover:text-slate-900 dark:text-white/60 dark:hover:text-white transition-colors duration-200 cursor-pointer flex items-center justify-center shrink-0 z-50"
              >
                <ChevronLeft size={24}/>
              </motion.button>
            )}
            <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
              <Logo className="h-7 sm:h-8 w-auto object-contain transition-transform group-hover:scale-105" />
              <span className={cn(
                "text-lg sm:text-2xl font-bold tracking-[-0.04em] font-display transition-colors",
                isDarkMode ? "text-white" : "text-slate-900"
              )}>
                Plugsy<span className="text-brand-accent">.</span>
              </span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                to={link.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-brand-accent",
                  (location.pathname === link.href || location.search.includes(link.href)) ? "text-brand-accent" : "text-slate-600 dark:text-white/60"
                )}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle variant="icon" />

            {/* Medal Display - Always visible if user has one */}
            {activeMedal && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/medals')}
                className={cn(
                  "relative p-1.5 rounded-xl border shadow-lg transition-all overflow-hidden group",
                  activeMedal.name.includes("Gold") ? "bg-amber-400/10 border-amber-400/30 text-amber-500 shadow-amber-500/10" :
                  activeMedal.name.includes("Silver") ? "bg-slate-400/10 border-slate-400/30 text-slate-400 shadow-slate-400/10" :
                  "bg-orange-500/10 border-orange-500/30 text-orange-500 shadow-orange-500/10"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Award size={20} className={cn(
                  "relative z-10",
                  activeMedal.name.includes("Gold") ? "drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : ""
                )} />
              </motion.button>
            )}

            <div className="hidden md:flex items-center border-l border-brand-border/50 pl-4">
              {userId ? (
                <div className={cn(
                  "flex items-center gap-4 border rounded-full p-1.5 pr-2.5 transition-all duration-300",
                  isDarkMode 
                    ? "bg-black/40 border-white/10 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]" 
                    : "bg-black/5 border-slate-950/10 shadow-[inset_0_0_20px_rgba(0,0,0,0.01)]"
                )}>
                  <Link
                    to={effectiveRole === "admin" ? "/admin" : "/dashboard"}
                    className="portfolio-btn text-[11px] px-6 py-2.5 bg-gradient-to-b from-[#0055FF] to-[#0038CC] hover:from-[#0066FF] hover:to-[#0044EE] transition-all rounded-full font-black uppercase tracking-[0.05em] text-white shadow-[0_4px_14px_0_rgba(0,85,255,0.39)] border border-white/10"
                  >
                    {effectiveRole === "admin" ? "Admin" : "Dashboard"}
                  </Link>
                  <UserButton
                    appearance={{
                      elements: {
                        footer: "hidden",
                        userButtonAvatarBox: cn(
                          "w-8 h-8 rounded-full border transition-colors",
                          isDarkMode ? "border-white/20" : "border-slate-950/20"
                        ),
                      },
                    }}
                    afterSignOutUrl="/"
                  />
                </div>
              ) : (
                <Link to="/register" className="portfolio-btn text-xs px-6 py-2.5 rounded-full font-bold uppercase tracking-wider">
                  Join Now
                </Link>
              )}
            </div>

            <div className="md:hidden flex items-center">
              {userId ? (
                <div className="w-8 h-8 flex items-center justify-center">
                  <UserButton
                    appearance={{ elements: { footer: "hidden" } }}
                    afterSignOutUrl="/"
                  />
                </div>
              ) : (
                <Link
                  to="/login"
                  className="p-2 bg-brand-surface rounded-full shadow-sm border border-brand-border text-brand-text-secondary hover:text-brand-text"
                >
                  <LogIn className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </GlassBottomNav>
    </div>

    {/* Immersive Mobile Bottom Navigation */}
    <div className="md:hidden fixed bottom-6 inset-x-0 z-40 px-4 pointer-events-none flex justify-center">
      <GlassBottomNav
        className="nav-bottom-match pointer-events-auto flex-1 max-w-[360px] grid items-center px-3 py-3 rounded-full overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${mobileLinks.length}, minmax(0, 1fr))` }}
      >
        {mobileLinks.map((link) => {
          const isActive =
            location.pathname === link.href ||
            (link.href.startsWith("/#") &&
              location.hash === link.href.substring(1));
          return (
            <React.Fragment key={link.name}>
                <Link
                  to={link.href}
                  className={`flex-1 flex items-center justify-center ${isActive ? "text-brand-accent" : "text-brand-text-secondary hover:text-brand-text"}`}
                >
                  <div className="flex flex-col items-center justify-center w-full">
                    <div className="relative">
                      {link.icon && <link.icon className="w-[18px] h-[18px] shrink-0" />}
                      {(link.href === "/chat" || link.href === "/admin/chats") && unreadCount > 0 && (
                        <span 
                          className="absolute -top-1 -right-1.5 w-[14px] h-[14px] rounded-full bg-blue-600 border border-white dark:border-[#0A0A0C] text-white flex items-center justify-center text-[7px] font-black shadow-md animate-pulse"
                          style={{ zIndex: 40 }}
                        >
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold tracking-widest uppercase hidden md:inline">
                      {link.name}
                    </span>
                  </div>
                </Link>
            </React.Fragment>
          );
        })}
      </GlassBottomNav>
    </div>
    </>
  );
}
