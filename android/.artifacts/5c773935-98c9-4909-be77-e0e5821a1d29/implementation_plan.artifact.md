# Fix Audio Playback, Waveforms, and Gradle Performance

I will address the issues with the music library (playback and waveforms) and optimize the project configuration by resolving deprecated Gradle settings and enabling performance improvements.

## User Review Required

> [!IMPORTANT]
> I am updating the `MusicLibrary` to correctly handle Android `content://` URIs for audio playback and waveform generation. I am also cleaning up the `gradle.properties` file to remove deprecated warnings and enable build-time optimizations.

## Proposed Changes

### Audio & Music Library

#### [MODIFY] [MusicLibrary.tsx](file:///D:/rhythm-vieron-studio/src/components/MusicLibrary.tsx)
- Use `Capacitor.convertFileSrc()` for all native audio URLs before passing them to `wavesurfer.js`. This allows the webview to correctly stream and visualize the local files.
- Ensure the `wavesurfer` instance is properly cleaned up and re-initialized when switching songs.

### Build & Performance Optimization

#### [MODIFY] [gradle.properties](file:///D:/rhythm-vieron-studio/android/gradle.properties)
- **Remove Deprecated Settings:**
    - `android.enableAppCompileTimeRClass`
    - `android.r8.optimizedResourceShrinking`
    - `android.defaults.buildfeatures.resvalues`
- **Enable Performance Flags:**
    - Add `android.dependency.excludeLibraryComponentsFromConstraints=true` to speed up project importing and dependency resolution.
- **Clean Up:** Remove redundant/commented-out entries.

#### [MODIFY] [capacitor-cordova-android-plugins/build.gradle](file:///D:/rhythm-vieron-studio/android/capacitor-cordova-android-plugins/build.gradle)
- Ensure `flatDir` is removed (re-verifying after the user's warning).

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleDebug` to ensure no build warnings or errors.

### Manual Verification
1.  **Music Library:** Open the library, click a song.
    - The waveform should appear immediately and start moving.
    - Audio should play through the speakers.
2.  **Performance:** Verify the build process feels snappier.
