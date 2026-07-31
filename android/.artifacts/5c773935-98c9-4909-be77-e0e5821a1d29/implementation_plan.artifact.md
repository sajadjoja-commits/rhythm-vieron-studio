# Fix Media Access & Full Device Integration

The custom gallery and music library are currently empty because they either lack runtime permission requests or are using simulated data. I will implement actual device scanning to show all photos, videos, and music files.

## User Review Required

> [!IMPORTANT]
> To access all files on the device (especially on Android 11+), I will implement recursive folder scanning for the Music Library. This ensures we find all audio files regardless of where they are stored.
> For the Gallery, I will add the mandatory runtime permission pop-ups.

## Proposed Changes

### Media Access (Photos/Videos)

#### [MODIFY] [CustomGallery.tsx](file:///D:/rhythm-vieron-studio/src/components/CustomGallery.tsx)
- Add `Media.requestPermissions()` call before fetching assets.
- Use `Media.getMedias` with proper error handling and fallback logic.
- Ensure thumbnails are correctly converted for display in the webview.

### Full Music Access (Audio)

#### [MODIFY] [MusicLibrary.tsx](file:///D:/rhythm-vieron-studio/src/components/MusicLibrary.tsx)
- Replace simulated songs with actual file scanning.
- Use `@capacitor/filesystem` to scan `Documents`, `Downloads`, and `Music` directories.
- Filter for `.mp3`, `.m4a`, `.wav`, and `.ogg` files.
- Extract file metadata (name, size) to show in the list.

### Native Configuration

#### [MODIFY] [AndroidManifest.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/AndroidManifest.xml)
- Double-check that `android:requestLegacyExternalStorage="true"` is set if needed (though we are targeting modern APIs).

## Verification Plan

### Manual Verification
- Launch the app and click "Add Media" -> A system permission dialog should appear.
- After granting permission, the custom gallery should populate with your device's photos and videos.
- Open the Music Library -> It should show a "Scanning..." state and then list all audio files found on your device.
- Select an audio file -> Waveform should render as before, but with the real file data.
