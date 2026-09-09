import { useRef, useState, useEffect } from "react";
import { Search, Play, Pause, Upload, Music2, Headphones, Guitar, Film, Volume2, Image as ImageIcon, Link, Trash2, Sparkles, Mic, Zap } from "lucide-react";
import { BUILTIN_TRACKS, BuiltinTrack, getSavedLibraryTracks, saveLibraryTrack, removeLibraryTrack, getGenreCoverImage, fetchSupabaseMusicTracks, generateSvgCoverFallback } from "@/lib/builtinMusic";
import { getLang, t } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

const genres = [
  { id: "all", label: t("music.all"), labelEn: "All", icon: Music2 },
  { id: "pop", label: "بوب / فلوج", labelEn: "Pop / Vlog", icon: Sparkles },
  { id: "cinematic", label: "سينمائي / حماسي", labelEn: "Cinematic / Epic", icon: Film },
  { id: "lofi", label: "عاطفي / لوفي", labelEn: "Emotional / Lofi", icon: Mic },
  { id: "acoustic", label: "أكوستيك / هادئ", labelEn: "Acoustic / Calm", icon: Guitar },
  { id: "electronic", label: "إلكتروني", labelEn: "Electronic", icon: Headphones },
  { id: "rock", label: "روك / حماسي", labelEn: "Rock / Energetic", icon: Zap },
];

interface UserTrack extends BuiltinTrack {
  isUser?: true;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const MusicScreen = () => {
  const en = getLang() === "en";
  const [playing, setPlaying] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState("all");
  const [query, setQuery] = useState("");
  const [savedTracks, setSavedTracks] = useState<BuiltinTrack[]>(() => getSavedLibraryTracks());
  const [supabaseTracks, setSupabaseTracks] = useState<BuiltinTrack[]>(() => BUILTIN_TRACKS);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchSupabaseMusicTracks().then((tracks) => {
      if (active) setSupabaseTracks(tracks);
    });
    return () => {
      active = false;
      audioRef.current?.pause();
    };
  }, []);

  const trackMap = new Map<string, BuiltinTrack>();
  [...savedTracks, ...supabaseTracks].forEach((t) => trackMap.set(t.id, t));
  const all: UserTrack[] = Array.from(trackMap.values());
  const filtered = all.filter((t2) => {
    const okGenre = activeGenre === "all" || t2.genre === activeGenre;
    const name = (en ? t2.titleEn || t2.title : t2.title).toLowerCase();
    const okQuery = !query || name.includes(query.toLowerCase()) || (t2.artist && t2.artist.toLowerCase().includes(query.toLowerCase()));
    return okGenre && okQuery;
  });

  const toggle = (track: UserTrack) => {
    playSfx("click");
    if (playing === track.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(track.url);
    a.volume = Math.max(0, Math.min(1, volume));
    a.ontimeupdate = () => {
      setProgress(a.currentTime);
      setDuration(a.duration || 0);
    };
    a.onended = () => setPlaying(null);
    audioRef.current = a;
    void a.play().catch(() => {});
    setPlaying(track.id);
    setProgress(0);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    const url = URL.createObjectURL(f);
    const cleanTitle = f.name.replace(/\.[^/.]+$/, "");
    const iconicCover = getGenreCoverImage(activeGenre !== "all" ? activeGenre : "other", cleanTitle);
    
    const newTrack: BuiltinTrack = {
      id: `user-${Date.now()}`,
      title: cleanTitle,
      titleEn: cleanTitle,
      artist: en ? "My Library" : "مكتبتي الخاصة",
      url,
      coverUrl: iconicCover,
      bpm: 0,
      genre: (activeGenre !== "all" ? activeGenre : "other") as any,
      color: "#f59e0b",
    };

    saveLibraryTrack(newTrack);
    setSavedTracks(getSavedLibraryTracks());
    playSfx("success");
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = v;
    setProgress(v);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  return (
    <div className="min-h-screen pb-40 px-4 pt-6" dir={en ? "ltr" : "rtl"}>
      <h1 className="font-heading text-2xl font-bold text-foreground mb-5">{t("music.title")}</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("music.search")}
          className={`w-full bg-card border border-border rounded-xl py-3 ${en ? "pl-10 pr-4" : "pr-10 pl-4"} text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors`}
        />
      </div>

      {/* Upload button */}
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-between p-3.5 mb-5 rounded-2xl bg-card border border-border hover:border-primary/50 shadow-sm transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl gradient-primary text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <div className="text-start">
            <p className="text-sm font-bold text-foreground">{en ? "Upload Music / Song" : "رفع أغنية أو موسيقى جديدة"}</p>
            <p className="text-[10px] text-muted-foreground">MP3, WAV, AAC, M4A</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-secondary text-primary">
          {en ? "+ Add" : "+ إضافة"}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onUpload} />

      {/* Genres */}
      <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
        {genres.map((g) => (
          <button
            key={g.id}
            onClick={() => setActiveGenre(g.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeGenre === g.id
                ? "gradient-primary text-primary-foreground glow-primary-sm"
                : "bg-card border border-border text-muted-foreground"
            }`}
          >
            <g.icon className="w-3.5 h-3.5" />
            {en ? g.labelEn : g.label}
          </button>
        ))}
      </div>

      {/* Track List */}
      <div className="space-y-2">
        {filtered.map((track, i) => {
          const coverSrc = track.coverUrl || getGenreCoverImage(track.genre, track.title);
          return (
            <div
              key={track.id}
              className={`p-3 rounded-2xl border transition-all animate-fade-in ${
                playing === track.id ? "bg-primary/10 border-primary/40 shadow-md" : "bg-card border-border hover:border-primary/30"
              }`}
              style={{ animationDelay: `${i * 0.03}s` }}
            >
              <div className="flex items-center gap-3">
                {/* Cover Image + Overlaid Play/Pause button */}
                <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-secondary border border-border shrink-0 group flex items-center justify-center shadow-inner">
                  <img
                    src={coverSrc}
                    alt={track.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = generateSvgCoverFallback(track.title, track.genre);
                    }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  <button
                    onClick={() => toggle(track)}
                    className="absolute inset-0 bg-black/40 hover:bg-black/60 flex items-center justify-center transition-all opacity-90 group-hover:opacity-100"
                    title={en ? "Play / Pause Preview" : "زر الاستماع وتشغيل الصوت"}
                  >
                    {playing === track.id ? (
                      <Pause className="w-5 h-5 text-white animate-pulse" />
                    ) : (
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    )}
                  </button>
                </div>

              {/* Title & Artist */}
              <div className="flex-1 min-w-0 text-start space-y-0.5">
                <p className="text-sm font-semibold text-foreground truncate">
                  {en ? track.titleEn || track.title : track.title}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{track.artist}</p>
              </div>
            </div>
          </div>
        );
      })}

        {filtered.length === 0 && (
          <div className="text-center py-10 px-4 rounded-2xl bg-card/40 border border-dashed border-border space-y-2">
            <Music2 className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-xs font-semibold text-foreground">{t("music.empty")}</p>
            <p className="text-[10px] text-muted-foreground">
              {en ? "Upload your tracks and songs above to start building your library." : "قم برفع مقاطعك وأغانيكم أعلاه للبدء في بناء مكتبتك الموسيقية الخاصة."}
            </p>
          </div>
        )}
      </div>

      {/* Now playing bar */}
      {playing && (
        <div className="fixed bottom-20 inset-x-0 px-4 z-40">
          <div className="mx-auto max-w-md rounded-2xl bg-popover/95 backdrop-blur border border-border shadow-2xl p-3 space-y-2 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-9 text-center">{fmt(progress)}</span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={progress}
                onChange={seek}
                className="flex-1 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground w-9 text-center">{fmt(duration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={changeVolume}
                className="flex-1 accent-primary"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicScreen;
