import { useMedia, ExportPreset } from "@/context/MediaContext";
import { Smartphone, Film, Clock4, Square } from "lucide-react";

const PRESETS: { id: ExportPreset; label: string; seconds: number; Icon: any }[] = [
  { id: "reels-15", label: "Reels 15s", seconds: 15, Icon: Smartphone },
  { id: "reels-30", label: "Reels 30s", seconds: 30, Icon: Smartphone },
  { id: "reels-60", label: "Reels 60s", seconds: 60, Icon: Smartphone },
  { id: "story-60", label: "Story 60s", seconds: 60, Icon: Square },
  { id: "full", label: "كامل", seconds: 0, Icon: Film },
];

interface Props {
  totalDuration: number;
}

const TargetDurationBar = ({ totalDuration }: Props) => {
  const { exportPreset, setExportPreset } = useMedia();
  const active = PRESETS.find((p) => p.id === exportPreset)!;
  const target = active.seconds || totalDuration;
  const pct = Math.min(100, totalDuration === 0 ? 0 : (Math.min(totalDuration, target) / Math.max(totalDuration, target)) * 100);

  return (
    <div className="px-3 py-2 border-t border-border bg-card/50" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock4 className="w-3 h-3" />
          مدة الفيديو الهدف
        </span>
        <span className="text-[10px] font-bold text-primary">
          {totalDuration.toFixed(1)}s / {active.seconds === 0 ? "كامل" : `${active.seconds}s`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0 gradient-primary glow-primary-sm"
          style={{ width: `${pct}%` }}
        />
        {active.seconds > 0 && totalDuration > active.seconds && (
          <div className="absolute inset-y-0 right-0 w-px bg-destructive" style={{ left: `${(active.seconds / totalDuration) * 100}%` }} />
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setExportPreset(p.id)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold whitespace-nowrap ${
              exportPreset === p.id ? "gradient-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            <p.Icon className="w-3 h-3" />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TargetDurationBar;
