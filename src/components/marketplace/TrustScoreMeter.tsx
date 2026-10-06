import { motion, useReducedMotion } from "motion/react";
import { marketplaceTrustBand } from "../../../shared/marketplaceTrust.js";

const colorClasses = {
  green: "bg-emerald-500 text-emerald-500",
  yellow: "bg-yellow-400 text-yellow-500",
  orange: "bg-orange-500 text-orange-500",
  red: "bg-red-500 text-red-500",
};

type TrustScoreMeterProps = {
  score: number | null | undefined;
  compact?: boolean;
  caption?: string;
};

export function TrustScoreMeter({ score, compact = false, caption }: TrustScoreMeterProps) {
  const reduceMotion = useReducedMotion();
  if (score === null || score === undefined || !Number.isFinite(Number(score))) {
    return <p className="text-xs font-semibold text-brand-text-secondary">New seller · no completed outcomes yet</p>;
  }

  const value = Math.max(0, Math.min(100, Math.round(Number(score))));
  const band = marketplaceTrustBand(value)!;
  const colors = colorClasses[band.color];

  return (
    <div className={compact ? "min-w-24" : "w-full"}>
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-black ${colors.split(" ")[1]}`}>
          Trust {value}% · {band.label}
        </span>
        {!compact && <span className="text-[10px] font-semibold text-brand-text-secondary">{value}/100</span>}
      </div>
      <div
        className={`mt-2 overflow-hidden rounded-full bg-brand-text/10 ${compact ? "h-1.5 w-24" : "h-2.5 w-full"}`}
        role="progressbar"
        aria-label="Seller trust score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value} percent, ${band.label}`}
        title={caption || "Based on completed sales and disputes resolved for the buyer"}
      >
        <motion.div
          className={`h-full rounded-full transition-colors duration-500 ${colors.split(" ")[0]}`}
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${value}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {!compact && caption && <p className="mt-2 text-[11px] leading-5 text-brand-text-secondary">{caption}</p>}
    </div>
  );
}
