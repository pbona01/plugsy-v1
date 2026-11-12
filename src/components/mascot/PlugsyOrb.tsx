import calmOrb from "../../assets/mascot/orb-calm.png";
import helpOrb from "../../assets/mascot/orb-help.png";
import successOrb from "../../assets/mascot/orb-success.png";
import thinkingOrb from "../../assets/mascot/orb-thinking.png";

export type PlugsyOrbMood = "calm" | "thinking" | "success" | "help";

const moodAsset: Record<PlugsyOrbMood, string> = {
  calm: calmOrb,
  thinking: thinkingOrb,
  success: successOrb,
  help: helpOrb,
};

const moodLabel: Record<PlugsyOrbMood, string> = {
  calm: "Plugsy Orb",
  thinking: "Plugsy Orb thinking",
  success: "Plugsy Orb celebrating",
  help: "Plugsy Orb ready to help",
};

export function PlugsyOrb({ mood = "calm", className = "" }: { mood?: PlugsyOrbMood; className?: string }) {
  return <img src={moodAsset[mood]} alt={moodLabel[mood]} className={`plugsy-orb plugsy-orb-${mood} ${className}`} loading="lazy" decoding="async" />;
}
