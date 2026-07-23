import React from "react";
import { BackgroundComponents } from "./background-components";

export function BackgroundComponentsDemo() {
  return (
    <BackgroundComponents glowColor="#10b981" opacity={0.5}>
      <div className="absolute z-50 inset-0 flex flex-col items-center justify-center text-white font-bold p-6 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
          Emerald Ambient Glow
        </h1>
        <p className="mt-4 text-emerald-100 text-lg md:text-xl max-w-md font-medium">
          A lush, vibrant styling preset powered by radial-gradient-centered overlays.
        </p>
      </div>
    </BackgroundComponents>
  );
}

export default BackgroundComponentsDemo;
