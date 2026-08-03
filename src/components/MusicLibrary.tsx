import { useRef, useState, useEffect } from "react";
import { Search, Play, Pause, Upload, Music2, Headphones, Guitar, Film, Volume2, X, Plus } from "lucide-react";
import { BUILTIN_TRACKS, BuiltinTrack } from "@/lib/builtinMusic";
import { getLang, t } from "@/lib/i18n";
import { playSfx } from "@/lib/soundFx";

interface MusicLibraryProps {
  onClose: () => void;
  onAdd: (track: any) => void;
}

interface UserTrack extends BuiltinTrack {
  isUser?: true;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const MusicLibrary = ({ onClose, onAdd }: MusicLibraryProps) => {
  const en = getLang() === "en";
  const [playing, setPlaying] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState("all");
  const [query, setQuery] = useState("");
  const [userTracks, setUserTracks] = useState<UserTrack[]>([]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const genres = [
    { id: "all", label: t("music.all"), labelEn: "All", icon: Music2 },
    { id: "electronic", label: "إلكتروني", labelEn: "Electronic", icon: Headphones },
    { id: "acoustic", label: "أكوستيك", labelEn: "Acoustic", icon: Guitar },
    { id: "cinematic", label: "سينمائي", labelEn: "Cinematic", icon: Film },
  ];

  const all: UserTrack[] = [...userTracks, ...BUILTIN_TRACKS];
  const filtered = all.filter((t2) => {
    const okGenre = activeGenre === "all" || t2.genre === activeGenre;
    const name = (en ? t2.titleEn : t2.title).toLowerCase();
    const okQuery = !query || name.includes(query.toLowerCase()) || t2.artist.toLowerCase().includes(query.toLowerCase());
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
    a.volume = volume;
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
    setUserTracks((prev) => [
      {
        id: `user-${Date.now()}`,
        title: f.name,
        titleEn: f.name,
        artist: en ? "My Device" : "جهازي",
        url,
        bpm: 0,
        genre: "acoustic",
        color: "#f59e0b",
        isUser: true,
      },
      ...prev,
    ]);
    playSfx("success");
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = v;
    setProgress(v);
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in slide-in-from-bottom duration-300 overflow-hidden" dir={en ? "ltr" : "rtl"}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white shadow-sm">
            <Music2 className="w-4 h-4" />
          </div>
          <h1 className="font-heading text-lg font-bold text-foreground">{t("music.title")}</h1>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar pb-32">
        {/* Search */}
        <div className="relative">
          <Search className={`absolute ${en ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("music.search")}
            className={`w-full bg-card border border-border rounded-xl py-3 ${en ? "pl-10 pr-4" : "pr-10 pl-4"} text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors`}
          />
        </div>

        {/* Upload from device */}
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-dashed border-primary/50 hover:border-primary transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-start">
            <p className="text-sm font-semibold text-foreground">{t("music.upload")}</p>
            <p className="text-[10px] text-muted-foreground">MP3, WAV, AAC</p>
          </div>
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onUpload} />

        {/* Genres */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {genres.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGenre(g.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                activeGenre === g.id
                  ? "gradient-primary text-primary-foreground glow-primary-sm scale-[1.03]"
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
          {filtered.map((track, i) => (
            <div
              key={track.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                playing === track.id ? "bg-primary/10 border-primary/30" : "bg-card border-border hover:border-primary/30"
              }`}
            >
              <button
                onClick={() => toggle(track)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                  playing === track.id ? "gradient-primary glow-primary-sm" : "bg-secondary text-primary"
                }`}
              >
                {playing === track.id ? (
                  <Pause className="w-4 h-4 text-primary-foreground" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-bold text-foreground truncate">{en ? track.titleEn : track.title}</p>
                <p className="text-[10px] text-muted-foreground">{track.artist}</p>
              </div>

              <button
                onClick={() => onAdd(track)}
                className="px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-[10px] font-black hover:bg-primary hover:text-white transition-all flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                {en ? "ADD" : "إضافة"}
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">{t("music.empty")}</p>
          )}
        </div>
      </div>

      {/* Now playing bar */}
      {playing && (
        <div className="fixed bottom-6 inset-x-4 z-[110]">
          <div className="mx-auto max-w-md rounded-2xl bg-card/95 backdrop-blur border border-primary/20 shadow-2xl p-4 space-y-3 animate-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-1">
               <span className="text-[10px] font-black text-primary uppercase tracking-wider">{en ? "Previewing Track" : "معاينة المقطع"}</span>
               <span className="text-[10px] text-muted-foreground font-mono">{fmt(progress)} / {fmt(duration)}</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={progress}
                onChange={seek}
                className="flex-1 accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-primary shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={changeVolume}
                className="flex-1 accent-primary h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicLibrary;
