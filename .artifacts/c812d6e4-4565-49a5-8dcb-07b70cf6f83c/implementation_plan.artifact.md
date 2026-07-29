# Implementation Plan: Fix Android App Icon (Branding Fix)

The goal is to ensure the app logo (the neon "V") appears correctly as the Android app icon on all devices, fixing the issue where it reverts to the default "robot" or fails to show.

## User Review Required

> [!IMPORTANT]
> I will be removing the vector version of the icon and enforcing the PNG version (`ic_launcher_vieron.png`) across all resolutions. This is the most reliable way to ensure consistency on different Android launchers.

## Proposed Changes

### [Component] Android Resources Cleanup & Enforcement

#### [DELETE] [drawable-v24/ic_launcher_foreground.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml)
- Remove the conflicting vector file that might be causing rendering issues.

#### [MODIFY] [mipmap density folders](file:///D:/rhythm-vieron-studio/android/app/src/main/res/)
- Copy the master logo `ic_launcher_vieron.png` to:
    - `ic_launcher.png` (in all density folders)
    - `ic_launcher_round.png` (in all density folders)
    - `ic_launcher_foreground.png` (in all density folders) - **New for Adaptive support**

#### [MODIFY] [mipmap-anydpi-v26/ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
#### [MODIFY] [mipmap-anydpi-v26/ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Update `<foreground android:drawable="..." />` to point to `@mipmap/ic_launcher_foreground`.

## Verification Plan

### Automated Steps
- Run `git status` to verify file changes.
- Perform a fresh `npm run build` and `npx cap sync android`.

### Manual Steps
- **CRITICAL**: You MUST **Uninstall** the app from your phone and **Re-install** it. Launcher icons are heavily cached by Android and won't update otherwise.
- In Android Studio, use **Build > Clean Project** then **Build > Rebuild Project** before running.
