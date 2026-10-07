import React from "react";
import { motion } from "motion/react";

export function ProductCardSkeleton() {
  return (
    <div className="card-premium group flex min-w-0 flex-col border-brand-border p-3 ring-1 ring-brand-border/20 sm:p-6 lg:p-8">
      {/* Icon/Image Placeholder */}
      <div className="mb-4 aspect-[4/3] w-full animate-pulse rounded-xl bg-brand-surface sm:mb-6 sm:rounded-2xl" />

      {/* Title Placeholder */}
      <div className="mb-3 h-5 w-3/4 animate-pulse rounded-md bg-brand-surface sm:h-8" />
      
      {/* Description Placeholder */}
      <div className="mb-4 space-y-2 sm:mb-6">
        <div className="h-3 w-full animate-pulse rounded bg-brand-surface sm:h-4" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-brand-surface sm:h-4" />
      </div>

      {/* Price Placeholder */}
      <div className="mb-4 h-7 w-1/2 animate-pulse rounded-md bg-brand-surface sm:mb-8 sm:h-10 sm:w-1/3" />

      {/* Features Placeholder */}
      <div className="mb-4 flex-1 space-y-3 sm:mb-8 sm:space-y-4">
        <div className="flex gap-3">
          <div className="w-4 h-4 bg-brand-surface rounded-full shrink-0 animate-pulse" />
          <div className="h-4 bg-brand-surface rounded w-2/3 animate-pulse" />
        </div>
        <div className="flex gap-3">
          <div className="w-4 h-4 bg-brand-surface rounded-full shrink-0 animate-pulse" />
          <div className="h-4 bg-brand-surface rounded w-1/2 animate-pulse" />
        </div>
      </div>

      {/* Button Placeholder */}
      <div className="mt-auto w-full">
        <div className="h-10 w-full animate-pulse rounded-xl bg-brand-surface sm:h-12" />
      </div>
    </div>
  );
}
