import React from "react";
import { cn } from "../../lib/utils";

interface LiquidGlassProps {
  children?: React.ReactNode;
  className?: string;
  blur?: number;
  chromaticAberration?: number;
  button?: boolean;
  color?: "black" | "white" | string;
  component?: React.ElementType;
  [key: string]: any;
}

export function LiquidGlass({
  children,
  className,
  blur = 0,
  chromaticAberration = 2,
  button = false,
  color,
  component,
  ...props
}: LiquidGlassProps) {
  const baseStyle = {
    "--blur": `${blur}px`,
    "--chromatic": `${chromaticAberration}px`,
  } as React.CSSProperties;

  const isButton = button;
  const Component = component ? component : (isButton ? "button" : "div");

  return (
    // @ts-ignore
    <Component
      style={baseStyle}
      className={cn(
        "liquid-glass backdrop-blur-xl transition-all duration-300",
        // Base structure mapping light to dark mode perfectly
        "bg-white/60 border border-black/10 shadow-lg text-slate-900 shadow-[inset_0_1.5px_2px_0px_rgba(255,255,255,0.6)]",
        "dark:bg-white/[0.02] dark:border-white/10 dark:text-white/90 dark:shadow-[0_0_0_transparent]",
        
        button && "cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform font-bold tracking-wider",
        // Force specific overrides if color is explicit
        color === "black" && "!bg-black !text-white dark:!bg-white dark:!text-black",
        color === "white" && "!bg-white !text-black dark:!bg-black dark:!text-white",
        color === "blue" && "!bg-brand-accent !text-white !border-brand-accent/50 dark:!text-white dark:!border-transparent liquid-glass-blue",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
