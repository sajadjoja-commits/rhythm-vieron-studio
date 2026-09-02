import { supabase } from "@/integrations/supabase/client";

// Royalty-Free Background Music Library for Vireon AI.
export interface BuiltinTrack {
  id: string;
  title: string;
  titleEn: string;
  artist: string;
  url: string;
  coverUrl?: string;
  bpm: number;
  duration?: number;
  genre: "electronic" | "acoustic" | "cinematic" | "hiphop" | "lofi" | "rock" | "arabic" | "pop" | "other";
  color: string;
}

export const DEFAULT_MUSIC_COVER = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80";

export const GENRE_COVERS: Record<string, string> = {
  arabic: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80",
  pop: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80",
  electronic: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80",
  acoustic: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=300&q=80",
  cinematic: "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=300&q=80",
  hiphop: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=300&q=80",
  lofi: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=300&q=80",
  rock: "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?auto=format&fit=crop&w=300&q=80",
  other: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=300&q=80",
};

export function generateSvgCoverFallback(title: string = "Music Track", genre: string = "cinematic"): string {
  const colors: Record<string, [string, string]> = {
    cinematic: ["#1e1b4b", "#3b82f6"],
    rock: ["#450a0a", "#ef4444"],
    pop: ["#831843", "#ec4899"],
    lofi: ["#311042", "#a855f7"],
    electronic: ["#022c22", "#10b981"],
    acoustic: ["#14532d", "#84cc16"],
    arabic: ["#78350f", "#f59e0b"],
    hiphop: ["#172554", "#6366f1"],
    other: ["#18181b", "#6366f1"],
  };
  const [c1, c2] = colors[genre] || colors.cinematic;
  const cleanTitle = title.replace(/[<>&"]/g, "").slice(0, 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" rx="24" fill="url(#g)"/>
    <circle cx="150" cy="150" r="70" fill="white" fill-opacity="0.08" stroke="white" stroke-opacity="0.2" stroke-width="2"/>
    <circle cx="150" cy="150" r="28" fill="white" fill-opacity="0.15"/>
    <path d="M142 135v30m16-30v25m-16-25c0-4 16-8 16-8v8" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <text x="150" y="255" fill="white" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill-opacity="0.9">${cleanTitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getGenreCoverImage(genre?: string, title?: string): string {
  const t = (title || "").toLowerCase();
  if (t.includes("عرب") || t.includes("شرق") || t.includes("عود") || t.includes("طرب") || t.includes("أغني") || t.includes("موسيق")) return GENRE_COVERS.arabic;
  if (t.includes("روك") || t.includes("rock") || t.includes("power") || t.includes("pressure")) return GENRE_COVERS.rock;
  if (t.includes("باب") || t.includes("pop") || t.includes("calor") || t.includes("vlog") || t.includes("energetic")) return GENRE_COVERS.pop;
  if (t.includes("سينما") || t.includes("film") || t.includes("cinematic") || t.includes("gravity") || t.includes("epic")) return GENRE_COVERS.cinematic;
  if (t.includes("هيب") || t.includes("hip") || t.includes("rap")) return GENRE_COVERS.hiphop;
  if (t.includes("لوفي") || t.includes("lofi") || t.includes("chill") || t.includes("stillness") || t.includes("dawn") || t.includes("breathing") || t.includes("ambient")) return GENRE_COVERS.lofi;
  if (t.includes("الكترون") || t.includes("dj") || t.includes("dance")) return GENRE_COVERS.electronic;
  if (t.includes("أكوستيك") || t.includes("acoustic") || t.includes("calm") || t.includes("below")) return GENRE_COVERS.acoustic;
  
  if (genre && genre !== "other" && GENRE_COVERS[genre]) {
    return GENRE_COVERS[genre];
  }
  return GENRE_COVERS.cinematic || DEFAULT_MUSIC_COVER;
}

// Real tracks existing in Supabase Storage bucket 'audio' inside folder 'music'
export const SUPABASE_DEFAULT_TRACKS: BuiltinTrack[] = [
  {
    id: "supabase-power_under_pressure.mp3",
    title: "Power Under Pressure",
    titleEn: "Power Under Pressure",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/power_under_pressure.mp3",
    coverUrl: GENRE_COVERS.rock,
    bpm: 128,
    genre: "rock",
    color: "#f59e0b",
  },
  {
    id: "supabase-stillness_before_dawn.mp3",
    title: "Stillness Before Dawn",
    titleEn: "Stillness Before Dawn",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/stillness_before_dawn.mp3",
    coverUrl: GENRE_COVERS.lofi,
    bpm: 85,
    genre: "lofi",
    color: "#8b5cf6",
  },
  {
    id: "supabase-calor_de_ahora.mp3",
    title: "Calor de Ahora",
    titleEn: "Calor de Ahora",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/calor_de_ahora.mp3",
    coverUrl: GENRE_COVERS.pop,
    bpm: 124,
    genre: "pop",
    color: "#ec4899",
  },
  {
    id: "supabase-gravity_denied.mp3",
    title: "Gravity Denied",
    titleEn: "Gravity Denied",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/gravity_denied.mp3",
    coverUrl: GENRE_COVERS.cinematic,
    bpm: 110,
    genre: "cinematic",
    color: "#3b82f6",
  },
  {
    id: "supabase-only_my_breathing.mp3",
    title: "Only My Breathing",
    titleEn: "Only My Breathing",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/only_my_breathing.mp3",
    coverUrl: GENRE_COVERS.lofi,
    bpm: 90,
    genre: "lofi",
    color: "#06b6d4",
  },
  {
    id: "supabase-stillness_below.mp3",
    title: "Stillness Below",
    titleEn: "Stillness Below",
    artist: "Supabase Music",
    url: "https://zehsxvunlwezknxdmmyn.supabase.co/storage/v1/object/public/audio/music/stillness_below.mp3",
    coverUrl: GENRE_COVERS.acoustic,
    bpm: 75,
    genre: "acoustic",
    color: "#10b981",
  },
];

export const BUILTIN_TRACKS: BuiltinTrack[] = [...SUPABASE_DEFAULT_TRACKS];

// Dynamically fetch files from Supabase Storage bucket: audio / folder: music
export async function fetchSupabaseMusicTracks(): Promise<BuiltinTrack[]> {
  try {
    const { data, error } = await supabase.storage.from("audio").list("music");
    
    let fetchedTracks: BuiltinTrack[] = [];

    if (data && data.length > 0) {
      fetchedTracks = data
        .filter((file) => file.name && !file.name.startsWith(".") && /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(file.name))
        .map((file) => {
          const trackId = `supabase-${file.name}`;
          const existing = SUPABASE_DEFAULT_TRACKS.find(
            (def) => def.id.toLowerCase() === trackId.toLowerCase() || def.id.toLowerCase().includes(file.name.toLowerCase())
          );
          if (existing) {
            return existing;
          }

          const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const formattedTitle = cleanName
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          
          const publicUrl = supabase.storage.from("audio").getPublicUrl(`music/${file.name}`).data.publicUrl;
          const coverUrl = getGenreCoverImage("other", formattedTitle);
          
          return {
            id: trackId,
            title: formattedTitle,
            titleEn: formattedTitle,
            artist: "Supabase Music",
            url: publicUrl,
            coverUrl,
            bpm: 120,
            genre: "other" as const,
            color: "#a855f7",
          };
        });
    }

    // Merge SUPABASE_DEFAULT_TRACKS to guarantee all default tracks are present with rich metadata
    const trackMap = new Map<string, BuiltinTrack>();
    SUPABASE_DEFAULT_TRACKS.forEach((t) => trackMap.set(t.id, t));
    fetchedTracks.forEach((t) => trackMap.set(t.id, t));

    return Array.from(trackMap.values());
  } catch (err) {
    console.error("Error loading music from Supabase Storage:", err);
    return SUPABASE_DEFAULT_TRACKS;
  }
}

const LS_KEY = "vireon_custom_music_library";

export function getSavedLibraryTracks(): BuiltinTrack[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLibraryTrack(track: BuiltinTrack): BuiltinTrack[] {
  if (typeof localStorage === "undefined") return [track];
  try {
    const current = getSavedLibraryTracks();
    const updated = [track, ...current.filter((t) => t.id !== track.id)];
    localStorage.setItem(LS_KEY, JSON.stringify(updated.slice(0, 100)));
    return updated;
  } catch {
    return [track];
  }
}

export function removeLibraryTrack(trackId: string): BuiltinTrack[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const current = getSavedLibraryTracks();
    const updated = current.filter((t) => t.id !== trackId);
    localStorage.setItem(LS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}


