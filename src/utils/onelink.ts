import { Github, Linkedin, Instagram, Youtube, Globe, Twitter, MessageSquare, Music } from "lucide-react";

export const getPlatformIcon = (platform: string) => {
  switch (platform.toLowerCase()) {
    case 'github': return Github;
    case 'linkedin': return Linkedin;
    case 'instagram': return Instagram;
    case 'youtube': return Youtube;
    case 'twitter':
    case 'x': return Twitter;
    case 'discord': return MessageSquare;
    case 'spotify': return Music;
    default: return Globe;
  }
};
