import React from "react";

type MarketplaceMarkProps = {
  className?: string;
  size?: number;
  title?: string;
  strokeWidth?: number;
};

/** Plugsy Marketplace: a polished shopping bag with the Plugsy spark. */
export function MarketplaceMark({
  className = "",
  size = 24,
  title = "Plugsy Marketplace",
  strokeWidth = 2.25,
}: MarketplaceMarkProps) {
  return (
    <svg
      aria-label={title}
      className={className}
      fill="none"
      height={size}
      role="img"
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <rect x="4.5" y="7.5" width="23" height="20" rx="5" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeWidth={strokeWidth}/>
      <path d="M11 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth}/>
      <path d="M18.1 12.2 11.6 20h4.25l-1.7 6.1 6.45-8.25h-4.15l1.65-5.65Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" strokeWidth=".7"/>
      <circle cx="8.5" cy="12" r="1" fill="currentColor" opacity=".55"/>
      <circle cx="23.5" cy="12" r="1" fill="currentColor" opacity=".55"/>
    </svg>
  );
}
