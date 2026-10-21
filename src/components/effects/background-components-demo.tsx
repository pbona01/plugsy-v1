import React from "react";
import { BackgroundComponents } from "./background-components";

export function BackgroundComponentsDemo() {
  return <BackgroundComponents glowColor="#10b981" opacity={0.5}><div className="absolute z-50 inset-0 flex flex-col items-center justify-center text-white font-bold p-6 text-center"><h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">Plugsy ambient glow</h1><p className="mt-4 text-emerald-100 text-lg md:text-xl max-w-md font-medium">An animated portfolio backdrop for creators who want their work to stand out.</p></div></BackgroundComponents>;
}

export default BackgroundComponentsDemo;
