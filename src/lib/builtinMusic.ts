// Built-in royalty-free background music library for Vireon AI.
export interface BuiltinTrack {
  id: string;
  title: string;
  titleEn: string;
  artist: string;
  url: string;
  bpm: number;
  genre: "electronic" | "acoustic" | "cinematic" | "hiphop" | "lofi" | "rock";
  color: string;
}

export const BUILTIN_TRACKS: BuiltinTrack[] = [
  {
    id: "upbeat",
    title: "إيقاع حماسي",
    titleEn: "Upbeat Energy",
    artist: "Vireon Studio",
    url: "/audio/music/upbeat.mp3",
    bpm: 128,
    genre: "electronic",
    color: "#a855f7",
  },
  {
    id: "chill",
    title: "استرخاء هادئ",
    titleEn: "Chill Vibes",
    artist: "Vireon Studio",
    url: "/audio/music/chill.mp3",
    bpm: 90,
    genre: "acoustic",
    color: "#10b981",
  },
  {
    id: "cinematic",
    title: "سينمائي ملحمي",
    titleEn: "Cinematic Rise",
    artist: "Vireon Studio",
    url: "/audio/music/cinematic.mp3",
    bpm: 70,
    genre: "cinematic",
    color: "#3b82f6",
  },
  {
    id: "hiphop-urban",
    title: "هيب هوب عصري",
    titleEn: "Urban Flow",
    artist: "Vireon AI",
    url: "/audio/music/urban.mp3",
    bpm: 95,
    genre: "hiphop",
    color: "#f59e0b",
  },
  {
    id: "lofi-study",
    title: "لو-فاي للدراسة",
    titleEn: "Lofi Focus",
    artist: "Vireon AI",
    url: "/audio/music/lofi.mp3",
    bpm: 80,
    genre: "lofi",
    color: "#ec4899",
  },
  {
    id: "rock-action",
    title: "روك الأكشن",
    titleEn: "Action Rock",
    artist: "Vireon AI",
    url: "/audio/music/rock.mp3",
    bpm: 140,
    genre: "rock",
    color: "#ef4444",
  }
];
