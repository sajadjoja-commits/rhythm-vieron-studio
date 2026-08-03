# Task: AI Local Models, Android Fixes & Caption Library

- `[x]` **Foundation & Bug Fixes**
    - `[x]` Implement `AIRuntime.ts` (Model registry & Worker management)
    - `[x]` Fix Android Video Thumbnail "Broken Image" bug in `videoUtils.ts`
    - `[x]` Fix Export Dialog loading bar/preview UI issue in `ExportDialog.tsx`
    - `[x]` Improve `MediaContext.tsx` persistence for cover images
- `[/]` **AI Tools Implementation**
    - `[x]` Integrate MediaPipe Selfie Segmentation (Background Removal)
    - `[ ]` Integrate local Image Upscaling/Denoising models
    - `[ ]` Implement Hybrid Fallback (Local -> Remote) for all 12 tools
    - `[x]` Add `AIToolsPanel.tsx` to Editor
- `[x]` **Caption & Animation Library**
    - `[x]` Create `captionTemplates.ts` with 20+ animated presets
    - `[x]` Add "Templates" tab to `CaptionPanel.tsx`
    - `[x]` Implement batch style application to captions
- `[ ]` **Verification & Deployment**
    - `[ ]` Performance & Memory optimization for Android WebView
    - `[ ]` Final testing of Smart Templates workflow
    - `[ ]` Push all updates to repository
