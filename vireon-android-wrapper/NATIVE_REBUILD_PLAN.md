# Vireon Native Android Rebuild

## Goal
Replace the URL-only WebView wrapper with an Android application whose primary interface and core workflows run natively on Android. Keep the existing web application and current APK untouched while this rebuild is developed on a separate branch.

## Non-negotiable constraints
- Application ID remains `com.vireon.ai`.
- Preserve the current production web app and database; do not delete or overwrite them.
- Do not remove the existing wrapper or the current export-saving branch.
- Do not claim a feature is complete until it builds and is tested.
- Never put signing keys or passwords in source control.
- Keep the first migration milestones small enough to build and validate independently.

## Architecture direction
- Kotlin for Android application code.
- Jetpack Compose for native screens and navigation.
- Android MediaStore / SAF for native media import and export.
- Reuse the existing Supabase backend and authentication where technically compatible.
- Native media pipeline for Android exports rather than relying on WebView Blob downloads.
- WebView is not the primary app interface. It may remain temporarily as a controlled fallback for features not migrated yet, but the target is a native workflow.

## Migration order
1. **Foundation:** inspect existing app features, authentication, database tables, storage buckets, and AI service dependencies. Establish a clean native build and app navigation without changing production data.
2. **Native shell and design system:** native launch screen, dark theme, navigation, permissions, file picker, error/loading states.
3. **Media library:** import and preview local images, videos, and audio using Android APIs.
4. **Editor MVP:** native project creation, timeline/state model, trim/crop/basic controls, and reliable save/export.
5. **Export pipeline:** write output through MediaStore/SAF, handle large files without converting the entire video to Base64, and verify results on a real device.
6. **AI and transcription:** migrate one feature at a time after identifying whether it runs locally, through Supabase, or through external services.
7. **Feature parity:** move remaining tools, audio library, projects, settings, and account workflows.
8. **Release checks:** debug/release builds, offline/error handling, permissions, install/update compatibility, and device testing.

## Acceptance criteria
- The app's home and navigation work without loading the Lovable URL.
- Selecting and previewing local media works on the target Android device.
- Exported files appear in the expected Downloads/Gallery location and can be opened.
- Large video export does not require a full Base64 copy in memory.
- Existing web app and user data remain intact.
- APK build is repeatable and its artifact is verified before device testing.

## Current status
Planning branch created from `main`. This is a migration start, not a claim that the native rewrite or APK is complete. The existing Kotlin wrapper still loads the web URL until native screens and features are implemented and validated.
