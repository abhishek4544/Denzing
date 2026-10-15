"use client";

import type { StrataSettings } from "./defaults";

/** HTML overlay for the outcome labels (REORDER / HOLD PRICE / FLAG SUPPLIER
 *  / NOTIFY BUYER). The stems themselves are rendered in 3D inside the scene
 *  (see outcome-stems-3d.tsx) so they clip and depth-sort against the
 *  enclosure walls. These labels just sit at the right edge of the canvas;
 *  tune outcomeTopPct / outcomeSpacingPct / outcomeRightPct to align them
 *  visually with the 3D stem tips. */
export function OutcomesOverlay({ settings }: { settings: StrataSettings }) {
  if (!settings.outcomesEnabled) return null;
  const labels = settings.outcomeLabels ?? [];
  const spacing = settings.outcomeSpacingPct;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {labels.map((label, i) => (
        <div
          key={`outcome-${i}`}
          style={{
            position: "absolute",
            right: `${settings.outcomeRightPct}%`,
            top: `${settings.outcomeTopPct + i * spacing}%`,
            transform: "translateY(-50%)",
            fontFamily:
              '"Violet Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            fontWeight: 400,
            fontSize: `${settings.outcomeFontSize}px`,
            letterSpacing: "0.08em",
            lineHeight: 1,
            whiteSpace: "nowrap",
            color: settings.outcomeFg,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
