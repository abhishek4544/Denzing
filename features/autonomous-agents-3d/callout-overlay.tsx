"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { StrataSettings } from "./defaults";
import { loadVioletFont } from "./layer-name-label";

export type CalloutId = "aiAnalytics" | "autonomousAgents" | "yourOwnAi";

type CalloutBridge = {
  setScale: (scale: number) => void;
  /** Projected anchor position in overlay-relative percentages (0..100). */
  setAnchor: (id: CalloutId, xPct: number, yPct: number) => void;
};

export type CalloutBridgeRef = { current: CalloutBridge | null };

export function createCalloutBridgeRef(): CalloutBridgeRef {
  return { current: null };
}

export const BASELINE_CAMERA_DISTANCE = 45;

/** Per-callout anchor spec: a layer Y plus a rule for picking which of the
 * four projected plane corners to use each frame. "left" always picks the
 * currently leftmost projected corner, so the endpoint sits on the visible
 * left edge of the layer regardless of rotation. */
export type AnchorSpec = {
  layerY: number;
  half: number;
  pick: "left" | "right" | "top";
};

export type StrataAnchorSpecs = Record<CalloutId, AnchorSpec>;

export function computeStrataAnchors(settings: StrataSettings): StrataAnchorSpecs {
  const { layerCount, layerGaps, planeSize } = settings;
  const gaps = layerGaps
    .slice(0, Math.max(0, layerCount - 1))
    .map((g) => g * 0.03);
  const ys: number[] = [0];
  for (let i = 1; i < layerCount; i += 1) ys.push(ys[i - 1] - gaps[i - 1]);
  const top = ys[0] ?? 0;
  const bottom = ys[layerCount - 1] ?? 0;
  const shift = -(top + bottom) / 2;
  const yPositions = ys.map((y) => y + shift);
  const topY = yPositions[0] ?? 0;
  const bottomY = yPositions[layerCount - 1] ?? 0;
  const half = planeSize / 2;
  return {
    aiAnalytics: { layerY: bottomY, half, pick: "left" },
    autonomousAgents: { layerY: topY, half, pick: "top" },
    yourOwnAi: { layerY: topY, half, pick: "right" },
  };
}

/** Lives inside <Canvas>. Projects each callout's world anchor to overlay
 * percentage coordinates every frame and publishes a camera-distance scale. */
export function CalloutAnchorTracker({
  bridgeRef,
  anchors,
}: {
  bridgeRef: CalloutBridgeRef;
  anchors: StrataAnchorSpecs;
}) {
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const lastScale = useRef(-1);
  useFrame(({ camera }) => {
    const b = bridgeRef.current;
    if (!b) return;
    const distance = camera.position.length();
    const scale = THREE.MathUtils.clamp(
      BASELINE_CAMERA_DISTANCE / Math.max(distance, 0.001),
      0.55,
      2.2,
    );
    if (Math.abs(scale - lastScale.current) > 0.002) {
      lastScale.current = scale;
      b.setScale(scale);
    }
    (Object.keys(anchors) as CalloutId[]).forEach((id) => {
      const spec = anchors[id];
      const h = spec.half;
      // Project all four plane corners of the target layer and keep the one
      // that currently sits furthest in the desired screen direction. This
      // is the same technique LayerNameLabel uses — it keeps the endpoint
      // on the currently visible edge rather than following a specific
      // local-space corner that may rotate to the far side.
      let bestNdcX = spec.pick === "left" ? Infinity : -Infinity;
      let bestNdcY = -Infinity; // for "top" (smallest screen y → largest NDC y)
      let bx = 0, by = 0;
      for (const cx of [-h, h]) {
        for (const cz of [-h, h]) {
          scratch.set(cx, spec.layerY, cz).project(camera);
          if (spec.pick === "left") {
            if (scratch.x < bestNdcX) {
              bestNdcX = scratch.x;
              bx = scratch.x;
              by = scratch.y;
            }
          } else if (spec.pick === "right") {
            if (scratch.x > bestNdcX) {
              bestNdcX = scratch.x;
              bx = scratch.x;
              by = scratch.y;
            }
          } else {
            if (scratch.y > bestNdcY) {
              bestNdcY = scratch.y;
              bx = scratch.x;
              by = scratch.y;
            }
          }
        }
      }
      const x = (bx * 0.5 + 0.5) * 100;
      const y = (-by * 0.5 + 0.5) * 100;
      b.setAnchor(id, x, y);
    });
  });
  return null;
}

export type BadgeDef = {
  id: CalloutId;
  label: string;
  background: string;
  textColor: string;
  iconBackground: string;
  iconDotColor: string;
  bendDirection: "right" | "left" | "none";
};

export const BADGES: BadgeDef[] = [
  {
    id: "aiAnalytics",
    label: "AI ANALYTICS",
    background: "#ffffff",
    textColor: "#6a1224",
    iconBackground: "#ea99f5",
    iconDotColor: "#6a1224",
    bendDirection: "right",
  },
  {
    id: "autonomousAgents",
    label: "AUTONOMOUS AGENTS",
    background: "#e0f9ff",
    textColor: "#0b313b",
    iconBackground: "#68e1ff",
    iconDotColor: "#0b313b",
    bendDirection: "none",
  },
  {
    id: "yourOwnAi",
    label: "YOUR OWN AI",
    background: "#e3ffea",
    textColor: "#033f12",
    iconBackground: "#84d698",
    iconDotColor: "#033f12",
    bendDirection: "left",
  },
];

export function badgePosition(settings: StrataSettings, id: CalloutId): { left: number; top: number } {
  switch (id) {
    case "aiAnalytics":
      return { left: settings.calloutAiLeft, top: settings.calloutAiTop };
    case "autonomousAgents":
      return { left: settings.calloutAutonomousLeft, top: settings.calloutAutonomousTop };
    case "yourOwnAi":
      return { left: settings.calloutYourOwnAiLeft, top: settings.calloutYourOwnAiTop };
  }
}

export function readLineGeometry(settings: StrataSettings, id: CalloutId) {
  switch (id) {
    case "aiAnalytics":
      return {
        trunkX: settings.calloutAiTrunkX,
        down: settings.calloutAiLineDown,
        bend: settings.calloutAiBendRight,
      };
    case "autonomousAgents":
      return { trunkX: 0, down: settings.calloutAutonomousLineDown, bend: 0 };
    case "yourOwnAi":
      return {
        trunkX: settings.calloutYourOwnAiTrunkX,
        down: settings.calloutYourOwnAiLineDown,
        bend: settings.calloutYourOwnAiBendLeft,
      };
  }
}

/** HTML overlay sitting on top of the canvas. Badges match Figma. Connectors
 * are axis-aligned (vertical + optional horizontal bend); the vertical drop
 * stays fixed, while the bend's horizontal reach is updated each frame from
 * the projected 3D anchor so the endpoint tracks the rotating layer edge. */
export function CalloutOverlay({
  bridgeRef,
  settings,
}: {
  bridgeRef: CalloutBridgeRef;
  settings: StrataSettings;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Preload Violet Sans so the HTML badges don't flash a fallback font.
  useEffect(() => { void loadVioletFont().catch(() => undefined); }, []);
  const pathRefs = useRef<Record<CalloutId, SVGPathElement | null>>({
    aiAnalytics: null,
    autonomousAgents: null,
    yourOwnAi: null,
  });
  // Cached anchor % values updated by the tracker, read by the imperative
  // path updater so we don't re-render React on every frame.
  const anchorPct = useRef<Record<CalloutId, { x: number; y: number }>>({
    aiAnalytics: { x: 20, y: 85 },
    autonomousAgents: { x: 50, y: 40 },
    yourOwnAi: { x: 80, y: 40 },
  });
  const scaleRef = useRef(1);

  const setPathRef = useCallback(
    (id: CalloutId) => (el: SVGPathElement | null) => {
      pathRefs.current[id] = el;
    },
    [],
  );

  const rebuildPath = useCallback(
    (id: CalloutId) => {
      const el = pathRefs.current[id];
      if (!el) return;
      const def = BADGES.find((b) => b.id === id);
      if (!def) return;
      const geom = readLineGeometry(settings, id);
      const s = scaleRef.current;
      const pos = badgePosition(settings, id);
      // Badge icon-centre at baseline zoom (icon ≈ 12px of 896 ≈ 1.3%).
      const sx = pos.left + 1.3 * s;
      const sy = pos.top + 3.4 * s;
      const anchor = anchorPct.current[id];
      let d: string;
      if (def.bendDirection === "none") {
        // Autonomous Agents — straight drop from the badge. Length is pure
        // user-controlled so negative values shorten the line above the
        // badge; the projection is used only to compute scale.
        void anchor;
        const dropY = sy + geom.down * s;
        d = `M ${sx} ${sy} L ${sx} ${dropY}`;
      } else {
        // AI Analytics / Your Own AI — hook shape:
        //   badge → horizontal step to trunkX → vertical to dropY →
        //   horizontal to the projected layer edge (± user padding).
        const dirSign = def.bendDirection === "right" ? 1 : -1;
        const trunkX = geom.trunkX;
        const dropY = sy + geom.down * s;
        const padding = geom.bend * s;
        let bendEndX = anchor.x + dirSign * padding;
        // Never let the final segment cross back past the trunk.
        bendEndX = dirSign > 0 ? Math.max(trunkX, bendEndX) : Math.min(trunkX, bendEndX);
        d = `M ${sx} ${sy} L ${trunkX} ${sy} L ${trunkX} ${dropY} L ${bendEndX} ${dropY}`;
      }
      el.setAttribute("d", d);
      el.setAttribute("stroke-width", (1.2 * s).toFixed(2));
      el.setAttribute(
        "stroke-dasharray",
        `${(4 * s).toFixed(1)} ${(4 * s).toFixed(1)}`,
      );
    },
    [settings],
  );

  useEffect(() => {
    bridgeRef.current = {
      setScale(next) {
        scaleRef.current = next;
        const el = containerRef.current;
        if (el) el.style.setProperty("--callout-scale", String(next));
        if (Math.abs(next - scale) > 0.002) setScale(next);
        (Object.keys(pathRefs.current) as CalloutId[]).forEach(rebuildPath);
      },
      setAnchor(id, xPct, yPct) {
        anchorPct.current[id] = { x: xPct, y: yPct };
        rebuildPath(id);
      },
    };
    return () => {
      bridgeRef.current = null;
    };
  }, [bridgeRef, rebuildPath, scale]);

  // Settings may change the drop/bend slider — rebuild paths so the preview
  // reacts immediately even when the camera is idle.
  useEffect(() => {
    (Object.keys(pathRefs.current) as CalloutId[]).forEach(rebuildPath);
  }, [rebuildPath]);

  const inlineStyle = useMemo<React.CSSProperties>(
    () => ({ ["--callout-scale" as string]: 1 }) as React.CSSProperties,
    [],
  );

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={inlineStyle}
      aria-hidden
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        {BADGES.map((b) => (
          <path
            key={b.id}
            ref={setPathRef(b.id)}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={1.2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {BADGES.map((b) => {
        const pos = badgePosition(settings, b.id);
        return (
        <div
          key={b.id}
          style={{
            position: "absolute",
            left: `${pos.left}%`,
            top: `${pos.top}%`,
            transformOrigin: "top left",
            transform: "scale(var(--callout-scale, 1))",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              background: b.background,
              color: b.textColor,
              fontFamily:
                '"Violet Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              fontWeight: 400,
              fontSize: "13.714px",
              letterSpacing: "0.02em",
              lineHeight: 0.8,
              whiteSpace: "nowrap",
              boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            }}
          >
            <span
              style={{
                position: "relative",
                width: 24,
                height: 24,
                background: b.iconBackground,
                flex: "0 0 auto",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: 10.3,
                  height: 10.3,
                  background: b.iconDotColor,
                  borderRadius: "50%",
                  transform: "translate(-50%, -50%)",
                }}
              />
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "5.143px 8.571px",
              }}
            >
              {b.label}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}
