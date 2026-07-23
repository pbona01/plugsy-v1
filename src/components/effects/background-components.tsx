import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface BackgroundComponentsProps {
  children?: React.ReactNode;
  className?: string;
  glowColor?: string;
  opacity?: number;
  containerClassName?: string;
}

export const BackgroundComponents = ({
  children,
  className,
  glowColor = "#10b981",
  opacity = 0.4,
  containerClassName,
}: BackgroundComponentsProps) => {
  return (
    <div className={cn("min-h-screen w-full relative overflow-hidden bg-white dark:bg-[#022c22]", containerClassName)}>
      {/* Ambient Center Glow */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, ${glowColor}, transparent 70%)`,
          backgroundSize: "100% 100%",
          opacity: opacity,
        }}
      />
      <div className={cn("relative z-10 w-full h-full", className)}>{children}</div>
    </div>
  );
};

export const Component = () => {
  const [count, setCount] = useState(0);

  return (
   <div className="min-h-screen w-full relative bg-white">
  {/* Soft Yellow Glow */}
  <div
    className="absolute inset-0 z-0"
    style={{
      backgroundImage: `
        radial-gradient(circle at center, #FFF991 0%, transparent 70%)
      `,
      opacity: 0.6,
      mixBlendMode: "multiply",
    }}
  />
     {/* Your Content/Components */}
</div>
  );
};

export default BackgroundComponents;
