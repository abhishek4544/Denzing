"use client";

import { useMemo } from "react";
import type { StrataSettings } from "./defaults";
import { GridWireBox } from "./grid-wire-box";

/** Four thin vertical wireframe slabs standing upright in the middle of the
 *  enclosure — the "decide" structure the outcome stems emerge from. Each
 *  slab is a GridWireBox: full enclosure height, narrow Z depth, very thin X
 *  thickness, spaced tightly along X in a central zone. */
export function VerticalSlabs({ settings }: { settings: StrataSettings }) {
  const slabs = useMemo(() => {
    if (!settings.verticalSlabsEnabled) return [];
    const n = Math.max(1, Math.round(settings.verticalSlabCount));
    const W = settings.enclosureWidth;
    const H = settings.enclosureHeight;
    const D = settings.enclosureDepth;
    const halfW = W / 2;
    const centerX = -halfW + (settings.verticalSlabCenterXPct / 100) * W;
    const zoneWidth = Math.max(0.01, (settings.verticalSlabZoneWidthPct / 100) * W);
    const slabThickness = Math.max(0.02, settings.verticalSlabThickness);
    const slabHeight = Math.max(0.1, (settings.verticalSlabHeightPct / 100) * H);
    const slabDepth = Math.max(0.1, (settings.verticalSlabDepthPct / 100) * D);
    const list: { key: number; x: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = centerX - zoneWidth / 2 + t * zoneWidth;
      list.push({ key: i, x });
    }
    return list.map((s) => ({
      key: s.key,
      position: [s.x, 0, 0] as [number, number, number],
      width: slabThickness,
      height: slabHeight,
      depth: slabDepth,
    }));
  }, [
    settings.verticalSlabsEnabled,
    settings.verticalSlabCount,
    settings.verticalSlabCenterXPct,
    settings.verticalSlabZoneWidthPct,
    settings.verticalSlabThickness,
    settings.verticalSlabHeightPct,
    settings.verticalSlabDepthPct,
    settings.enclosureWidth,
    settings.enclosureHeight,
    settings.enclosureDepth,
  ]);

  if (slabs.length === 0) return null;

  return (
    <group renderOrder={3}>
      {slabs.map((s) => (
        <GridWireBox
          key={`vert-slab-${s.key}`}
          position={s.position}
          width={s.width}
          height={s.height}
          depth={s.depth}
          resolution={settings.verticalSlabGridResolution}
          color={settings.verticalSlabColor}
          opacity={settings.verticalSlabOpacity}
        />
      ))}
    </group>
  );
}
