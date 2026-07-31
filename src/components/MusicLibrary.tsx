import { useState, useEffect, useRef } from "react";
import { X, Music, Play, Pause, Plus, Search, Loader2, Volume2, WaveformIcon } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { t, isRTL } from "@/lib/i18n";
import { Capacitor } from "@capacitor/core";

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
    // Simulated Device Songs for Demo / Native would fetch via Filesystem
    const fetchMusic = async () => {
      setLoading(true);
      setTimeout(() => {
        setSongs([
          { id: '1', name: 'Vieron Deep Bass', artist: 'Original', duration: '2:45', url: '/audio/demo1.mp3' },
          { id: '2', name: 'Cyberpunk Pulse', artist: 'Neon Beats', duration: '1:30', url: '/audio/demo2.mp3' },
          { id: '3', name: 'Ambient Flow', artist: 'Atmosphere', duration: '3:12', url: '/audio/demo3.mp3' },
        ]);
        setLoading(false);
      }, 1000);
    };
    fetchMusic();
  }, []);

  const initWaveform = (url: string) => {
    if (wavesurfer.current) {
      wavesurfer.current.destroy();
    }

    if (waveformRef.current) {
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

      wavesurfer.current.load(url);
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
    <div className="fixed inset-0 z-[100] bg-background flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
      {/* Header */}
      <div className="p-4 border-b border-border/50 glass sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary/80 transition-colors">
            <X className="w-6 h-6 text-foreground" />
          </button>
          <h2 className="text-lg font-heading font-bold text-foreground">{t("music.library")}</h2>
          <div className="w-10"></div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder={t("music.search")}
            className="w-full h-11 bg-secondary/50 border border-border/50 rounded-2xl pl-10 pr-4 text-sm focus:outline-none focus:border-primary/50 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-zinc-950/50 pb-32">
        {loading ? (
          <div className="h-full w-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredSongs.length > 0 ? (
          <div className="flex flex-col p-2 gap-1">
            {filteredSongs.map((song) => (
              <div
                key={song.id}
                className={`flex flex-col p-4 rounded-2xl transition-all ${activeSong === song.id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-secondary/30'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeSong === song.id ? 'bg-primary text-white animate-pulse' : 'bg-secondary text-muted-foreground'}`} onClick={() => handleSongClick(song)}>
                    {activeSong === song.id && isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                  </div>

                  <div className="flex-1 min-w-0" onClick={() => handleSongClick(song)}>
                    <h3 className="font-bold text-sm text-foreground truncate">{song.name}</h3>
                    <p className="text-xs text-muted-foreground">{song.artist} • {song.duration}</p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(song.url, song.name);
                    }}
                    className="p-3 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all active:scale-90"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Waveform Visualization */}
                {activeSong === song.id && (
                  <div className="mt-4 px-2 animate-in zoom-in-95 duration-300">
                    <div ref={waveformRef} className="w-full" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground p-10 text-center">
            <Music className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-sm font-medium">{t("music.empty")}</p>
          </div>
        )}
      </div>

      {/* Persistent Mini Player at bottom when song is active */}
      {activeSong && (
        <div className="fixed bottom-4 left-4 right-4 h-16 glass-card border border-primary/20 rounded-2xl flex items-center px-4 gap-4 animate-in slide-in-from-bottom duration-500 z-50">
          <Volume2 className="w-5 h-5 text-primary" />
          <div className="flex-1 text-xs font-bold text-foreground truncate">
            {songs.find(s => s.id === activeSong)?.name}
          </div>
          <div className="flex gap-2">
             <button onClick={() => wavesurfer.current?.playPause()} className="p-2 text-foreground">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
             </button>
             <button onClick={() => { wavesurfer.current?.stop(); setActiveSong(null); }} className="p-2 text-muted-foreground">
                <X className="w-5 h-5" />
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicLibrary;
