# Enable Full Access to Device Photos and Videos

The user is experiencing an empty gallery despite granting permissions. This is due to modern Android security policies (Android 13/14) which require specific configuration for "Gallery Apps" and granular permissions.

## User Review Required

> [!IMPORTANT]
> I will be enabling "Gallery Mode" for the media plugin. This will allow the app to see all albums and media files on the device. On Android 14, you may see a prompt asking to "Select photos" or "Allow all". For the best experience, please choose **"Allow all"**.

## Proposed Changes

### Build & Plugin Configuration

#### [MODIFY] [capacitor.config.ts](file:///D:/rhythm-vieron-studio/capacitor.config.ts)
- Add `Media: { androidGallery: true }` to the `plugins` section. This is a mandatory requirement for the `@capacitor-community/media` plugin version 7+ to function as a full gallery.

#### [MODIFY] [AndroidManifest.xml](file:///D:/rhythm-vieron-studio/android/app/src/main/AndroidManifest.xml)
- Add `READ_MEDIA_VISUAL_USER_SELECTED` permission to support Android 14's partial access feature.

### Media Fetching Logic

#### [MODIFY] [CustomGallery.tsx](file:///D:/rhythm-vieron-studio/src/components/CustomGallery.tsx)
- Update the permission request to be more granular.
- Implement a broader fetch that doesn't just look for "Recent" but queries the global media store.
- Add a "Retry" and "Open Settings" button if access is denied or restricted.

## Verification Plan

### Manual Verification
- Deploy to Android 13/14 device.
- Open Gallery -> Accept the "Allow access to all photos and videos" prompt.
- Verify that the grid populates with all device media.
- Test both "Image" and "Video" filters.
