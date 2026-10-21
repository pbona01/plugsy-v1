import { useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import toast from "react-hot-toast";

export function ProductReviewPanel({ productTitle, onClose, onSubmit }: { productTitle: string; onClose?: () => void; onSubmit: (rating: number, body: string) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating || body.trim().length < 2 || busy) return;
    setBusy(true);
    try { await onSubmit(rating, body.trim()); setBody(""); setRating(0); }
    catch (error: any) { toast.error(error?.message || "We could not post your review. Please try again."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-2xl border border-brand-accent/25 bg-brand-accent/[.05] p-5 text-left">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-brand-accent">Verified purchase</p><h2 className="mt-1 text-lg font-black">How was {productTitle}?</h2><p className="mt-1 text-xs leading-5 text-brand-text-secondary">Your review helps the creator improve and helps future buyers decide.</p></div>{onClose && <button type="button" onClick={onClose} aria-label="Close review" className="grid h-9 w-9 place-items-center rounded-xl border border-brand-border"><X size={16}/></button>}</div>
    <form onSubmit={submit} className="mt-4"><div className="flex gap-1" role="radiogroup" aria-label="Product rating">{[1,2,3,4,5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} star${value === 1 ? '' : 's'}`} aria-pressed={rating === value} className="rounded-lg p-1.5 transition hover:scale-110"><Star size={23} className={value <= rating ? "fill-amber-400 text-amber-400" : "text-brand-text-secondary"}/></button>)}</div><textarea required minLength={2} maxLength={1200} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What did you like, and what could be better?" className="mt-3 min-h-28 w-full rounded-xl border border-brand-border bg-brand-surface p-3 text-sm outline-none focus:border-brand-accent"/><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-brand-text-secondary">{body.length}/1200</span><button disabled={!rating || body.trim().length < 2 || busy} className="btn-primary flex h-10 items-center gap-2 px-4 text-xs font-black disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin"/>}Post review</button></div></form>
  </section>;
}
