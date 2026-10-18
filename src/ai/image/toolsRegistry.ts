import React from "react";
import {
  Scissors,
  Sparkles,
  UserCheck,
  Eraser,
  Maximize2,
} from "lucide-react";
import { ImageAITaskType } from "./types";

export type ToolBadgeType = "ready" | "needs-download" | "cloud";

export interface ImageAIToolDefinition {
  id: ImageAITaskType;
  icon: React.ElementType;
  titleKey: string;
  descKey: string;
  badgeType: ToolBadgeType;
  downloadSize?: string;
  modelId?: string;
  accentColor: string;
  isClassical?: boolean;
}

/**
 * Single source of truth registry driving Image AI Tools Hub & Workspace
 */
export const IMAGE_AI_TOOLS_REGISTRY: ImageAIToolDefinition[] = [
  {
    id: "remove-background",
    icon: Scissors,
    titleKey: "imageAi.tools.removeBackground.title",
    descKey: "imageAi.tools.removeBackground.desc",
    badgeType: "ready", // MediaPipe Selfie Segmenter bundled or native ML Kit
    modelId: "mediapipe-selfie-segmenter",
    accentColor: "#3b82f6",
    isClassical: false,
  },
  {
    id: "object-remove",
    icon: Eraser,
    titleKey: "imageAi.tools.objectRemove.title",
    descKey: "imageAi.tools.objectRemove.desc",
    badgeType: "ready", // Local Harmonic Diffusion Inpainter
    accentColor: "#f43f5e",
    isClassical: false,
  },
  {
    id: "enhance",
    icon: Sparkles,
    titleKey: "imageAi.tools.enhance.title",
    descKey: "imageAi.tools.enhance.desc",
    badgeType: "ready", // Classical bilateral filtering & dynamic range
    accentColor: "#8b5cf6",
    isClassical: true,
  },
  {
    id: "face-enhance",
    icon: UserCheck,
    titleKey: "imageAi.tools.faceEnhance.title",
    descKey: "imageAi.tools.faceEnhance.desc",
    badgeType: "ready", // Classical face detail restoration with BlazeFace/MLKit detector
    modelId: "mediapipe-face-detector",
    accentColor: "#10b981",
    isClassical: true,
  },
  {
    id: "upscale",
    icon: Maximize2,
    titleKey: "imageAi.tools.upscale.title",
    descKey: "imageAi.tools.upscale.desc",
    badgeType: "ready", // Classical Sub-Pixel Convolution & Directional Laplacian filter
    modelId: "vieron-upscaler-2x",
    accentColor: "#f59e0b",
    isClassical: true,
  },
];

export function getToolDefinition(taskId: ImageAITaskType): ImageAIToolDefinition | undefined {
  return IMAGE_AI_TOOLS_REGISTRY.find((tool) => tool.id === taskId);
}
