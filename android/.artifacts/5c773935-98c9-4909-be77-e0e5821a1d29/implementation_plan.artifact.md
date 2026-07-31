# Implement Step-by-Step Back Button Navigation

The goal is to allow users to navigate backward through the app's menus and pages one by one using the hardware back button, until they reach the home screen, and then exit the app.

## User Review Required

> [!IMPORTANT]
> I have installed the `@capacitor/app` plugin to properly intercept the hardware back button on Android.
> I will modify the app's navigation logic so that changing tabs or opening menus adds a new entry to the navigation history. This ensures that the "one by one" back behavior works as expected.

## Proposed Changes

### Navigation Logic

#### [MODIFY] [Index.tsx](file:///D:/rhythm-vieron-studio/src/pages/Index.tsx)
- Integrate `@capacitor/app` to listen for the hardware `backButton` event.
- Update the `activeTab` change logic to use `history.pushState` so tab changes can be reversed by the back button.
- Consolidate the "one by one" logic:
    1. Close open templates/editors first.
    2. Close the "Plus" menu if open.
    3. Close the "Photo Editor" if open.
    4. If in a sub-tab (Projects, Settings, etc.), return to the Home tab.
    5. If already on the Home tab, require a second back press within 2 seconds to exit the app.

### Native Integration

#### [MODIFY] [MainActivity.java](file:///D:/rhythm-vieron-studio/android/app/src/main/java/com/vireon/ai/MainActivity.java)
- Ensure the back button is correctly forwarded to the Capacitor bridge (standard behavior, but I will double-check).

## Verification Plan

### Manual Verification
- Open the app, switch to "Settings". Press back -> should return to "Home".
- Open the "Plus" menu. Press back -> should close menu.
- Open the Editor. Press back -> should return to previous screen.
- On the "Home" screen, press back once -> should show a toast message. Press again -> app should exit.
