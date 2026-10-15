"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { StrataSettings } from "./defaults";

/** Four thin connector lines running from the vertical slabs in the center to
 *  just past the right wall of the enclosure — one per outcome label. These
 *  are simple cylinders in world space; their Y positions mirror the HTML
 *  label stack (outcomeTopPct + i * outcomeSpacingPct). */
export function OutcomeConnectors({ settings }: { settings: StrataSettings }) {
  const labels = settings.outcomeLabels ?? [];
  const count = labels.length;

  const connectors = useMemo(() => {
    if (!settings.outcomeConnectorsEnabled || count === 0) return [];
    const W = settings.enclosureWidth;
    const H = settings.enclosureHeight;
    const halfW = W / 2;
    const halfH = H / 2;
    // Y positions mirror the HTML labels so the 3D line visually leads to its
    // caption. outcomeTopPct=0 → top, 100 → bottom, clamped to inner 90%.
    const topFrac = Math.max(0, Math.min(1, settings.outcomeTopPct / 100));
    const topY = halfH * 0.9 - topFrac * (H * 0.9);
    const dy = (settings.outcomeSpacingPct / 100) * H;
    // Start X: right edge of the slab zone (slab center + half zone width).
    const slabCenterX = -halfW + (settings.verticalSlabCenterXPct / 100) * W;
    const slabHalfZone = (settings.verticalSlabZoneWidthPct / 100) * W * 0.5;
    const xStart = slabCenterX + slabHalfZone + settings.verticalSlabThickness;
    const overhang = Math.max(0.5, W * 0.08);
    const xEnd = halfW + overhang;
    const length = Math.max(0.1, xEnd - xStart);
    const midX = (xStart + xEnd) / 2;
    const radius = Math.max(0.01, settings.outcomeConnectorThickness);
    return Array.from({ length: count }).map((_, i) => ({
      key: i,
      position: [midX, topY - i * dy, 0] as [number, number, number],
      length,
      radius,
    }));
  }, [
    settings.outcomeConnectorsEnabled,
    settings.outcomeTopPct,
    settings.outcomeSpacingPct,
    settings.outcomeConnectorThickness,
    settings.verticalSlabCenterXPct,
    settings.verticalSlabZoneWidthPct,
    settings.verticalSlabThickness,
    settings.enclosureWidth,
    settings.enclosureHeight,
    count,
  ]);

  if (connectors.length === 0) return null;

  return (
    <group renderOrder={3}>
      {connectors.map((c) => (
        <mesh
          key={`out-conn-${c.key}`}
          position={c.position}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[c.radius, c.radius, c.length, 10, 1]} />
          <meshBasicMaterial
            color={settings.outcomeConnectorColor}
            transparent
            opacity={settings.outcomeConnectorOpacity / 100}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
