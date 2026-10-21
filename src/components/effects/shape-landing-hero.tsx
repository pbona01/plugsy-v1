"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type PortfolioHaloFieldProps = {
  className?: string;
  variant?: "indigo" | "teal";
};

/** Plugsy-owned ambient backdrop with no template copy or third-party badge. */
function PortfolioHaloField({ className, variant = "indigo" }: PortfolioHaloFieldProps) {
  const isTeal = variant === "teal";
  const primary = isTeal ? "rgba(20,184,166,.22)" : "rgba(59,130,246,.25)";
  const secondary = isTeal ? "rgba(45,212,191,.13)" : "rgba(129,140,248,.16)";

  return (
    <div className={cn("relative min-h-screen w-full overflow-hidden bg-transparent", className)} aria-hidden="true">
      <div
        className="absolute inset-0 opacity-80"
        style={{ backgroundImage: `radial-gradient(circle at 18% 16%, ${primary}, transparent 26%), radial-gradient(circle at 86% 78%, ${secondary}, transparent 30%)` }}
      />
      <motion.div
        className="absolute -left-40 top-[9%] h-[32rem] w-[32rem] rounded-[42%] border"
        style={{ borderColor: primary, boxShadow: `inset 0 0 90px ${secondary}` }}
        animate={{ rotate: [8, 18, 8], scale: [1, 1.06, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-28 top-[42%] h-80 w-[39rem] rounded-[55%] border"
        style={{ borderColor: secondary, boxShadow: `0 0 100px ${secondary}` }}
        animate={{ rotate: [-14, -5, -14], y: [0, -20, 0] }}
        transition={{ duration: 21, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage: "linear-gradient(115deg, transparent 0 47%, rgba(255,255,255,.16) 48%, transparent 49%), linear-gradient(25deg, transparent 0 47%, rgba(255,255,255,.10) 48%, transparent 49%)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,.62)_100%)]" />
    </div>
  );
}

export { PortfolioHaloField };
