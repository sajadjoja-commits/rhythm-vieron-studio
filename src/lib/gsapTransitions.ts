import { gsap } from "gsap";
import { TransitionType } from "@/context/MediaContext";

// Pre-parse GSAP easing curves for high-performance deterministic evaluation
const easeElasticOut = gsap.parseEase("elastic.out(1.2, 0.35)");
const easeBackInOut = gsap.parseEase("back.inOut(1.7)");
const easePower4InOut = gsap.parseEase("power4.inOut");
const easeBounceOut = gsap.parseEase("bounce.out");

export function isGSAPTransition(type: TransitionType): boolean {
  return (
    type === "gsap-elastic-zoom" ||
    type === "gsap-3d-flip" ||
    type === "gsap-stagger-wipe" ||
    type === "gsap-elastic-bounce"
  );
}

/**
 * Renders GSAP-driven transitions onto a Canvas2D context deterministically for progress p (0..1).
 */
export function renderGSAPTransitionFrame(
  ctx: CanvasRenderingContext2D,
  type: TransitionType,
  p: number,
  W: number,
  H: number,
  gradA: any,
  gradB: any
): boolean {
  if (!isGSAPTransition(type)) return false;

  const cx = W / 2;
  const cy = H / 2;

  switch (type) {
    case "gsap-elastic-zoom": {
      // Background (Clip A)
      ctx.fillStyle = gradA;
      ctx.fillRect(0, 0, W, H);

      // GSAP Elastic Spring scale for Clip B
      const elasticProgress = easeElasticOut(p);
      const scaleB = Math.max(0, elasticProgress);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scaleB, scaleB);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = gradB;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // Energy flash aura on impact (GSAP power curve)
      const flashOpacity = Math.max(0, 1 - Math.abs(p - 0.4) * 3);
      if (flashOpacity > 0.05) {
        ctx.save();
        ctx.globalAlpha = flashOpacity * 0.6;
        const ringRad = p * Math.sqrt(W * W + H * H) * 0.6;
        const glow = ctx.createRadialGradient(cx, cy, Math.max(0, ringRad * 0.3), cx, cy, Math.max(1, ringRad));
        glow.addColorStop(0, "rgba(255,255,255,0.9)");
        glow.addColorStop(0.5, "rgba(59,130,246,0.5)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
      return true;
    }

    case "gsap-3d-flip": {
      // GSAP 3D card rotation curve around Y-axis
      const flipEase = easeBackInOut(p);
      const angle = flipEase * Math.PI; // 0 to 180 deg

      ctx.save();
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, W, H);

      const isFirstHalf = angle < Math.PI / 2;
      const cosVal = Math.max(0.01, Math.abs(Math.cos(angle)));

      // Perspective scale effect
      const perspectiveScale = 1 - Math.sin(Math.min(Math.PI, Math.max(0, angle))) * 0.15;

      ctx.translate(cx, cy);
      ctx.scale(cosVal * perspectiveScale, perspectiveScale);
      ctx.translate(-cx, -cy);

      if (isFirstHalf) {
        ctx.fillStyle = gradA;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(0,0,0,${Math.sin(angle) * 0.6})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = gradB;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255,255,255,${(1 - Math.sin(Math.min(Math.PI, angle))) * 0.2})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      // 3D shadow floor line
      ctx.save();
      ctx.globalAlpha = Math.sin(Math.min(Math.PI, Math.max(0, angle))) * 0.4;
      const shadowGrad = ctx.createRadialGradient(cx, H - 5, 2, cx, H - 5, W * 0.4);
      shadowGrad.addColorStop(0, "rgba(0,0,0,0.8)");
      shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(0, H - 20, W, 20);
      ctx.restore();
      return true;
    }

    case "gsap-stagger-wipe": {
      // Base layer Clip A
      ctx.fillStyle = gradA;
      ctx.fillRect(0, 0, W, H);

      // Staggered vertical curtain slices driven by GSAP Power4 easing
      const slices = 10;
      const sliceW = W / slices;
      const totalStaggerWindow = 0.4; // 40% time window for stagger offset

      for (let i = 0; i < slices; i++) {
        const staggerOffset = (i / (slices - 1)) * totalStaggerWindow;
        const normalizedP = Math.min(1, Math.max(0, (p - staggerOffset) / (1 - totalStaggerWindow)));
        const sliceEasedP = easePower4InOut(normalizedP);

        if (sliceEasedP > 0) {
          const sliceH = H * sliceEasedP;
          const x = i * sliceW;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, 0, sliceW + 0.5, sliceH);
          ctx.clip();
          ctx.fillStyle = gradB;
          ctx.fillRect(0, 0, W, H);

          // Glowing accent edge line on bottom of leading slice
          if (sliceEasedP < 0.99) {
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.fillRect(x, sliceH - 2, sliceW, 2);
          }
          ctx.restore();
        }
      }
      return true;
    }

    case "gsap-elastic-bounce": {
      // Clip A base
      ctx.fillStyle = gradA;
      ctx.fillRect(0, 0, W, H);

      // Clip B drops down with GSAP Bounce easing
      const bounceP = easeBounceOut(p);
      const yOffset = -H * (1 - bounceP);

      ctx.save();
      ctx.fillStyle = gradB;
      ctx.fillRect(0, yOffset, W, H);

      // Dynamic impact shadow on bottom edge during drop
      if (p < 0.95) {
        ctx.fillStyle = `rgba(0,0,0,${(1 - bounceP) * 0.4})`;
        ctx.fillRect(0, yOffset + H - 8, W, 8);
      }
      ctx.restore();
      return true;
    }

    default:
      return false;
  }
}
