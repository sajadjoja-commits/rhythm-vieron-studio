import { useState, useEffect, useRef } from "react";
import { X, Music, Play, Pause, Plus, Search, Loader2, Volume2, RefreshCw, AudioWaveform } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { t, isRTL } from "@/lib/i18n";
import { Capacitor, registerPlugin } from "@capacitor/core";

const VireonMedia = registerPlugin<any>("VireonMedia");

interface MusicLibraryProps {
  onClose: () => void;
  onAdd: (audioUrl: string, name: string) => void;
}

const MusicLibrary = ({ onClose, onAdd }: MusicLibraryProps) => {
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSong, setActiveSong] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    loadMusic();
  }, []);

  const loadMusic = async () => {
    if (!Capacitor.isNativePlatform()) {
      setLoading(false);
      setSongs([
        { id: '1', name: 'Web Demo Track', artist: 'Preview', duration: '2:45', url: '/audio/demo1.mp3' },
      ]);
      return;
    }

    try {
      setLoading(true);
      console.log("[Vieron Native] Fetching audio assets via Direct Bridge...");

      const response = await VireonMedia.getAudioAssets();
      setSongs(response.songs || []);
    } catch (err) {
      console.error("[Vieron Native] Audio Scan Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const initWaveform = (url: string) => {
    if (wavesurfer.current) {
      wavesurfer.current.destroy();
    }

    if (waveformRef.current) {
      // Ensure the URL is converted for the webview to access native media
      const webUrl = url.startsWith('content://') ? Capacitor.convertFileSrc(url) : url;

      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#3b3b3b',
        progressColor: '#4D9FFF',
        cursorColor: '#B46BFF',
        barWidth: 2,
        barRadius: 3,
        responsive: true,
        height: 60,
      });

      wavesurfer.current.load(webUrl);
      wavesurfer.current.on('play', () => setIsPlaying(true));
      wavesurfer.current.on('pause', () => setIsPlaying(false));
      wavesurfer.current.play();
    }
  };

  const handleSongClick = (song: any) => {
    if (activeSong === song.id) {
      wavesurfer.current?.playPause();
    } else {
      setActiveSong(song.id);
      initWaveform(song.url);
    }
  };

  const filteredSongs = songs.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col animate-in fade-in slide-in-from-bottom duration-500 ease-out">
      {/* Glossy Header */}
      <div className="p-4 border-b border-white/5 bg-zinc-900/40 backdrop-blur-2xl sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
             <button onClick={onClose} className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-all">
                <X className="w-6 h-6 text-white" />
             </button>
             <div>
                <h2 className="text-base font-heading font-extrabold text-white uppercase tracking-tight">{t("music.library")}</h2>
                <p className="text-[10px] text-primary font-bold tracking-widest uppercase">Native Media Index</p>
             </div>
          </div>
          <button onClick={loadMusic} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
             <RefreshCw className={`w-5 h-5 text-white/70 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t("music.search")}
            className="w-full h-12 bg-zinc-900/80 border border-white/5 rounded-2xl pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-zinc-950 pb-32">
        {loading && songs.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-4 animate-pulse">
            <AudioWaveform className="w-12 h-12 text-primary/40" />
            <p className="text-xs font-bold text-white/20 tracking-widest uppercase">Indexing All Audio Files...</p>
          </div>
        ) : filteredSongs.length > 0 ? (
          <div className="flex flex-col p-2 gap-1.5">
            {filteredSongs.map((song) => (
              <div
                key={song.id}
                className={`flex flex-col p-4 rounded-3xl transition-all duration-300 ${activeSong === song.id ? 'bg-primary/15 border border-primary/20 shadow-2xl' : 'bg-white/5 border border-white/5 hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-4">
                  <button
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeSong === song.id ? 'bg-primary text-white' : 'bg-zinc-800 text-white/60'}`}
                    onClick={() => handleSongClick(song)}
                  >
                    {activeSong === song.id && isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                  </button>

                  <div className="flex-1 min-w-0" onClick={() => handleSongClick(song)}>
                    <h3 className="font-extrabold text-sm text-white truncate">{song.name}</h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{song.artist || 'Unknown Artist'} • {song.duration}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(song.url, song.name);
                    }}
                    className="p-3.5 rounded-2xl bg-primary text-white shadow-lg shadow-primary/30 hover:brightness-110 active:scale-90 transition-all"
                  >
                    <Plus className="w-6 h-6 stroke-[3px]" />
                  </button>
                </div>

                {/* Waveform Visualization */}
                {activeSong === song.id && (
                  <div className="mt-6 px-1 animate-in slide-in-from-top-4 duration-500">
                    <div ref={waveformRef} className="w-full opacity-90" />
                    <div className="flex justify-between mt-2 px-1">
                       <span className="text-[8px] font-black text-primary/60 tracking-widest">LIVE WAVEFORM ANALYZER</span>
                       <span className="text-[8px] font-black text-white/40">{song.duration}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
            <div className="w-20 h-20 rounded-full bg-zinc-900 border border-white/5 flex items-center justify-center mb-6 shadow-2xl">
               <Music className="w-10 h-10 text-zinc-700" />
            </div>
            <h3 className="text-white font-bold mb-2 uppercase tracking-tight">{t("music.empty")}</h3>
            <button
              onClick={loadMusic}
              className="mt-6 px-10 py-3 rounded-2xl bg-white text-black text-xs font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              {t("music.retry")}
            </button>
          </div>
        )}
      </div>

      {/* Glossy Mini Player */}
      {activeSong && (
        <div className="fixed bottom-6 left-6 right-6 h-20 bg-zinc-900/60 backdrop-blur-3xl border border-white/10 rounded-[32px] flex items-center px-6 gap-5 animate-in slide-in-from-bottom-10 duration-700 z-50 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
             <Volume2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-primary tracking-widest uppercase mb-1">Now Previewing</p>
            <h4 className="text-xs font-extrabold text-white truncate">
               {songs.find(s => s.id === activeSong)?.name}
            </h4>
          </div>
          <div className="flex gap-1">
             <button
                onClick={() => wavesurfer.current?.playPause()}
                className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white"
             >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
             </button>
             <button
                onClick={() => { wavesurfer.current?.stop(); setActiveSong(null); }}
                className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/50"
             >
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicLibrary;
