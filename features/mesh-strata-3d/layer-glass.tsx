"use client";

import { useMemo } from "react";
import * as THREE from "three";

/** A thin filled plane that sits at a layer's Y and extends the full plane
 * footprint — the "background" of the layer (not an extra floating layer).
 * Opacity 0 skips rendering entirely so this is purely opt-in. Rendered
 * BEFORE content (negative renderOrder) so wire mesh, box columns, cloud
 * particles, etc. always paint on top. */
export function LayerGlass({
  layerY,
  planeSize,
  opacity,
  blur,
  transmission,
  tint,
}: {
  layerY: number;
  planeSize: number;
  opacity: number;
  blur: number;
  transmission: number;
  tint: string;
}) {
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(planeSize, planeSize),
    [planeSize],
  );
  useMemo(() => () => geometry.dispose(), [geometry]);

  if (opacity <= 0) return null;
  return (
    <mesh
      position={[0, layerY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      renderOrder={-10}
    >
      <meshPhysicalMaterial
        color={tint}
        transparent
        opacity={opacity}
        roughness={blur}
        metalness={0}
        transmission={transmission}
        thickness={0.3}
        ior={1.2}
        attenuationDistance={2}
        attenuationColor={tint}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}
