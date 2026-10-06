# Architecture rules
- Bundle version-matched MediaPipe runtime files and the selfie model with the app; local video cutout must not depend on a CDN.
- Keep video sizing policy shared and aspect-ratio preserving; bounded processing dimensions prevent mobile memory exhaustion.
- Video jobs reserve completion for output verification and preview attachment; engine completion alone is not UI completion.
- Transparent video encoding must preserve real decoded alpha or fail explicitly; never label an opaque output as transparent.
- Beat-montage cuts carry any per-slot shortfall into the next slot; short sources must never drift later cuts off the beat grid.
