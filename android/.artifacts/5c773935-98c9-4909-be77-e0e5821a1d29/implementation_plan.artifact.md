# Professional Custom Media & Music Libraries

The user wants to replace the standard file pickers with custom, professionally designed galleries for photos, videos, and music that match the app's theme.

## User Review Required

> [!IMPORTANT]
> I will be adding a **Custom Gallery** and a **Music Library** with real-time waveform visualization.
> This requires device permissions (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`) which are already in the manifest but will now be requested at runtime through the custom UI.

## Proposed Changes

### Custom Media Gallery (Photos/Videos)

#### [NEW] [CustomGallery.tsx](file:///D:/rhythm-vieron-studio/src/components/CustomGallery.tsx)
- Create a modern, high-performance grid UI.
- Use `@capacitor-community/media` to fetch actual device thumbnails and media metadata.
- Support multi-selection with "Vieron" styled checkmarks.
- Dark theme integration with glassmorphism effects.

### Custom Music Library (Audio)

#### [NEW] [MusicLibrary.tsx](file:///D:/rhythm-vieron-studio/src/components/MusicLibrary.tsx)
- Create a dedicated audio file browser.
- **Waveform Visualization:** Use `wavesurfer.js` to show moving audio waves when a track is previewed.
- **Pre-listening:** Allow users to play the music before adding it to the editor.
- **Direct Add:** Include a '+' button to insert the chosen track into the timeline immediately.

### Navigation & Integration

#### [MODIFY] [Index.tsx](file:///D:/rhythm-vieron-studio/src/pages/Index.tsx)
- Add states to manage the visibility of the new Custom Gallery and Music Library.
- Update the Back Button logic to handle closing these new libraries one by one.

#### [MODIFY] [MediaPicker.tsx](file:///D:/rhythm-vieron-studio/src/components/MediaPicker.tsx)
- Re-route existing "Upload" actions to trigger the new custom libraries instead of the native system picker.

## Verification Plan

### Manual Verification
- Click on "Add Media" -> The new custom dark-themed gallery should open.
- Scroll through photos/videos -> Thumbnails should load quickly.
- Click on "Add Music" -> The music browser should open.
- Select a song -> A waveform should appear and move in sync with the audio.
- Press hardware Back Button -> The library should close first, returning you to the previous screen.
