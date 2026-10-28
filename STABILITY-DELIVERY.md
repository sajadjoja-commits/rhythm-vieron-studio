# Stability delivery — 2026-10-28

Shared fixes from the Lovable preview, ported without changing the original Vite/React Router/Android setup or package lock.

- Automatic installation modal removed; manual installation remains available.
- Type and runtime safety fixes across editor, photo, templates, AI engines and media handling.
- One shared Capacitor media plugin registration.
- Processed video metadata is checked before replacing original project media.
- Whisper and MediaPipe load pinned runtime assets remotely because large WASM/model binaries are absent from the preview. Initial download requires internet; complete offline AI is not certified.
- Web preview regression verification: 31 test files, 245 tests passed. Real 320×180 WebM imported and decoded in editor; no page exceptions. Sandbox Chromium lacks H.264 support, so MP4 decoding was not certified there.
- Android APK checks remain separate and unverified; build artifacts and Android tooling are required.
- Audio stem separation remains approximate DSP. Full neural separation and offline inference certification are pending, not claimed complete.

TanStack-specific scaffolding remains in Lovable; the original Vite entry point and routing stay unchanged here.
