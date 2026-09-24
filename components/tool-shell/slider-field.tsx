"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FieldRow } from "./field-row";
import { useTick } from "@/lib/use-tick";

type SliderFieldProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Play a subtle tick on each step change. Default true. */
  tick?: boolean;
};

/**
 * Custom slider matching the Figma reference exactly:
 * 30px tall muted-fill pill (bg #f2f2f7), black fill from left, 6px radius,
 * numeric readout right-aligned inside the track (10px Geist Medium black).
 */
export function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  format,
  tick = true,
}: SliderFieldProps) {
  const playTick = useTick(tick);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const range = max - min;
  const pct = range === 0 ? 0 : ((value - min) / range) * 100;

  const commitFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * range;
      const snapped = Math.round(raw / step) * step;
      const next = Math.min(max, Math.max(min, snapped));
      if (next !== value) {
        playTick();
        onChange(next);
      }
    },
    [min, max, step, range, value, onChange, playTick],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => commitFromPointer(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, commitFromPointer]);

  return (
    <FieldRow label={label}>
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          commitFromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          const bigStep = step * 10;
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            const next = Math.max(min, value - step);
            if (next !== value) {
              playTick();
              onChange(next);
            }
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            const next = Math.min(max, value + step);
            if (next !== value) {
              playTick();
              onChange(next);
            }
          } else if (e.key === "PageDown") {
            e.preventDefault();
            onChange(Math.max(min, value - bigStep));
          } else if (e.key === "PageUp") {
            e.preventDefault();
            onChange(Math.min(max, value + bigStep));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(min);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(max);
          }
        }}
        className="relative h-[28px] w-full rounded-[7px] bg-muted overflow-hidden cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {/* Black fill (dynamic width) */}
        <div
          className="absolute inset-y-0 left-0 bg-foreground"
          style={{ width: `${pct}%` }}
        />
        {/* Dark ticks over the light (unfilled) track portion — full-width gradient,
            clipped to the right of the fill boundary so ticks stay pixel-aligned across the seam */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath: `inset(0 0 0 ${pct}%)`,
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(0,0,0,0.08) 0, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 6px)",
          }}
        />
        {/* Light ticks over the black-filled portion */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            clipPath: `inset(0 ${100 - pct}% 0 0)`,
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 6px)",
          }}
        />
        {/* Readout */}
        <span
          className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[10px] font-semibold leading-[1.1] tabular-nums text-white pointer-events-none"
          style={{ mixBlendMode: "difference" }}
        >
          {format ? format(value) : value}
        </span>
      </div>
    </FieldRow>
  );
}
