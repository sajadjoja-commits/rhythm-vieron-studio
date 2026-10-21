# Vireon native Android shell

Standalone Kotlin Android wrapper for the published Vireon web app. This project is independent of the old Capacitor `android/` wrapper.

## Open in Android Studio

1. Download/clone this repository and check out `feat/native-shell`.
2. In Android Studio choose **Open** and select the `android-shell/` directory (not the repository root).
3. Install Android SDK Platform 35 and use JDK 17.
4. Wait for Gradle sync, then choose **Run app** to launch on an emulator or connected Android phone.
5. For an APK, use **Build > Build APK(s)**. The debug APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.

The command-line equivalent from this directory is:

```bash
./gradlew --no-daemon assembleDebug
```

A GitHub Actions workflow also builds the debug APK and stores it as the `vireon-native-shell-debug` artifact when a runner is available.

## Signing a release

For local release signing, create `keystore.properties` in this directory (never commit it):

```properties
storeFile=/absolute/path/to/your-release-key.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Do not put signing credentials in source control. A debug APK is for testing, not Play Store distribution.

## How it works

- Loads https://rhythm-vieron-studio.lovable.app in a full-screen WebView.
- Native Kotlin file picker supports image, audio, and video uploads.
- The `AndroidBridge` streams exported blobs in small Base64 chunks into Android MediaStore under Movies/Pictures/Music/Download, in a Vireon subfolder.
- Web export functions now detect this bridge first, while preserving the existing Capacitor path for the legacy wrapper and web behavior.
- The native bridge is exposed only when the top-level page is the Vireon app origin; external OAuth pages do not receive it.
- External HTTP(S) links open in the browser. The app origin plus Google/Supabase auth hosts are currently permitted in WebView.

## Known verification limits

- The current published web app must include the matching `src/services/NativeService.ts` update for the native save bridge to be used. The GitHub code change does not by itself publish the hosted Lovable site.
- Google OAuth session return/deep-link behavior, native share, and offline caching still need device-level verification/implementation.
- No successful Android APK build or physical-device test is claimed until GitHub Actions or Android Studio completes it successfully.
