"use client";

import { useCallback, useRef } from "react";

/**
 * Play a soft, iOS-inspired step tick via Web Audio.
 * Reusable across sliders, toggles, or any incremental control.
 * Respects `prefers-reduced-motion` and silences until first user interaction.
 */
export function useTick(enabled = true) {
  const ctxRef = useRef<AudioContext | null>(null);
  const lastRef = useRef(0);

  const ensureCtx = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return null;
      ctxRef.current = new Ctx();
    }
    return ctxRef.current;
  };

  return useCallback(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    // Leave a little air between ticks so a fast drag stays tactile, not buzzy.
    const now = performance.now();
    if (now - lastRef.current < 26) return;
    lastRef.current = now;

    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const t = ctx.currentTime;
    // A quick sine "tap" with a tiny bright transient: less harsh than a
    // square wave, but still distinct enough to feel like each detent.
    const body = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(1240, t);
    body.frequency.exponentialRampToValueAtTime(860, t + 0.022);
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.024, t + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    body.connect(bodyGain);
    bodyGain.connect(ctx.destination);

    const sparkle = ctx.createOscillator();
    const sparkleGain = ctx.createGain();
    sparkle.type = "sine";
    sparkle.frequency.setValueAtTime(2100, t);
    sparkle.frequency.exponentialRampToValueAtTime(1600, t + 0.009);
    sparkleGain.gain.setValueAtTime(0.0001, t);
    sparkleGain.gain.exponentialRampToValueAtTime(0.006, t + 0.001);
    sparkleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.011);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(ctx.destination);

    body.start(t);
    sparkle.start(t);
    body.stop(t + 0.03);
    sparkle.stop(t + 0.012);
  }, [enabled]);
}
