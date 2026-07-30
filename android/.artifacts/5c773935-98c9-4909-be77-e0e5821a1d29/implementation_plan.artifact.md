# Switch App Logo to PNG Image (img.png)

The user wants to use the specific `img.png` file they added to the `drawable` folder as the primary app logo (launcher icon foreground and splash screen icon), replacing the previous vector implementation.

## User Review Required

> [!IMPORTANT]
> I will switch the app to use `img.png`. Note that since `img.png` is a bitmap, it may not scale as perfectly as the Vector version, and if it has a non-transparent background, it will appear as a square within the icon's shape on some devices.

## Proposed Changes

### UI & Branding

#### [MODIFY] [ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
- Update foreground to use `@drawable/img`.

#### [MODIFY] [ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
- Update foreground to use `@drawable/img`.

#### [MODIFY] [styles.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/values/styles.xml)
- Update `windowSplashScreenAnimatedIcon` to use `@drawable/img`.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleDebug` to ensure no resource errors.

### Manual Verification
- Deploy the app and check the launcher icon and splash screen.
- Verify the `img.png` is centered and visible.
