import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";

type DashboardBackButtonProps = {
  /** Keep the control out of public pages and sign-in flows. */
  visible: boolean;
};

/**
 * A single, predictable escape hatch for signed-in workspace pages.
 * It intentionally links to the dashboard instead of browser history: people
 * always know where they will land, even after opening a shared URL.
 */
export default function DashboardBackButton({ visible }: DashboardBackButtonProps) {
  if (!visible) return null;

  return (
    <Link
      to="/dashboard"
      aria-label="Back to dashboard"
      className="fixed left-4 top-4 z-[80] inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-border bg-brand-surface/95 px-3 text-xs font-black uppercase tracking-wide text-brand-text shadow-lg backdrop-blur-xl transition hover:border-brand-accent/50 hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Dashboard</span>
      <LayoutDashboard className="hidden h-4 w-4 sm:block" aria-hidden="true" />
    </Link>
  );
}
