# Clean Up Old Logos and Fix Icon Scaling

The user wants to remove all old branding assets and use only `img.png`. Additionally, the current icon appears too large, with parts of the 'V' clipped or not visible. I will clean up the project and implement a properly scaled adaptive icon.

## User Review Required

> [!WARNING]
> I will be deleting legacy PNG icons from the `mipmap` folders. While this cleans up the project as requested, it means older Android devices (pre-API 26) will fall back to a default icon unless I generate new legacy icons. I will focus on making the modern adaptive icon look perfect first.

## Proposed Changes

### Branding Clean-up

#### [DELETE] Old Assets
I will delete the following redundant files:
- `res/drawable/splash.png`
- `res/drawable/ic_launcher_vieron.png`
- `res/drawable/ic_launcher_foreground.xml` (the vector version)
- All `ic_launcher.png`, `ic_launcher_round.png`, and `ic_launcher_foreground.png` files in `mipmap-hdpi`, `mipmap-mdpi`, `mipmap-xhdpi`, `mipmap-xxhdpi`, and `mipmap-xxxhdpi`.

### Icon Scaling Fix

#### [NEW] [ic_launcher_logo.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/drawable/ic_launcher_logo.xml)
I will create a new drawable that wraps `img.png` with an `inset`. This will add internal padding so the logo fits within the "safe zone" of adaptive icons.
```xml
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/img"
    android:insetTop="18%"
    android:insetBottom="18%"
    android:insetLeft="18%"
    android:insetRight="18%" />
```

#### [MODIFY] [ic_launcher.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml)
Update to use the new scaled drawable.
```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_logo"/>
</adaptive-icon>
```

#### [MODIFY] [ic_launcher_round.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml)
Update to use the new scaled drawable.

#### [MODIFY] [styles.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/res/values/styles.xml)
Update the splash screen to use the new scaled logo so it's not too large during startup.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:assembleDebug` to ensure all references are correct.

### Manual Verification
- Deploy to a device.
- Verify the home screen icon: the 'V' should be centered and fully visible within the icon shape.
- Verify the splash screen: the logo should be appropriately sized and not touching the edges.
