# Final Deep Integration: Native Media Suite

The user wants to ensure the custom-designed gallery and music library are active and deeply integrated with the Android OS using Native code (Java), while explicitly requesting that the editor remains untouched and safe. I will connect the refined "Vieron" UI to the native Java bridge built earlier.

## User Review Required

> [!CAUTION]
> **Safety First:** I will NOT modify the core editing engine. I will only update how the "Upload" buttons trigger. Instead of opening a hidden file browser, they will open our custom native-powered UI.
> **Language Note:** The user mentioned "Rest". I am assuming they meant **React**, which is the current UI framework. It is perfect for this task because it allows us to build a rich, animated interface on top of native Android data.

## Proposed Changes

### Integration Logic (Safe Path)

#### [MODIFY] [Index.tsx](file:///D:/rhythm-vieron-studio/src/pages/Index.tsx)
- Ensure the state management for `showGallery` and `showMusicLibrary` is robust.
- Ensure the `Suspense` wrapper handles loading states gracefully.

#### [MODIFY] [MusicPanel.tsx](file:///D:/rhythm-vieron-studio/src/components/editor/MusicPanel.tsx)
- Replace the `fileRef` hidden input logic with a call to open the new `MusicLibrary` component.
- Ensure the `onAdd` callback from the `MusicLibrary` correctly adds the track to the `MediaContext` timeline, preserving all editor features.

#### [MODIFY] [MediaPicker.tsx](file:///D:/rhythm-vieron-studio/src/components/MediaPicker.tsx)
- Completely replace the HTML `input` logic with the `CustomGallery` trigger.
- Pass the selected `File` objects back to the `MediaContext` exactly as before, ensuring the editor receives the data in the format it expects.

### UI Polish

#### [MODIFY] [CustomGallery.tsx](file:///D:/rhythm-vieron-studio/src/components/CustomGallery.tsx)
- Implement a more aggressive "Scanning" indicator.
- Ensure images are cropped into squares in the grid for a more "Gallery-like" feel.
- Add a "Safe Zone" at the bottom for Android navigation bars.

## Verification Plan

### Manual Verification
1.  **Open Editor** -> Click **Audio** -> Click **Upload Music**. The new `MusicLibrary` should slide up.
2.  **Pick Song** -> Verify the waveform moves. Click **+**. The song should appear on the timeline.
3.  **Click Add Video/Photo** -> The `CustomGallery` should open. Select multiple files. Click **Done**. They should appear in the editor.
4.  **Hardware Back Button** -> Should close these libraries one by one without exiting the app.
