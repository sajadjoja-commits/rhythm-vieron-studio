# Vireon native Android shell

Standalone Kotlin Android wrapper for the published Vireon web app. This project is independent of the old Capacitor `android/` wrapper; the web project keeps its existing Capacitor dependencies for compatibility.

## Open in Android Studio

1. Open the repository on branch `feat/native-shell`.
2. In Android Studio choose **Open** and select the `android-shell/` directory (not the repository root).
3. Install Android SDK Platform 35 and use JDK 17.
4. Wait for Gradle sync, then choose **Run app** to launch on an emulator or connected Android phone.
5. To create an installable test APK, choose **Build > Build APK(s)**. The file is generated at `app/build/outputs/apk/debug/app-debug.apk`.

Command-line equivalent from the `android-shell/` directory:

```bash
./gradlew --no-daemon assembleDebug
```

The GitHub Actions workflow also builds the debug APK and publishes it as the `vireon-native-shell-debug` artifact for 14 days. The artifact includes a SHA-256 checksum. Open the workflow page and select the latest successful run to download it.

## Current native features

- Loads `https://rhythm-vieron-studio.lovable.app` in a full-screen WebView.
- Supports selecting one or multiple files through Android's document picker.
- Streams image, audio, video, and general export blobs in bounded Base64 chunks to Android MediaStore.
- Saves media in the Vireon subfolder under Pictures, Movies, Music, or Downloads as appropriate.
- Restricts the JavaScript bridge to the trusted top-level Vireon origin; the bridge is removed when navigating away.
- Opens non-allowlisted HTTP(S) links in the external browser.
- Provides a simple retry surface for main-frame network errors and handles Android back navigation.

## Important release and verification notes

- The hosted website must be updated with the matching `src/services/NativeService.ts` change for native save operations to call this bridge. A GitHub commit does **not** publish changes to the hosted Lovable site.
- Verify sign-in and OAuth return, upload selection, image/audio/video saving, interrupted downloads, rotation, keyboard behavior, external links, and offline/reconnect on a real Android device before release.
- Native share, deep-link return from Google OAuth, and offline-first asset caching are not claimed as implemented.
- No successful build or device test is claimed until a CI run or Android Studio build succeeds.

## Release signing

For local release signing, create `keystore.properties` in this directory and keep it out of version control:

```properties
storeFile=/absolute/path/to/your-release-key.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Never commit a keystore or signing credentials. The debug APK is for testing, not Play Store distribution. Before publishing, configure release signing, verify application identity/versioning, test the release variant, and prepare the Play listing and privacy disclosures.
