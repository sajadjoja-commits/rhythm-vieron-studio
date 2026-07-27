# Fix App Logo Visibility in Launcher and Splash Screen

The app logo ("cover") is not appearing correctly because the launcher icon and splash screen are using a full-screen image (`ic_launcher_vieron.png`) as the icon's foreground. When Android scales a full-screen image to fit an icon's "foreground" layer (108dp x 108dp), the actual logo becomes too small or distorted.

I will switch the project to use the high-quality vector logo (`ic_launcher_foreground.xml`) which is already present in the project and designed for adaptive icons.

## Proposed Changes

### UI & Branding

#### [MODIFY] [ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
- Change the foreground drawable from `@drawable/ic_launcher_vieron` to `@drawable/ic_launcher_foreground`.

#### [MODIFY] [ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Change the foreground drawable from `@drawable/ic_launcher_vieron` to `@drawable/ic_launcher_foreground`.

#### [MODIFY] [styles.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/values/styles.xml)
- Update `windowSplashScreenAnimatedIcon` to use `@drawable/ic_launcher_foreground`. This ensures the splash screen displays the centered 'V' logo clearly.

## Verification Plan

### Manual Verification
- Deploy the app to a device or emulator.
- Observe the launcher icon on the home screen; it should show the neon 'V' logo.
- Launch the app and observe the splash screen; it should show the centered neon 'V' logo.
