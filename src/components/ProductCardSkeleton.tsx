import React from "react";
import { motion } from "motion/react";

export function ProductCardSkeleton() {
  return (
    <div className="card-premium p-10 flex flex-col group border-brand-border ring-1 ring-brand-border/20">
      {/* Icon/Image Placeholder */}
      <div className="w-full h-48 sm:h-auto sm:w-16 sm:aspect-square bg-brand-surface rounded-2xl mb-8 animate-pulse" />

      {/* Title Placeholder */}
      <div className="h-8 bg-brand-surface rounded-md w-3/4 mb-4 animate-pulse" />
      
      {/* Description Placeholder */}
      <div className="space-y-2 mb-6">
        <div className="h-4 bg-brand-surface rounded w-full animate-pulse" />
        <div className="h-4 bg-brand-surface rounded w-5/6 animate-pulse" />
      </div>

      {/* Price Placeholder */}
      <div className="h-10 bg-brand-surface rounded-md w-1/3 mb-8 animate-pulse" />

      {/* Features Placeholder */}
      <div className="space-y-4 mb-8 flex-1">
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
        <div className="h-12 bg-brand-surface rounded-xl w-full animate-pulse" />
      </div>
    </div>
  );
}
