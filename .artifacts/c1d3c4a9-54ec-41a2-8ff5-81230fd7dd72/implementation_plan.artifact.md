# Implementation Plan - AI Local Models & Core Improvements

Transitioning the project from a structural skeleton to a fully functional AI-powered media studio with local processing capabilities.

## User Review Required

> [!IMPORTANT]
> **Local AI Strategy:** We will prioritize **MediaPipe** for vision tasks and **Transformers.js** for audio/text. For heavy tasks like Video Upscaling or Stabilization, we will implement a "Hybrid Engine" that attempts local processing (via FFmpeg.wasm) but falls back to a remote provider if the device hardware is insufficient (RAM/GPU constraints).

> [!WARNING]
> **Android WebView Limitations:** Android WebViews have strict memory limits. Background removal on large videos might be slow. We will implement "Progressive Processing" to avoid OOM (Out of Memory) crashes on Android.

## Proposed Changes

### [AI Core Runtime]

#### [NEW] [AIRuntime.ts](file:///D:/rhythm-vieron-studio/src/services/ai/AIRuntime.ts)
- Implement a central registry for all 12 AI tools.
- Manage shared `WebWorker` pool to prevent UI blocking.
- Handle model pre-fetching and caching in IndexedDB.
- Logic for "Auto-Fallback" to remote providers (Supabase Edge Functions).

#### [MODIFY] [visionAnalyzer.ts](file:///D:/rhythm-vieron-studio/src/lib/visionAnalyzer.ts)
- Replace all remaining mocks with full MediaPipe implementations.
- Add support for Selfie Segmentation (Background Removal).

#### [NEW] [audioIsolation.ts](file:///D:/rhythm-vieron-studio/src/lib/ai/audioIsolation.ts)
- Local vocal separation using a small-footprint WebAudio model or remote fallback.

### [Android & Video Fixes]

#### [MODIFY] [videoUtils.ts](file:///D:/rhythm-vieron-studio/src/lib/videoUtils.ts)
- Fix the Android thumbnail "broken image" bug.
- Use `requestVideoFrameCallback` where available.
- Implement a more robust `canvas.toDataURL` cycle that works on Android WebView.
- Add support for `NativeService` to capture thumbnails using Android's `MediaMetadataRetriever` if the web method fails.

#### [MODIFY] [MediaContext.tsx](file:///D:/rhythm-vieron-studio/src/context/MediaContext.tsx)
- Improve file persistence for cover images to prevent "broken image" errors on reload.
- Fix race conditions in `addFiles` that cause Smart Templates to fail after loading.

### [Caption & Editor Features]

#### [NEW] [CaptionTemplates.ts](file:///D:/rhythm-vieron-studio/src/lib/captionTemplates.ts)
- Create a library of 20+ animated caption presets (CapCut-style).
- Presets will include combinations of: Animation + Font + Glow + Background.

#### [MODIFY] [CaptionPanel.tsx](file:///D:/rhythm-vieron-studio/src/components/editor/CaptionPanel.tsx)
- Add a "Templates" tab.
- Preview thumbnails for each caption style.
- Apply style to all existing captions or just the selected one.

### [AI Tool Integration]

#### [NEW] [AIToolsPanel.tsx](file:///D:/rhythm-vieron-studio/src/components/editor/AIToolsPanel.tsx)
- A new UI panel in the editor to access all 12 AI tools.
- Unified progress bar and "Before/After" comparison.

## Verification Plan

### Automated Tests
- `npm test`: Run existing vitest suite.
- Create new tests for `AIRuntime` model loading logic.

### Manual Verification
- **Android Deployment:** Build the APK and verify the video thumbnail fix.
- **Local AI Check:** Disconnect internet and verify that Background Removal (Image) still works.
- **Caption Library:** Verify that applying a template correctly updates the `CaptionOverlay`.
- **Smart Templates:** Run "AI Dream Magic" template with 5+ videos and ensure it doesn't crash.
