"use client";

import { useMemo } from "react";
import * as THREE from "three";

type Props = {
  width: number;
  height: number;
  depth: number;
  position?: [number, number, number];
  /** Grid cells along the longest axis. Shorter axes get proportionally fewer
   *  cells so cell size stays roughly uniform across faces. */
  resolution: number;
  color: string;
  opacity: number;
};

/** A box drawn as a wireframe GRID (not just the triangle wireframe of
 *  BoxGeometry): each of the six faces is subdivided into a grid of line
 *  segments, matching the look of the enclosure walls. */
export function GridWireBox({ width, height, depth, position = [0, 0, 0], resolution, color, opacity }: Props) {
  const geometry = useMemo(() => {
    const hw = width / 2;
    const hh = height / 2;
    const hd = depth / 2;
    const positions: number[] = [];
    const line = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      positions.push(ax, ay, az, bx, by, bz);
    };
    // Scale subdivisions per axis so cells stay roughly square across faces.
    const maxLen = Math.max(width, height, depth);
    const base = Math.max(2, Math.round(resolution));
    const nx = Math.max(1, Math.round(base * (width / maxLen)));
    const ny = Math.max(1, Math.round(base * (height / maxLen)));
    const nz = Math.max(1, Math.round(base * (depth / maxLen)));

    // ±X faces (width is the shortest axis for a thin slab).
    for (let j = 0; j <= ny; j += 1) {
      const y = -hh + (j / ny) * height;
      line(-hw, y, -hd, -hw, y, hd);
      line(hw, y, -hd, hw, y, hd);
    }
    for (let k = 0; k <= nz; k += 1) {
      const z = -hd + (k / nz) * depth;
      line(-hw, -hh, z, -hw, hh, z);
      line(hw, -hh, z, hw, hh, z);
    }
    // ±Y faces.
    for (let i = 0; i <= nx; i += 1) {
      const x = -hw + (i / nx) * width;
      line(x, -hh, -hd, x, -hh, hd);
      line(x, hh, -hd, x, hh, hd);
    }
    for (let k = 0; k <= nz; k += 1) {
      const z = -hd + (k / nz) * depth;
      line(-hw, -hh, z, hw, -hh, z);
      line(-hw, hh, z, hw, hh, z);
    }
    // ±Z faces.
    for (let i = 0; i <= nx; i += 1) {
      const x = -hw + (i / nx) * width;
      line(x, -hh, -hd, x, hh, -hd);
      line(x, -hh, hd, x, hh, hd);
    }
    for (let j = 0; j <= ny; j += 1) {
      const y = -hh + (j / ny) * height;
      line(-hw, y, -hd, hw, y, -hd);
      line(-hw, y, hd, hw, y, hd);
    }

    const buf = new THREE.BufferGeometry();
    buf.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return buf;
  }, [width, height, depth, resolution]);

  return (
    <lineSegments geometry={geometry} position={position} renderOrder={3}>
      <lineBasicMaterial color={color} transparent opacity={Math.max(0, Math.min(1, opacity / 100))} depthWrite={false} />
    </lineSegments>
  );
}
