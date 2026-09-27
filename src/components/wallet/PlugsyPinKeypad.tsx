import { Delete, ShieldCheck } from "lucide-react";

type PlugsyPinKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  title?: string;
  subtitle?: string;
  error?: string;
  onForgot?: () => void;
  submitLabel?: string;
  onSubmit?: () => void;
  busy?: boolean;
  compact?: boolean;
};

export default function PlugsyPinKeypad({
  value,
  onChange,
  title = "Plugsy Secure Keypad",
  subtitle,
  error,
  onForgot,
  submitLabel,
  onSubmit,
  busy = false,
  compact = false,
}: PlugsyPinKeypadProps) {
  const press = (key: string) => {
    if (busy) return;
    if (key === "backspace") onChange(value.slice(0, -1));
    else if (value.length < 4) onChange(value + key);
  };

  const keyClass = `${compact ? "h-10" : "h-12"} touch-manipulation select-none rounded-xl border border-brand-border bg-brand-background/70 font-black text-brand-text-primary transition hover:border-brand-accent hover:bg-brand-accent/10 active:scale-95 [-webkit-touch-callout:none]`;

  return (
    <div className={`mx-auto w-full select-none border border-brand-accent/20 bg-gradient-to-b from-brand-accent/[.08] to-brand-surface [-webkit-touch-callout:none] [-webkit-user-select:none] ${compact ? "max-w-none rounded-2xl p-3.5 shadow-[0_12px_32px_rgba(22,119,255,.10)]" : "max-w-sm rounded-[28px] p-5 shadow-[0_20px_60px_rgba(22,119,255,.16)]"}`}>
      <div className={compact ? "flex items-center gap-3" : "text-center"}>
        <div className={`grid shrink-0 place-items-center bg-brand-accent text-white ${compact ? "h-9 w-9 rounded-xl" : "mx-auto h-11 w-11 rounded-2xl shadow-[0_0_24px_rgba(22,119,255,.45)]"}`}>
          <ShieldCheck size={compact ? 18 : 22} />
        </div>
        <div className={compact ? "min-w-0 text-left" : ""}>
          <h3 className={`${compact ? "text-sm" : "mt-3 text-sm tracking-wide"} font-black text-brand-text-primary`}>{title}</h3>
          {subtitle && <p className={`${compact ? "mt-0.5" : "mt-1"} text-[11px] text-brand-text-secondary`}>{subtitle}</p>}
        </div>
      </div>

      <div className={`${compact ? "mt-3 gap-2" : "mt-5 gap-3"} flex justify-center`} aria-label="PIN entry">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`grid place-items-center rounded-xl border font-black transition-all ${compact ? "h-9 w-9 text-base" : "h-11 w-11 text-lg"} ${index < value.length ? "border-brand-accent bg-brand-accent/15 text-brand-accent shadow-[0_0_16px_rgba(22,119,255,.2)]" : "border-brand-border bg-brand-background/60 text-transparent"}`}>
            {index < value.length ? "•" : "0"}
          </span>
        ))}
      </div>

      <div className={`${compact ? "mt-3 gap-1.5" : "mt-5 gap-2"} grid grid-cols-3`}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
          <button type="button" key={key} onClick={() => press(key)} onContextMenu={(event) => event.preventDefault()} className={`${keyClass} ${compact ? "text-base" : "text-lg"}`}>
            {key}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} onContextMenu={(event) => event.preventDefault()} className={`${keyClass} ${compact ? "text-base" : "text-lg"}`}>0</button>
        <button type="button" onClick={() => press("backspace")} onContextMenu={(event) => event.preventDefault()} aria-label="Delete last PIN digit" className={`${keyClass} grid place-items-center text-brand-text-secondary hover:text-brand-accent`}>
          <Delete size={compact ? 17 : 18} />
        </button>
      </div>

      {error && <p role="alert" className={`${compact ? "mt-2" : "mt-3"} text-center text-xs font-semibold text-red-500`}>{error}</p>}
      {onForgot && <button type="button" onClick={onForgot} className={`${compact ? "mt-2.5" : "mt-4"} block w-full text-center text-xs font-bold text-brand-accent hover:underline`}>Forgot your wallet PIN?</button>}
      {onSubmit && <button type="button" onClick={onSubmit} disabled={busy || value.length !== 4} className={`${compact ? "mt-3 h-10" : "mt-4 h-11"} w-full rounded-xl bg-brand-accent text-sm font-black text-white transition hover:bg-brand-accent/90 disabled:cursor-not-allowed disabled:opacity-50`}>{busy ? "Please wait…" : submitLabel || "Continue"}</button>}
    </div>
  );
}
