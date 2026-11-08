# Architecture rules
- Bundle version-matched MediaPipe runtime files and the selfie model with the app; local video cutout must not depend on a CDN.
- Keep video sizing policy shared and aspect-ratio preserving; bounded processing dimensions prevent mobile memory exhaustion.
- Video jobs reserve completion for output verification and preview attachment; engine completion alone is not UI completion.
- Transparent video encoding must preserve real decoded alpha or fail explicitly; never label an opaque output as transparent.
- Beat-montage cuts carry any per-slot shortfall into the next slot; short sources must never drift later cuts off the beat grid.
- لا تضف videoAnalysisCore.ts؛ التحليل الفعلي بـ workers/videoAnalysis.worker.ts فقط.
- Render motion layers through the shared canvas drawing utility in preview and export; timeline time, not wall-clock time, drives animation.
- The local motion director extracts bounded frames and delegates visual scoring to the existing video-analysis worker; failed analysis never replaces layers with fabricated scores.
- Smart montage results carry motion overlays, and every template application path consumes them alongside filters and VFX.
