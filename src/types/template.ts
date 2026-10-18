import { Clip, Caption, OverlayItem, AudioTrackItem, FilterItem, VfxItem, ExportPreset } from "@/context/MediaContext";

export interface TemplateClipLock {
  id: string;
  editable: boolean;
  label?: string;
}

export interface EditableProjectData {
  clips: (Clip & { editable?: boolean })[];
  captions: (Caption & { editable?: boolean })[];
  overlays: (OverlayItem & { editable?: boolean })[];
  audioTracks: (AudioTrackItem & { editable?: boolean })[];
  filters: FilterItem[];
  vfx: VfxItem[];
  totalDuration: number;
  activeRatio?: number;
  exportPreset?: ExportPreset;
  allowTextEditing: boolean;
  allowMusicMuting: boolean;
  mediaItems?: {
    id: string;
    url: string;
    type: "video" | "image";
    name: string;
  }[];
}

export interface PublishedTemplate {
  id: string;
  user_id: string;
  title: string;
  hashtags: string[];
  cover_url: string;
  creator_name?: string;
  creator_email?: string;
  created_at: string;
  views_count?: number;
  uses_count?: number;
  project_data: EditableProjectData;
}
