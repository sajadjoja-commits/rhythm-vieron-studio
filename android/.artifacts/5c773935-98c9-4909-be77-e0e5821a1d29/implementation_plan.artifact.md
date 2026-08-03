# Comprehensive Fix for Media Access & Performance

I am reverting the custom libraries and restoring the high-performance default system pickers while keeping the project clean and optimized. The user found that the custom-built libraries had issues with audio playback, file adding, and video thumbnails. I will focus on making the default system integration perfect and lightning-fast.

## User Review Required

> [!IMPORTANT]
> I will be removing the custom `CustomGallery.tsx` and `MusicLibrary.tsx` logic and restoring the system file pickers. This is the most reliable way to ensure 100% audio and video compatibility across all Android versions without the "broken thumbnail" or "no sound" issues.

## Proposed Changes

### Reverting to Default UI (Reliability Priority)

#### [MODIFY] [MediaPicker.tsx](file:///D:/rhythm-vieron-studio/src/components/MediaPicker.tsx)
- Remove `CustomGallery` integration.
- Restore the standard HTML5 file input logic. This ensures Android's native system picker handles thumbnails and file access, which is always 100% compatible.

#### [MODIFY] [MusicPanel.tsx](file:///D:/rhythm-vieron-studio/src/components/editor/MusicPanel.tsx)
- Remove `onOpenDeviceLibrary` prop.
- Restore the `onUploadClick` logic that triggers the native system file selector for audio.

#### [MODIFY] [Index.tsx](file:///D:/rhythm-vieron-studio/src/pages/Index.tsx)
- Remove `showGallery` and `showMusicLibrary` states and components.
- Cleanup the `handleAddMusic` logic to be standard again.

### Performance & Cleanup

#### [DELETE] Custom Components
- Delete `src/components/CustomGallery.tsx`
- Delete `src/components/MusicLibrary.tsx`

#### [MODIFY] [gradle.properties](file:///D:/rhythm-vieron-studio/android/gradle.properties)
- Add `android.defaults.buildfeatures.resvalues=true` back if needed for some plugins, but keep the performance flag `android.dependency.excludeLibraryComponentsFromConstraints=true`.

### Native Bridge Cleanup

#### [MODIFY] [VireonMediaPlugin.java](file:///D:/rhythm-vieron-studio/android/app/src/main/java/com/vireon/ai/VireonMediaPlugin.java)
- Remove the unused `getGalleryAssets` and `getAudioAssets` methods to keep the APK light.
- Keep `saveVideoToGallery` as it is vital for exporting.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleDebug`.

### Manual Verification
- Open the editor -> Add Video -> System picker should open and allow selecting files with full thumbnails.
- Add Music -> System picker should allow selecting MP3s that play with sound and waveforms correctly in the editor.
