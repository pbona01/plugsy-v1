import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

type DashboardBackButtonProps = {
  /** Keep the control out of public pages and sign-in flows. */
  visible: boolean;
  /** Lets a full-width heading keep its natural leading edge on compact screens. */
  alignRight?: boolean;
};

/**
 * A single, predictable escape hatch for signed-in workspace pages.
 * It intentionally links to the page's stable parent rather than browser
 * history, so people always know where they will land after opening a direct link.
 */
export default function DashboardBackButton({ visible, alignRight = false }: DashboardBackButtonProps) {
  const location = useLocation();
  if (!visible) return null;

  const destination = location.pathname.startsWith("/marketplace/seller")
    ? "/marketplace"
    : "/dashboard";
  const label = destination === "/marketplace" ? "Back to marketplace" : "Back to dashboard";

  return (
    <Link
      to={destination}
      aria-label={label}
      className={`fixed top-4 z-[80] inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-border bg-brand-surface/95 px-3 text-xs font-black uppercase tracking-wide text-brand-text shadow-lg backdrop-blur-xl transition hover:border-brand-accent/50 hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg ${alignRight ? "right-4" : "left-4"}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">{destination === "/marketplace" ? "Marketplace" : "Dashboard"}</span>
      <LayoutDashboard className="hidden h-4 w-4 sm:block" aria-hidden="true" />
    </Link>
  );
}
