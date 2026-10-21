# Vireon native Android shell

This is a standalone Kotlin/Android WebView wrapper for the published Vireon web app. It is deliberately separate from the legacy `android/` Capacitor project.

## Build

Requires JDK 17+ and Android SDK Platform 35.

```bash
./gradlew assembleDebug
```

Debug APK output: `app/build/outputs/apk/debug/app-debug.apk`.

## Signing

For local release signing, create `keystore.properties` in this directory (never commit it):

```properties
storeFile=/absolute/path/to/your-release-key.jks
storePassword=...
keyAlias=...
keyPassword=...
```

No signing credentials belong in source control.

## Web content

The app loads https://rhythm-vieron-studio.lovable.app. The web UI remains web content inside a full-screen native WebView; web deployments update independently of this APK. Changes to Kotlin/native behavior still require a new APK.

## Current scope

- Kotlin-only Android shell, no Capacitor/Cordova runtime in this directory.
- WebView JavaScript, DOM storage, media playback, upload picker for image/audio/video.
- Chunked MediaStore export bridge: `beginSaveFile`, `appendSaveChunk`, `finishSaveFile`, and `cancelSaveFile`.
- External HTTP(S) links open in the browser; the app origin and Supabase/Google auth hosts are allowed in WebView.
- Offline behavior, Google OAuth return/deep-link flow, share bridge, and real-device export verification are not yet complete.
