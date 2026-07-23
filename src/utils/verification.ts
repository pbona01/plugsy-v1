import { VPPortfolioItem, ReactionConfig } from "../types/verification";

export const THEMES: Record<string, { name: string, bg: string, text: string, accent: string, cardBg: string, borderColor: string }> = {
  modern: { name: "Default", bg: "var(--brand-bg)", text: "var(--brand-text)", accent: "var(--brand-accent)", cardBg: "var(--brand-card)", borderColor: "var(--brand-border)" },
  obsidian: { name: "Grid", bg: "#09090b", text: "#fafafa", accent: "#3b82f6", cardBg: "#18181b", borderColor: "#27272a" },
  minimal: { name: "Minimal", bg: "#ffffff", text: "#171717", accent: "#000000", cardBg: "#f5f5f5", borderColor: "#e5e5e5" },
  slate: { name: "Aurora", bg: "#0f172a", text: "#f8fafc", accent: "#38bdf8", cardBg: "#1e293b", borderColor: "#334155" },
  dracula: { name: "Waves", bg: "#282a36", text: "#f8f8f2", accent: "#bd93f9", cardBg: "#44475a", borderColor: "#6272a4" },
  nebula: { name: "Sparkles", bg: "#17102e", text: "#f4f0ff", accent: "#8b5cf6", cardBg: "#231842", borderColor: "#3f277a" },
  gradient: { name: "Gradients", bg: "#0c051a", text: "#fbfaff", accent: "#a259ff", cardBg: "#160e29", borderColor: "#301d54" },
  glow: { name: "Ambient Glow", bg: "#022c22", text: "#e8fdf5", accent: "#10b981", cardBg: "#043c31", borderColor: "#0b584a" },
  geometric: { name: "Elegant Shapes", bg: "#030303", text: "#f5f5f7", accent: "#a78bfa", cardBg: "#0c0a0f", borderColor: "#241e2e" },
  indigo_glow: { name: "Indigo Orbit", bg: "#ffffff", text: "#0f172a", accent: "#6366f1", cardBg: "#f8fafc", borderColor: "#e2e8f0" },
  teal_glow: { name: "Teal Glow", bg: "#ffffff", text: "#0f172a", accent: "#14b8a6", cardBg: "#f8fafc", borderColor: "#e2e8f0" }
};

export const FONT_PAIRINGS = {
  refined_editorial: {
    id: "refined_editorial",
    label: "Refined & Editorial",
    heading: "'Playfair Display', serif",
    headingWeight: 900,
    subheading: "'DM Sans', sans-serif",
    subheadingWeight: 300,
    accentColor: "#c9a84c",
    borderColor: "#c9a84c",
    preview: "Creative Designer & Developer",
    body: "'DM Sans', sans-serif",
    sample: "Creative Designer & Developer"
  },
  bold_futuristic: {
    id: "bold_futuristic",
    label: "Bold & Futuristic",
    heading: "'Syne', sans-serif",
    headingWeight: 800,
    subheading: "'Outfit', sans-serif",
    subheadingWeight: 300,
    accentColor: "#4d79ff",
    borderColor: "#4d79ff",
    preview: "Full Stack Engineer",
    body: "'Outfit', sans-serif",
    sample: "Full Stack Engineer"
  },
  elegant_minimal: {
    id: "elegant_minimal",
    label: "Elegant & Minimal",
    heading: "'Cormorant Garamond', serif",
    headingWeight: 600,
    subheading: "'Space Grotesk', sans-serif",
    subheadingWeight: 300,
    accentColor: "#4a7c59",
    borderColor: "#4a7c59",
    preview: "Brand & Motion Designer",
    body: "'Space Grotesk', sans-serif",
    sample: "Brand & Motion Designer"
  },
  raw_high_impact: {
    id: "raw_high_impact",
    label: "Raw & High-Impact",
    heading: "'Bebas Neue', sans-serif",
    headingWeight: 400,
    subheading: "'Jost', sans-serif",
    subheadingWeight: 300,
    accentColor: "#EF4444",
    borderColor: "#EF4444",
    preview: "Art Director",
    body: "'Jost', sans-serif",
    sample: "Art Director"
  },
  warm_literary: {
    id: "warm_literary",
    label: "Warm & Literary",
    heading: "'Fraunces', serif",
    headingWeight: 700,
    subheading: "'Inter', sans-serif",
    subheadingWeight: 300,
    accentColor: "#8b6fde",
    borderColor: "#8b6fde",
    preview: "UX Designer & Researcher",
    body: "'Inter', sans-serif",
    sample: "UX Designer & Researcher"
  }
};

export const CATEGORY_REACTIONS: Record<string, ReactionConfig[]> = {
  video_editing: [
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "mind_blown", emoji: "🤯", label: "Mind Blown" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  motion_graphics: [
    { type: "mind_blown", emoji: "🤯", label: "Mind Blown" },
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  graphic_design: [
    { type: "love_this", emoji: "❤️", label: "Love This" },
    { type: "clean_work", emoji: "🎨", label: "Clean Work" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  photography: [
    { type: "stunning", emoji: "📸", label: "Stunning" },
    { type: "love_this", emoji: "❤️", label: "Love This" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  videography: [
    { type: "stunning", emoji: "📸", label: "Stunning" },
    { type: "mind_blown", emoji: "🤯", label: "Mind Blown" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  web_development: [
    { type: "clean_code", emoji: "💻", label: "Clean Code" },
    { type: "impressive", emoji: "🚀", label: "Impressive" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  uiux_design: [
    { type: "slick_design", emoji: "✨", label: "Slick Design" },
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  copywriting: [
    { type: "great_writing", emoji: "📖", label: "Great Writing" },
    { type: "spot_on", emoji: "🎯", label: "Spot On" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  content_writing: [
    { type: "great_writing", emoji: "📖", label: "Great Writing" },
    { type: "spot_on", emoji: "🎯", label: "Spot On" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  digital_marketing: [
    { type: "results", emoji: "📈", label: "Results" },
    { type: "spot_on", emoji: "🎯", label: "Spot On" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  social_media_management: [
    { type: "results", emoji: "📈", label: "Results" },
    { type: "spot_on", emoji: "🎯", label: "Spot On" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  ai_automation: [
    { type: "smart_build", emoji: "🤖", label: "Smart Build" },
    { type: "impressive", emoji: "🚀", label: "Impressive" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  prompt_engineering: [
    { type: "smart_build", emoji: "🤖", label: "Smart Build" },
    { type: "spot_on", emoji: "🎯", label: "Spot On" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  cybersecurity: [
    { type: "solid_work", emoji: "🛡️", label: "Solid Work" },
    { type: "impressive", emoji: "🚀", label: "Impressive" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ],
  three_d_design: [
    { type: "mind_blown", emoji: "🤯", label: "Mind Blown" },
    { type: "fire", emoji: "🔥", label: "Fire" },
    { type: "hire_me", emoji: "💼", label: "Hire Me" }
  ]
};

export const extractYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

export const generateFingerprint = (): string => {
  try {
    const stored = localStorage.getItem("vp_fp");
    if (stored) return stored;
    const fp = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("vp_fp", fp);
    return fp;
  } catch {
    return Math.random().toString(36).slice(2);
  }
};

export const getReactionCount = (
  item: VPPortfolioItem, 
  reactionType: string
): number => {
  const countMap: Record<string, keyof VPPortfolioItem> = {
    fire: "fire_count",
    mind_blown: "mind_blown_count",
    hire_me: "hire_count",
    love_this: "love_this_count",
    clean_work: "clean_work_count",
    stunning: "stunning_count",
    clean_code: "clean_code_count",
    impressive: "impressive_count",
    slick_design: "slick_design_count",
    great_writing: "great_writing_count",
    spot_on: "spot_on_count",
    results: "results_count",
    smart_build: "smart_build_count",
    solid_work: "solid_work_count"
  };
  const key = countMap[reactionType];
  return key ? (item[key] as number) || 0 : 0;
};
