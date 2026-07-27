# Implementation Plan: Unify App Logo (Fixing Android Launcher Icon)

The goal is to ensure the app logo (the neon "V") is used consistently as the Android app icon, the splash screen, and the web icon. Currently, the Android launcher icon is showing as a default robot on some devices due to inconsistent adaptive icon configuration.

## User Review Required

> [!IMPORTANT]
> I will be removing the vector version of the logo (`ic_launcher_foreground.xml`) and strictly using the PNG version (`ic_launcher_vieron.png`) for everything to ensure perfect consistency across all environments.

## Proposed Changes

### [Component] Android Resources

#### [MODIFY] [mipmap-anydpi-v26/ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
#### [MODIFY] [mipmap-anydpi-v26/ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Change `<foreground android:drawable="..." />` to point to `@drawable/ic_launcher_vieron`.

#### [MODIFY] [values/styles.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/values/styles.xml)
- Change `windowSplashScreenAnimatedIcon` to point to `@drawable/ic_launcher_vieron`.

#### [DELETE] [drawable-v24/ic_launcher_foreground.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml)
- Remove the redundant vector file to prevent system confusion.

#### [MODIFY] [mipmap folders](file:///D:/rhythm-vieron-studio/android/app/src/main/res/)
- Ensure all `ic_launcher.png` and `ic_launcher_round.png` files in `hdpi`, `mdpi`, etc., are copies of the neon "V" logo.

### [Component] Web Resources

#### [MODIFY] [public/](file:///D:/rhythm-vieron-studio/public/)
- Verify `favicon.png`, `icon-192.png`, and `icon-512.png` are using the unified logo.

## Verification Plan

### Manual Verification
- Check the `mipmap` folders to ensure all PNGs are identical.
- Verify `styles.xml` and adaptive XMLs point to `ic_launcher_vieron`.
- Run `git status` to confirm deletion of old files.
