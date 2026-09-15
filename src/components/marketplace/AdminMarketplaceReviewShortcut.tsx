import { Link } from "react-router-dom";
import { FileCheck2 } from "lucide-react";

export default function AdminMarketplaceReviewShortcut() {
  return <Link to="/admin/marketplace/files" className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-brand-surface px-4 py-3 text-sm font-black text-brand-text shadow-2xl transition hover:-translate-y-0.5 hover:border-amber-400">
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400/15 text-amber-500"><FileCheck2 size={18} /></span>
    <span><span className="block">Review uploaded files</span><span className="block text-[10px] font-semibold text-brand-text-secondary">Approve files before publishing</span></span>
  </Link>;
}
