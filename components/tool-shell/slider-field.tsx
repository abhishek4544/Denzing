"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
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

function snapSliderValue(raw: number, min: number, max: number, step: number) {
  const clamped = Math.min(max, Math.max(min, raw));
  if (clamped === min || clamped === max) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toPrecision(12));
}

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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const parsed = draft.trim() === "" ? NaN : Number(draft);
  const valid = Number.isFinite(parsed);
  const presets = [...new Set([0, 0.25, 0.5, 0.75, 1].map((fraction) =>
    snapSliderValue(min + (max - min) * fraction, min, max, step)))];
  const applyValue = (raw: number) => {
    const next = snapSliderValue(raw, min, max, step);
    if (next !== value) { playTick(); onChange(next); }
    setOpen(false);
  };
  const range = max - min;
  const pct = range === 0 ? 0 : ((value - min) / range) * 100;

  const commitFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const raw = min + ratio * range;
      const next = snapSliderValue(raw, min, max, step);
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
      <Popover.Root open={open} onOpenChange={(next) => {
        if (next) setDraft(String(value));
        setOpen(next);
      }}>
      <div className="relative">
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
      </div>
      <Popover.Trigger
        aria-label={`Edit ${label} value`}
        className="absolute right-0 top-0 h-[28px] min-w-[28px] px-[10px] text-[10px] font-semibold leading-[1.1] tabular-nums text-white cursor-pointer rounded-[7px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        style={{ mixBlendMode: "difference" }}
      >
        {format ? format(value) : value}
      </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[100]">
          <Popover.Popup className="w-[210px] rounded-lg border border-border bg-background p-3 text-foreground shadow-lg outline-none">
            <Popover.Title className="mb-2 text-xs font-medium">{label}</Popover.Title>
            <form onSubmit={(event) => { event.preventDefault(); if (valid) applyValue(parsed); }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${label} exact value`}
                  aria-invalid={!valid}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-xs tabular-nums outline-none focus:border-ring"
                />
                <button type="submit" disabled={!valid} className="rounded-md bg-foreground px-3 text-xs text-background disabled:opacity-40">Apply</button>
              </div>
              <p className="my-2 text-[10px] text-muted-foreground">{min}–{max} · Step {step}</p>
            </form>
            <div className="flex flex-wrap gap-1">
              {presets.map((preset) => (
                <button key={preset} type="button" onClick={() => applyValue(preset)}
                  aria-label={`Set ${label} to ${preset}`}
                  className="min-w-8 rounded-md bg-muted px-2 py-1.5 text-[10px] tabular-nums hover:bg-accent focus-visible:outline focus-visible:outline-ring">
                  {format ? format(preset) : preset}
                </button>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
      </Popover.Root>
    </FieldRow>
  );
}
