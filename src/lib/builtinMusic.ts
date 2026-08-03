// Built-in AI-generated background music library for Vireon AI.
// Generated with ElevenLabs — 22s loopable instrumental beds.
export interface BuiltinTrack {
  id: string;
  title: string;
  titleEn: string;
  artist: string;
  url: string;
  bpm: number;
  duration?: number;
  genre: "electronic" | "acoustic" | "cinematic" | "corporate" | "playful";
  color: string;
}

export const BUILTIN_TRACKS: BuiltinTrack[] = [
  {
    id: "upbeat",
    title: "إيقاع حماسي",
    titleEn: "Upbeat Energy",
    artist: "Vireon AI",
    url: "/audio/music/upbeat.mp3",
    bpm: 128,
    duration: 22,
    genre: "electronic",
    color: "#a855f7",
  },
  {
    id: "calm",
    title: "أجواء هادئة",
    titleEn: "Calm Ambient",
    artist: "Vireon AI",
    url: "/audio/music/calm.mp3",
    bpm: 80,
    duration: 22,
    genre: "acoustic",
    color: "#10b981",
  },
  {
    id: "cinematic",
    title: "سينمائي ملحمي",
    titleEn: "Cinematic Drama",
    artist: "Vireon AI",
    url: "/audio/music/cinematic.mp3",
    bpm: 70,
    duration: 22,
    genre: "cinematic",
    color: "#3b82f6",
  },
  {
    id: "corporate",
    title: "احترافي نظيف",
    titleEn: "Corporate Clean",
    artist: "Vireon AI",
    url: "/audio/music/corporate.mp3",
    bpm: 105,
    duration: 22,
    genre: "corporate",
    color: "#0ea5e9",
  },
  {
    id: "playful",
    title: "مرح وممتع",
    titleEn: "Fun & Playful",
    artist: "Vireon AI",
    url: "/audio/music/playful.mp3",
    bpm: 115,
    duration: 22,
    genre: "playful",
    color: "#f59e0b",
  },
];
