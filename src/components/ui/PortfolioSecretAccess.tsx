import React, { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { isAdmin } from "../../lib/authUtils";
import { motion, AnimatePresence } from "motion/react";
import { usePortfolioAccess } from "../../lib/PortfolioContext";

export const PortfolioSecretAccess = ({
  children,
  className,
  onClickLocked,
}: {
  children: React.ReactNode;
  className?: string;
  onClickLocked?: () => void;
}) => {
  const { isPortfolioUnlocked, setIsPortfolioUnlocked } = usePortfolioAccess();
  const { user } = useUser();
  const navigate = useNavigate();
  const isUserAdmin = isAdmin(user);

  const [tapCount, setTapCount] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    };
  }, []);

  const handlePointerDownCapture = (e: React.PointerEvent) => {
    if (isPortfolioUnlocked) return;

    // Prevent default clicking/drag behavior on pointer-based trigger for high-speed tapping
    e.preventDefault();
    e.stopPropagation();

    // Reset tap count after 2.5 seconds of inactivity
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Show indicator/hint starting at 3 taps so they can see active tracking
    if (newCount >= 3) {
      setShowHint(true);
    }

    // Trigger immediate haptic vibe and save active portfolio states upon reaching 10 taps
    if (newCount >= 10) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(100);
        } catch (err) {
          console.log("Haptic feedback failed", err);
        }
      }

      setIsPortfolioUnlocked(true);
      setTapCount(0);
      setShowHint(false);

      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    } else {
      touchTimerRef.current = setTimeout(() => {
        setTapCount(0);
        setShowHint(false);
      }, 2500); // 2.5-second reset window
    }
  };

  const handleContainerClickCapture = (e: React.MouseEvent) => {
    if (!isPortfolioUnlocked) {
      // Locked, block standard click in capture phase so children links never trigger
      e.preventDefault();
      e.stopPropagation();
      if (onClickLocked) {
        onClickLocked();
      }
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (isPortfolioUnlocked) {
      // If the clicked target was already a link, let the browser/router do its work.
      // Otherwise, navigate as a fallback for pure span/div wrappers (like header navbar items).
      const target = e.target as HTMLElement;
      if (!target.closest("a")) {
        navigate("/portfolio");
      }
    }
  };

  // Locked/Coming Soon fallback interface
  return (
    <div
      onPointerDownCapture={handlePointerDownCapture}
      onTouchStartCapture={handlePointerDownCapture}
      onClickCapture={handleContainerClickCapture}
      onClick={handleContainerClick}
      className={`relative flex items-center justify-center cursor-pointer select-none ${className || ""}`}
    >
      {/* We apply opacity-40 to make it look "locked" but it's still clickable and goes to /portfolio (which shows coming soon) */}
      <div className={`transition-opacity flex items-center justify-center w-full relative ${isPortfolioUnlocked ? "opacity-100" : "opacity-40 hover:opacity-100"}`}>
        {!isPortfolioUnlocked && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-[-16px] md:left-[-18px] opacity-80 shrink-0 hidden md:block"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        )}
        {children}
      </div>

      {/* High-speed counter indicator display */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] text-brand-accent tracking-widest whitespace-nowrap opacity-95 font-bold z-50 pointer-events-none bg-black/80 px-2 py-0.5 rounded border border-brand-accent/30 shadow-lg uppercase"
          >
            {10 - tapCount} taps remaining...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
