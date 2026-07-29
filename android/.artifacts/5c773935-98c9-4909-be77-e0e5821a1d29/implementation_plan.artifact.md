# Fix Launcher Icon (Restore Unified Brand Logo)

The app is currently displaying the default Android "green robot" icon because the launcher icon configuration was reset or the custom vector logo file was lost. I will restore the custom neon 'V' logo and unify it across the launcher icon and the splash screen.

## Proposed Changes

### UI & Branding

#### [NEW] [ic_launcher_foreground.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/drawable/ic_launcher_foreground.xml)
- Re-create the high-quality vector logo ('V' with neon glow and gradient).

#### [MODIFY] [ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
- Update the foreground drawable to reference the restored vector logo: `@drawable/ic_launcher_foreground`.

#### [MODIFY] [ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Update the foreground drawable to reference the restored vector logo: `@drawable/ic_launcher_foreground`.

#### [MODIFY] [styles.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/values/styles.xml)
- Update `windowSplashScreenAnimatedIcon` to use `@drawable/ic_launcher_foreground` for a sharp, centered startup logo.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleDebug` to ensure no resource conflicts.

### Manual Verification
- Deploy the app to a device or emulator.
- Verify the launcher icon on the home screen shows the neon 'V' logo.
- Verify the splash screen shows the same neon 'V' logo.
