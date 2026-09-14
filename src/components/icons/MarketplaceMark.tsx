import React from "react";

type MarketplaceMarkProps = {
  className?: string;
  size?: number;
  title?: string;
  strokeWidth?: number;
};

/** A small, code-native Plugsy marketplace mark: a protected storefront. */
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
      <path
        d="M5.5 13.25 7.6 6.8c.16-.5.63-.84 1.16-.84h14.48c.53 0 1 .34 1.16.84l2.1 6.45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M5.5 13.25h21v2.1a3.6 3.6 0 0 1-6.06 2.6 3.6 3.6 0 0 1-5.08 0 3.6 3.6 0 0 1-5.08 0 3.6 3.6 0 0 1-4.78.36v-5.06Z"
        fill="currentColor"
        fillOpacity=".18"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M8.1 18.1v7.15c0 .98.8 1.78 1.78 1.78h12.24c.98 0 1.78-.8 1.78-1.78V18.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path
        d="M13 27v-4.48c0-.72.58-1.3 1.3-1.3h3.4c.72 0 1.3.58 1.3 1.3V27"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <path d="m23.8 8.55 1.45 1.46" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth} />
    </svg>
  );
}
