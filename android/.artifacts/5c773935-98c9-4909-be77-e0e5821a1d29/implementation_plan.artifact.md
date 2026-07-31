# Solidify Whisper-Base Integration for Offline AI

The user wants to ensure that the more powerful `whisper-base` model is the primary engine for speech-to-text, accepting the increase in application size. Currently, the project has models split between manual asset folders and the Capacitor-managed `public` folder. I will unify this and lock in the `whisper-base` priority.

## User Review Required

> [!NOTE]
> Including the `whisper-base` model (~77MB) and `whisper-tiny` (~40MB) as a fallback will increase the final APK size by approximately 120MB. This ensures the app works perfectly without an internet connection.

## Proposed Changes

### AI Models & Assets Unification

#### [MOVE] Transfer Models to Root Public Folder
- Move/Copy all files from `android/app/src/main/assets/models/` to the project root `public/models/`.
- Specifically, ensure `whisper-tiny` is present in `public/models/` (currently only `whisper-base` is there).
- This ensures Capacitor manages all models and they are correctly synced to the APK assets.

#### [DELETE] Cleanup Manual Asset Folders
- Remove the manual `android/app/src/main/assets/models` folder once the transfer is confirmed. This prevents confusion and ensures the "Source of Truth" is the root `public` folder.

### AI Engine Configuration

#### [MODIFY] [whisper-worker.ts](file:///D:/rhythm-vieron-studio/src/lib/whisper-worker.ts)
- Explicitly set the priority to `whisper-base` for the Android Native platform.
- Ensure the `quantized: true` setting matches the files available (`_quantized.onnx`).
- Add robust error handling to fallback to `whisper-tiny` ONLY if `base` fails to load.

## Verification Plan

### Automated Tests
- Run `npm run build` and `npx cap sync android`.
- Verify the presence of all models in `android/app/src/main/assets/public/models/`.

### Manual Verification
- Deploy the app.
- Check the logs to confirm: `[Faster-Whisper ONNX Native Android] Successfully loaded local "whisper-base" model`.
- Test speech-to-text offline to ensure the model is functioning correctly.
