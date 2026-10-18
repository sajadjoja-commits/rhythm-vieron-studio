import React, { useRef } from 'react';
import { Sparkles, Palette, Layers, Image as ImageIcon, Sliders, Droplet } from 'lucide-react';

export type BackgroundType = 'transparent' | 'color' | 'gradient' | 'bokeh' | 'image';

export interface BackgroundConfig {
  type: BackgroundType;
  color?: string;
  gradient?: {
    from: string;
    to: string;
    angle: number;
  };
  blurRadius?: number; // For bokeh mode (e.g. 5px - 40px)
  customImageUrl?: string;
}

interface Props {
  config: BackgroundConfig;
  onChange: (config: BackgroundConfig) => void;
}

const COLOR_PRESETS = [
  { label: 'أبيض ناصع', value: '#ffffff' },
  { label: 'رمادي ستوديو', value: '#e2e8f0' },
  { label: 'رمادي داكن', value: '#1e293b' },
  { label: 'أسود فحمي', value: '#0a0a0c' },
  { label: 'أزرق كحلي', value: '#1e3a8a' },
  { label: 'أخضر كروما', value: '#00b140' },
  { label: 'وردي ناعم', value: '#f472b6' },
  { label: 'بيج دافئ', value: '#fef3c7' }
];

const GRADIENT_PRESETS = [
  { label: 'غروب', from: '#ff512f', to: '#dd2476', angle: 135 },
  { label: 'محيط عميق', from: '#2b5876', to: '#4e4376', angle: 135 },
  { label: 'نيون أرجواني', from: '#8a2387', to: '#e94057', angle: 90 },
  { label: 'زمرد فخم', from: '#0ba360', to: '#3cba92', angle: 135 },
  { label: 'ستوديو سبوتلايت', from: '#374151', to: '#111827', angle: 180 },
  { label: 'سماء قطبية', from: '#4facfe', to: '#00f2fe', angle: 90 }
];

export const BackgroundPreviewBar: React.FC<Props> = ({ config, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onChange({
        type: 'image',
        customImageUrl: url
      });
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 space-y-3.5">
      {/* Category selector */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-neutral-950/70 rounded-lg border border-neutral-800/80 text-xs">
        <button
          type="button"
          onClick={() => onChange({ type: 'transparent' })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
            config.type === 'transparent'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>شفافة (PNG)</span>
        </button>

        <button
          type="button"
          onClick={() => onChange({ type: 'color', color: config.color || '#ffffff' })}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
            config.type === 'color'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Palette className="w-3.5 h-3.5 text-pink-400" />
          <span>لون صلب</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onChange({
              type: 'gradient',
              gradient: config.gradient || GRADIENT_PRESETS[0]
            })
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
            config.type === 'gradient'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>تدرج لوني</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onChange({
              type: 'bokeh',
              blurRadius: config.blurRadius || 18
            })
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
            config.type === 'bokeh'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Droplet className="w-3.5 h-3.5 text-amber-400" />
          <span>تغبيش الأصل (Bokeh)</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
            config.type === 'image'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>صورة مخصصة</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleCustomImageUpload}
        />
      </div>

      {/* Specific Options Subpanel */}
      {config.type === 'color' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neutral-400">تخصيص:</span>
            <input
              type="color"
              value={config.color || '#ffffff'}
              onChange={(e) => onChange({ type: 'color', color: e.target.value })}
              className="w-7 h-7 rounded border border-neutral-700 cursor-pointer bg-transparent p-0.5"
            />
          </div>
          <div className="h-4 w-px bg-neutral-800 mx-1" />
          <div className="flex items-center gap-1.5 flex-wrap">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ type: 'color', color: p.value })}
                title={p.label}
                className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                  config.color === p.value
                    ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-110'
                    : 'border-neutral-700 hover:scale-105'
                }`}
                style={{ backgroundColor: p.value }}
              />
            ))}
          </div>
        </div>
      )}

      {config.type === 'gradient' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-neutral-400">نماذج التدرج:</span>
          {GRADIENT_PRESETS.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ type: 'gradient', gradient: g })}
              title={g.label}
              className={`w-7 h-7 rounded-lg border transition-all cursor-pointer ${
                config.gradient?.from === g.from && config.gradient?.to === g.to
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30 scale-110'
                  : 'border-neutral-700 hover:scale-105'
              }`}
              style={{
                background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`
              }}
            />
          ))}
        </div>
      )}

      {config.type === 'bokeh' && (
        <div className="flex items-center gap-3 pt-1 text-xs">
          <Sliders className="w-4 h-4 text-amber-400" />
          <span className="text-neutral-400">قوة تغبيش الخلفية:</span>
          <input
            type="range"
            min={4}
            max={40}
            step={2}
            value={config.blurRadius || 18}
            onChange={(e) =>
              onChange({
                type: 'bokeh',
                blurRadius: parseInt(e.target.value, 10)
              })
            }
            className="w-48 accent-amber-500 cursor-pointer"
          />
          <span className="font-mono text-neutral-300">{config.blurRadius || 18}px</span>
        </div>
      )}

      {config.type === 'image' && config.customImageUrl && (
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-neutral-300">تم اختيار خلفية صورة من الجهاز</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-indigo-400 hover:underline cursor-pointer"
          >
            تغيير الصورة
          </button>
        </div>
      )}
    </div>
  );
};
