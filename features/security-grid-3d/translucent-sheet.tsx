"use client";

import { forwardRef, useMemo } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGrain;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453);
  }

  void main() {
    // Grain is attached to the sheet, so it stays still through camera
    // motion and is reproduced by the PNG/video renderer.
    float grain = hash(floor(vUv * 800.0)) - 0.5;
    float grainAA = 1.0 - smoothstep(0.7, 2.0,
      max(fwidth(vUv.x), fwidth(vUv.y)) * 800.0);
    vec2 cell = vUv * 150.0;
    float fleck = step(0.986, hash(floor(cell))) *
      (1.0 - smoothstep(0.04, 0.28, length(fract(cell) - 0.5)));
    vec3 color = uColor * (1.0 + grain * grainAA * uGrain * 0.4);
    color += vec3(fleck * uGrain * 0.16);
    gl_FragColor = vec4(color, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A true XZ plane: thin edges, visible from either side, with layered alpha. */
export const TranslucentSheet = forwardRef<THREE.Mesh, {
  size: number;
  color: string;
  opacity: number;
  grain: number;
  index: number;
}>(function TranslucentSheet({ size, color, opacity, grain, index }, ref) {
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: opacity },
    uGrain: { value: grain },
    uSeed: { value: index * 37.13 },
  }), [color, opacity, grain, index]);

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        forceSinglePass
        toneMapped={false}
      />
    </mesh>
  );
});
