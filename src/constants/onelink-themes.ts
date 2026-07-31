export const THEME_PRESETS = {
  "dark-twilight": {
    name: "Dark Twilight",
    background: "bg-[#08080b]",
    glow: "bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.16),transparent_42%)]",
    cardBg: "bg-white/[0.045] border-white/10",
    textPrimary: "text-white",
    textSecondary: "text-slate-400",
    buttonBg: "bg-white/[0.07] border-white/10 hover:bg-white/[0.12]",
    accent: "text-red-300 bg-red-500/10 border-red-400/20",
  },
  "cosmic-slate": {
    name: "Cosmic Slate",
    background: "bg-slate-900",
    glow: "bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.24),transparent_44%)]",
    cardBg: "bg-slate-950/45 border-indigo-300/15",
    textPrimary: "text-white",
    textSecondary: "text-slate-300",
    buttonBg: "bg-slate-800/90 border-slate-600/50 hover:bg-slate-700",
    accent: "text-indigo-200 bg-indigo-500/15 border-indigo-300/20",
  },
  "neon-sunset": {
    name: "Neon Sunset",
    background: "bg-orange-950",
    glow: "bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.32),transparent_45%)]",
    cardBg: "bg-rose-950/35 border-orange-200/20",
    textPrimary: "text-white",
    textSecondary: "text-orange-200",
    buttonBg: "bg-orange-900/80 border-orange-300/25 hover:bg-orange-800",
    accent: "text-amber-100 bg-rose-500/20 border-orange-200/25",
  },
  "cyberpunk": {
    name: "Cyberpunk",
    background: "bg-black",
    glow: "bg-[linear-gradient(135deg,rgba(34,211,238,0.13),transparent_45%,rgba(168,85,247,0.14))]",
    cardBg: "bg-black/65 border-cyan-400/25",
    textPrimary: "text-cyan-400",
    textSecondary: "text-purple-400",
    buttonBg: "bg-gray-950 border-fuchsia-400/25 hover:border-cyan-300/50",
    accent: "text-cyan-300 bg-cyan-400/10 border-cyan-300/25",
  },
  "minimalist-light": {
    name: "Minimalist Light",
    background: "bg-stone-50",
    glow: "bg-[radial-gradient(circle_at_top,rgba(120,113,108,0.12),transparent_48%)]",
    cardBg: "bg-white/80 border-stone-200",
    textPrimary: "text-black",
    textSecondary: "text-gray-600",
    buttonBg: "bg-white border-stone-200 hover:bg-stone-100",
    accent: "text-stone-700 bg-stone-100 border-stone-200",
  }
};

export type OneLinkThemeId = keyof typeof THEME_PRESETS;

export const getOneLinkTheme = (theme: string | null | undefined) =>
  THEME_PRESETS[theme as OneLinkThemeId] ||
  THEME_PRESETS["dark-twilight"];
