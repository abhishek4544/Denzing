"use client";
/* eslint-disable react-hooks/immutability -- WebGL uniforms mutate .value in useFrame by design */

import React, { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { SecurityGridSettings } from "./defaults";

function seededPrng(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

/* Radial edge-fade: alpha=1 at center, falls to 0 by the outer radius.
 * `edgeFadePct` sets the width of the fade band (0=hard edge, 100=center-to-edge).
 * `intensityPct` shapes the curve: 100=linear smoothstep, 200=sharper (more
 * transparent earlier), 50=softer (stays opaque longer). */
function edgeAlpha(
  x: number,
  z: number,
  half: number,
  edgeFadePct: number,
  intensityPct = 100,
) {
  if (edgeFadePct <= 0 || intensityPct <= 0) return 1;
  const dist = Math.max(Math.abs(x), Math.abs(z));
  const band = (edgeFadePct / 100) * half;
  const inner = Math.max(0, half - band);
  if (dist <= inner) return 1;
  if (dist >= half) return 0;
  const t = (half - dist) / Math.max(1e-6, half - inner);
  const smooth = t * t * (3 - 2 * t);
  const k = intensityPct / 100;
  return Math.pow(smooth, k);
}

/* ------------------------------------------------------------ *
 * Base plane — solid fill under the grid with radial edge fade  *
 * ------------------------------------------------------------ */

const planeVertexShader = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  void main() {
    vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const planeFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float a = uOpacity * vA;
    if (a < 0.001) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function BasePlane({ size, color, opacity, edgeFade, edgeIntensity }: {
  size: number;
  color: string;
  opacity: number;
  edgeFade: number;
  edgeIntensity: number;
}) {
  const geom = useMemo(() => {
    const segs = 56;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const alphas = new Float32Array(pos.count);
    const h = size / 2;
    for (let i = 0; i < pos.count; i += 1) {
      alphas[i] = edgeAlpha(pos.getX(i), pos.getZ(i), h, edgeFade, edgeIntensity);
    }
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    return g;
  }, [size, edgeFade, edgeIntensity]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: planeVertexShader,
        fragmentShader: planeFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(0x000000) },
          uOpacity: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(color);
    material.uniforms.uOpacity.value = opacity / 100;
  }, [material, color, opacity]);

  if (opacity <= 0) return null;
  return (
    <mesh geometry={geom} position={[0, -0.001, 0]} renderOrder={-1}>
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/* ------------------------------------------------------------ *
 * Floor grid — per-vertex alpha for radial edge fade            *
 * ------------------------------------------------------------ */

function FloorGrid({
  size,
  cells,
  color,
  opacityNear,
  opacityFar,
  edgeFade,
  edgeIntensity,
}: {
  size: number;
  cells: number;
  color: string;
  opacityNear: number;
  opacityFar: number;
  edgeFade: number;
  edgeIntensity: number;
}) {
  const geom = useMemo(() => {
    const n = Math.max(1, Math.round(cells));
    const h = size / 2;
    const step = size / n;
    const positions: number[] = [];
    const colors: number[] = [];
    const base = new THREE.Color(color);
    const splitZ = -h + size * 0.55;

    const pushLine = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
    ) => {
      positions.push(ax, ay, az, bx, by, bz);
      const mz = (az + bz) / 2;
      const perspAlpha = mz > splitZ ? opacityNear / 100 : opacityFar / 100;
      const alphaA = perspAlpha * edgeAlpha(ax, az, h, edgeFade, edgeIntensity);
      const alphaB = perspAlpha * edgeAlpha(bx, bz, h, edgeFade, edgeIntensity);
      // RGBA so three.js uses vertex alpha, not darkening.
      colors.push(
        base.r, base.g, base.b, alphaA,
        base.r, base.g, base.b, alphaB,
      );
    };

    for (let i = 0; i <= n; i += 1) {
      const t = -h + i * step;
      pushLine(-h, 0, t, h, 0, t);
      pushLine(t, 0, -h, t, 0, h);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    return g;
  }, [size, cells, color, opacityNear, opacityFar, edgeFade, edgeIntensity]);

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={1}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/* ------------------------------------------------------------ *
 * Active cell picking — within a radial band around center      *
 * ------------------------------------------------------------ */

type CellIndex = { i: number; j: number; cx: number; cz: number };

function pickActiveCells(
  cells: number,
  size: number,
  count: number,
  seed: number,
  radiusPct: number,
  centerBiasPct: number,
): CellIndex[] {
  const rand = seededPrng(Math.floor(seed * 1000) + 7);
  const n = Math.max(1, Math.round(cells));
  const h = size / 2;
  const step = size / n;
  const target = Math.max(0, Math.round(count));
  const maxR = (radiusPct / 100) * h;
  const minSpacingCells = 2;

  const picks: CellIndex[] = [];
  let attempts = 0;
  const bias = Math.max(0, Math.min(1, centerBiasPct / 100));
  while (picks.length < target && attempts < target * 120) {
    attempts += 1;
    // Pick inside a disk of radius maxR, biased toward center.
    const theta = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 1 + bias * 2) * maxR; // bias toward 0 as bias grows
    const sx = Math.cos(theta) * r;
    const sz = Math.sin(theta) * r;
    const i = Math.max(0, Math.min(n - 1, Math.floor((sx + h) / step)));
    const j = Math.max(0, Math.min(n - 1, Math.floor((sz + h) / step)));
    const cx = -h + (i + 0.5) * step;
    const cz = -h + (j + 0.5) * step;
    if (Math.hypot(cx, cz) > maxR) continue;
    const tooClose = picks.some((p) => {
      const di = p.i - i;
      const dj = p.j - j;
      return di * di + dj * dj < minSpacingCells * minSpacingCells;
    });
    if (tooClose) continue;
    picks.push({ i, j, cx, cz });
  }
  return picks;
}

/* ------------------------------------------------------------ *
 * Zero rings — one instance per inactive cell, with edge fade   *
 * ------------------------------------------------------------ */

const ringVertexShader = /* glsl */ `
  attribute float aAlpha;
  varying float vA;
  void main() {
    vA = aAlpha;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const ringFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vA;
  void main() {
    float a = uOpacity * vA;
    if (a < 0.001) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function ZeroRings({
  size,
  cells,
  active,
  color,
  opacity,
  ringSize,
  ringThickness,
  edgeFade,
  edgeIntensity,
}: {
  size: number;
  cells: number;
  active: CellIndex[];
  color: string;
  opacity: number;
  ringSize: number;
  ringThickness: number;
  edgeFade: number;
  edgeIntensity: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geom = useMemo(() => {
    const n = Math.max(1, Math.round(cells));
    const step = size / n;
    const outer = (step * 0.5) * (ringSize / 100);
    const inner = outer * (1 - ringThickness / 100);
    const g = new THREE.RingGeometry(Math.max(0.0001, inner), outer, 24);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size, cells, ringSize, ringThickness]);

  const { count, matrices, alphas } = useMemo(() => {
    const n = Math.max(1, Math.round(cells));
    const h = size / 2;
    const step = size / n;
    const activeSet = new Set(active.map((a) => a.i * n + a.j));
    const total = n * n - activeSet.size;
    const mats = new Float32Array(total * 16);
    const alphaArr = new Float32Array(total);
    const dummy = new THREE.Object3D();
    let w = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (activeSet.has(i * n + j)) continue;
        const x = -h + (i + 0.5) * step;
        const z = -h + (j + 0.5) * step;
        alphaArr[w] = edgeAlpha(x, z, h, edgeFade, edgeIntensity);
        dummy.position.set(x, 0.0015, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        dummy.matrix.toArray(mats, w * 16);
        w += 1;
      }
    }
    return { count: total, matrices: mats, alphas: alphaArr };
  }, [size, cells, active, edgeFade, edgeIntensity]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(0xffffff) },
          uOpacity: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(color);
    material.uniforms.uOpacity.value = opacity / 100;
  }, [material, color, opacity]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k += 1) {
      m.fromArray(matrices, k * 16);
      mesh.setMatrixAt(k, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    const geomInstance = mesh.geometry as THREE.InstancedBufferGeometry;
    geomInstance.setAttribute(
      "aAlpha",
      new THREE.InstancedBufferAttribute(alphas, 1),
    );
  }, [count, matrices, alphas]);

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geom, material, count]}
      frustumCulled={false}
    />
  );
}

/* ------------------------------------------------------------ *
 * Active "1" tiles                                              *
 * ------------------------------------------------------------ */

function ActiveTiles({
  active,
  cellSize,
  tileColor,
  tileEmission,
  symbolColor,
  tileScale,
  edgeFade,
  edgeIntensity,
  floorHalf,
  anim,
  seed,
}: {
  active: CellIndex[];
  cellSize: number;
  tileColor: string;
  tileEmission: number;
  symbolColor: string;
  tileScale: number;
  edgeFade: number;
  edgeIntensity: number;
  floorHalf: number;
  anim: {
    enabled: boolean;
    speed: number;
    intensity: number;
    dynamic: number;
    mode: "pulse" | "wave" | "flicker";
  };
  seed: number;
}) {
  const w = cellSize * (tileScale / 100);
  const groupRefs = useRef<Array<THREE.Group | null>>([]);
  const matRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([]);

  // Pre-compute per-tile phase + speed multiplier so the animation feels
  // organic. The seed drives the shuffle so you get a different pattern
  // without touching activeSeed.
  const perTile = useMemo(() => {
    const rand = seededPrng(Math.floor(seed * 1000) + 1301);
    return active.map((_, i) => {
      void i;
      const phase = rand() * Math.PI * 2;
      const speedJitter = rand() * 2 - 1;
      return { phase, speedJitter };
    });
  }, [active, seed]);

  useFrame(({ clock }) => {
    if (!anim.enabled) return;
    const t = clock.getElapsedTime();
    const baseFreq = (anim.speed / 100) * 1.2; // cycles/sec at speed=100
    const intensity = anim.intensity / 100;
    const dynamic = anim.dynamic / 100;
    for (let i = 0; i < active.length; i += 1) {
      const g = groupRefs.current[i];
      const mat = matRefs.current[i];
      if (!g || !mat) continue;
      const pt = perTile[i] ?? { phase: 0, speedJitter: 0 };
      const perTileFreq = baseFreq * (1 + pt.speedJitter * dynamic * 0.6);
      const theta = t * perTileFreq * 2 * Math.PI + pt.phase;

      let v: number;
      if (anim.mode === "wave") {
        // Travelling wave in from the center → outward
        const r = Math.hypot(active[i].cx, active[i].cz);
        v = Math.sin(theta - r * 0.6) * 0.5 + 0.5;
      } else if (anim.mode === "flicker") {
        // Soft noise-threshold flicker
        const n = Math.sin(theta * 2.3) * Math.cos(theta * 1.7);
        v = n > 0.1 ? 1 : 0.15;
      } else {
        // pulse — smooth sin
        v = Math.sin(theta) * 0.5 + 0.5;
      }

      // Scale pulse: 1 → 1 + intensity
      const s = 1 + v * intensity;
      g.scale.set(s, 1, s);
      // Brightness pulse: color multiplied by (0.4 + 0.6*v + emission)
      const b = (0.4 + v * 0.6) * (1 + (tileEmission / 100) * 0.6);
      const base = new THREE.Color(tileColor);
      mat.color.setRGB(base.r * b, base.g * b, base.b * b);
    }
  });

  return (
    <group>
      {active.map((a, idx) => {
        const ea = edgeAlpha(a.cx, a.cz, floorHalf, edgeFade, edgeIntensity);
        const c = new THREE.Color(tileColor).multiplyScalar(
          1 + (tileEmission / 100) * 0.6,
        );
        return (
          <group
            key={`tile-${idx}`}
            ref={(g) => {
              groupRefs.current[idx] = g;
            }}
            position={[a.cx, 0.004, a.cz]}
          >
            <mesh rotation-x={-Math.PI / 2}>
              <planeGeometry args={[w, w]} />
              <meshBasicMaterial
                ref={(m) => {
                  matRefs.current[idx] = m;
                }}
                color={c}
                transparent
                opacity={Math.max(0.001, ea)}
                toneMapped={false}
              />
            </mesh>
            <Text
              position={[0, 0.006, 0]}
              rotation-x={-Math.PI / 2}
              fontSize={w * 0.62}
              color={symbolColor}
              fillOpacity={Math.max(0.001, ea)}
              anchorX="center"
              anchorY="middle"
            >
              1
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------ *
 * Vertical stems from selected active cells + sampling nodes    *
 * ------------------------------------------------------------ */

type Stem = {
  ox: number; oy: number; oz: number;
  tx: number; ty: number; tz: number;
  nodes: number[];
};

function snapToCubeNode(
  x: number, z: number,
  cubeSize: number, subdivisions: number,
  jitterPct: number, rand: () => number,
  cubeCenterX = 0, cubeCenterZ = 0,
) {
  const n = Math.max(1, Math.round(subdivisions));
  const half = cubeSize / 2;
  const step = cubeSize / n;
  const relX = x - cubeCenterX;
  const relZ = z - cubeCenterZ;
  const nx = Math.round((relX + half) / step);
  const nz = Math.round((relZ + half) / step);
  const cx = -half + Math.max(0, Math.min(n, nx)) * step;
  const cz = -half + Math.max(0, Math.min(n, nz)) * step;
  const j = (jitterPct / 100) * step;
  return {
    x: cubeCenterX + cx + (rand() - 0.5) * j,
    z: cubeCenterZ + cz + (rand() - 0.5) * j,
  };
}

function buildStems(
  active: CellIndex[],
  percentage: number,
  heightMin: number,
  heightMax: number,
  maxNodesPerStem: number,
  seed: number,
  linkToCube: boolean,
  linkJitter: number,
  cubeEnabled: boolean,
  cubeBottomY: number,
  cubeSize: number,
  subdivisions: number,
  enterCubePct: number,
  cubeX: number,
  cubeZ: number,
): Stem[] {
  const rand = seededPrng(Math.floor(seed * 1000) + 211);
  const out: Stem[] = [];
  const takeFrac = Math.max(0, Math.min(1, percentage / 100));
  for (let i = 0; i < active.length; i += 1) {
    if (rand() > takeFrac) continue;
    const a = active[i];
    const nodeCount = Math.floor(rand() * (maxNodesPerStem + 1));
    const nodes: number[] = [];
    for (let k = 0; k < nodeCount; k += 1) nodes.push(0.1 + rand() * 0.85);
    if (linkToCube && cubeEnabled) {
      const snap = snapToCubeNode(a.cx, a.cz, cubeSize, subdivisions, linkJitter, rand, cubeX, cubeZ);
      const enterOffset = (enterCubePct / 100) * cubeSize * 0.5;
      out.push({
        ox: a.cx, oy: 0, oz: a.cz,
        tx: snap.x, ty: cubeBottomY + enterOffset, tz: snap.z,
        nodes,
      });
    } else {
      const t = rand();
      const height = (heightMin + (heightMax - heightMin) * (t * t)) * 0.1;
      out.push({
        ox: a.cx, oy: 0, oz: a.cz,
        tx: a.cx, ty: height, tz: a.cz,
        nodes,
      });
    }
  }
  return out;
}

function Stems({ stems, color, opacity }: {
  stems: Stem[];
  color: string;
  opacity: number;
}) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    for (const s of stems) {
      pts.push(s.ox, s.oy, s.oz, s.tx, s.ty, s.tz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [stems]);
  if (stems.length === 0) return null;
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity / 100}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function StemNodes({ stems, color, size }: {
  stems: Stem[];
  color: string;
  size: number;
}) {
  const positions = useMemo(() => {
    const out: number[] = [];
    for (const s of stems) {
      for (const t of s.nodes) {
        out.push(
          s.ox + (s.tx - s.ox) * t,
          s.oy + (s.ty - s.oy) * t,
          s.oz + (s.tz - s.oz) * t,
        );
      }
    }
    return new Float32Array(out);
  }, [stems]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  if (positions.length === 0) return null;
  return (
    <points geometry={geom}>
      <pointsMaterial
        color={color}
        size={size / 1000}
        sizeAttenuation
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------ *
 * Volumetric projection rays                                    *
 * ------------------------------------------------------------ */

function ProjectionRays({
  size,
  count,
  color,
  opacityMin,
  opacityMax,
  heightMin,
  heightMax,
  angleJitter,
  seed,
  linkToCube,
  linkJitter,
  fromMatrixOnly,
  cubeEnabled,
  cubeBottomY,
  cubeSize,
  subdivisions,
  active,
  activeRadiusPct,
  cubeX,
  cubeZ,
}: {
  size: number;
  count: number;
  color: string;
  opacityMin: number;
  opacityMax: number;
  heightMin: number;
  heightMax: number;
  angleJitter: number;
  seed: number;
  linkToCube: boolean;
  linkJitter: number;
  fromMatrixOnly: boolean;
  cubeEnabled: boolean;
  cubeBottomY: number;
  cubeSize: number;
  subdivisions: number;
  active: CellIndex[];
  activeRadiusPct: number;
  cubeX: number;
  cubeZ: number;
}) {
  const geom = useMemo(() => {
    const rand = seededPrng(Math.floor(seed * 1000) + 503);
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    const cols: number[] = [];
    const base = new THREE.Color(color);
    const jitterRad = (angleJitter / 100) * (Math.PI / 180) * 2.5;
    const originR = (activeRadiusPct / 100) * (size / 2);
    for (let i = 0; i < count; i += 1) {
      let x: number;
      let z: number;
      if (fromMatrixOnly && active.length > 0 && rand() < 0.4) {
        // 40% of rays rise from near actual active cells
        const a = active[Math.floor(rand() * active.length)];
        x = a.cx + (rand() - 0.5) * (size / 32);
        z = a.cz + (rand() - 0.5) * (size / 32);
      } else {
        // Random within the central disk
        const theta = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * originR;
        x = Math.cos(theta) * r;
        z = Math.sin(theta) * r;
      }
      let topX: number;
      let topY: number;
      let topZ: number;
      if (linkToCube && cubeEnabled) {
        const snap = snapToCubeNode(x, z, cubeSize, subdivisions, linkJitter, rand, cubeX, cubeZ);
        topX = snap.x;
        topY = cubeBottomY + (rand() - 0.3) * cubeSize * 0.08;
        topZ = snap.z;
      } else {
        const h = (heightMin + rand() * (heightMax - heightMin)) * 0.1;
        const ax = (rand() * 2 - 1) * jitterRad;
        const az = (rand() * 2 - 1) * jitterRad;
        topX = x + Math.sin(ax) * h;
        topY = h;
        topZ = z + Math.sin(az) * h;
      }
      pts.push(x, 0, z, topX, topY, topZ);
      const op = opacityMin + rand() * Math.max(0, opacityMax - opacityMin);
      const mul = op / 100;
      // RGBA: keep RGB at full base color, encode intensity on alpha so rays
      // fade via transparency rather than darkening into the background.
      cols.push(
        base.r, base.g, base.b, mul * 0.4,
        base.r, base.g, base.b, mul,
      );
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 4));
    return g;
  }, [
    size, count, color, opacityMin, opacityMax, heightMin, heightMax,
    angleJitter, seed, linkToCube, linkJitter, fromMatrixOnly,
    cubeEnabled, cubeBottomY, cubeSize, subdivisions, active, activeRadiusPct,
    cubeX, cubeZ,
  ]);

  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/* ------------------------------------------------------------ *
 * Wires — stable ShaderMaterial for guaranteed flow animation   *
 * ------------------------------------------------------------ */

const wireVertexShader = /* glsl */ `
  attribute float tAlong;
  attribute float tPhase;
  attribute float tSpeedMul;
  attribute float tOpaMul;
  uniform float uBaseY;        // Y at tAlong = 0 (far end)
  uniform float uTipY;         // Y at tAlong = 1 (anchor end)
  uniform float uBend;         // vertical bend amount (world units)
  uniform float uBendRadial;   // radial bend amount (world units)
  uniform vec3  uCubeAxis;     // (cubeX, 0, cubeZ)
  varying float vT;
  varying float vPhase;
  varying float vSpeedMul;
  varying float vOpaMul;
  void main() {
    vT = tAlong;
    vPhase = tPhase;
    vSpeedMul = tSpeedMul;
    vOpaMul = tOpaMul;

    // Y lerps between base (tAlong=0) and tip (tAlong=1).
    float y = mix(uBaseY, uTipY, tAlong);

    // Bend profile peaks at midpoint (sin(πt) is 0 at ends, 1 at middle).
    float bendCurve = sin(tAlong * 3.14159265359);

    // Vertical bend — positive arches up, negative sags down.
    y += bendCurve * uBend;

    // Radial bend — push outward from the cube's XZ axis at the midpoint
    // (positive = bulge away from the stack, negative = pull inward).
    vec2 axisVec = vec2(position.x - uCubeAxis.x, position.z - uCubeAxis.z);
    float r = length(axisVec);
    vec2 radialOffset = vec2(0.0);
    if (r > 0.0001) {
      vec2 dir = axisVec / r;
      radialOffset = dir * bendCurve * uBendRadial;
    }

    vec3 adjusted = vec3(
      position.x + radialOffset.x,
      y + position.y,
      position.z + radialOffset.y
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(adjusted, 1.0);
  }
`;

const wireFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTopFade;
  uniform float uBottomFade;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uDensity;
  uniform float uDuty;
  varying float vT;
  varying float vPhase;
  varying float vSpeedMul;
  varying float vOpaMul;
  void main() {
    float bottom = smoothstep(0.0, max(uBottomFade, 1e-4), vT);
    float top = smoothstep(0.0, max(uTopFade, 1e-4), 1.0 - vT);
    float fade = bottom * top;

    float flow = 1.0;
    float localSpeed = uSpeed * vSpeedMul;
    if (localSpeed > 0.0001 && uDensity > 0.0001 && uDuty > 0.0001) {
      float phase = fract(vT * uDensity - uTime * localSpeed + vPhase);
      float band = 1.0 - phase;
      float edge = 0.08;
      float dash = smoothstep(1.0 - uDuty - edge, 1.0 - uDuty, band);
      flow = mix(0.25, 1.0, dash);
    }

    float a = uOpacity * vOpaMul * fade * flow;
    if (a < 0.001) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

function Wires({
  active,
  cubeSize,
  subdivisions,
  cubeBottomY,
  cubeX,
  cubeZ,
  liveBottomYRef,
  color,
  opacity,
  count,
  drift,
  topFade,
  bottomFade,
  flowSpeed,
  flowDensity,
  flowDuty,
  flowRandomness,
  bend,
  bendRadial,
  bendSegments,
  thickness,
  floorRadius = 100,
  attachRadius = 100,
  direction = "down",
  farEndY,
  liveFarEndYRef,
  seed,
}: {
  active: CellIndex[];
  cubeSize: number;
  subdivisions: number;
  cubeBottomY: number;
  cubeX: number;
  cubeZ: number;
  liveBottomYRef: React.MutableRefObject<number>;
  color: string;
  opacity: number;
  count: number;
  drift: number;
  topFade: number;
  bottomFade: number;
  flowSpeed: number;
  flowDensity: number;
  flowDuty: number;
  flowRandomness: number;
  bend: number;
  bendRadial: number;
  bendSegments: number;
  thickness: number;
  floorRadius?: number;
  attachRadius?: number;
  direction?: "down" | "up";
  farEndY?: number;
  liveFarEndYRef?: React.MutableRefObject<number>;
  seed: number;
}) {
  // Resolve direction-dependent endpoints. For "down" direction, the far end
  // is the floor (y=0) and the tip is cubeBottomY (live). For "up", the far
  // end is the top of the cube (we use cubeBottomY ref as the live cube top
  // anchor from the caller's perspective) and the tip extends above.
  const isUp = direction === "up";
  const bakedBaseY = isUp ? cubeBottomY : (farEndY ?? 0);
  const bakedTipY = isUp
    ? cubeBottomY + (farEndY ?? 0) // for up: farEndY carries height
    : cubeBottomY;

  // Build geometry when structural inputs change. Positions store X and Z
  // for the straight line between endpoints; the shader supplies live Y
  // (via uBaseY / uTipY) plus bend. When thickness > 0, tube rings get a
  // small Y offset baked in — that offset is added on top of the shader Y.
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (active.length === 0) return g;
    const rand = seededPrng(Math.floor(seed * 1000) + 833);
    const segs = Math.max(1, Math.round(bendSegments));
    const total = Math.max(active.length, Math.round(count));
    const d = drift / 100;
    const half = cubeSize / 2;
    const n = Math.max(1, Math.round(subdivisions));
    const step = cubeSize / n;
    const rnd = Math.max(0, Math.min(1, flowRandomness / 100));
    const useTubes = thickness > 0.01;
    const radius = useTubes
      ? Math.max(0.001, (thickness / 100) * cubeSize * 0.08)
      : 0;
    const radialSegs = useTubes ? 6 : 0;

    const attachScale = attachRadius / 100;
    if (!useTubes) {
      // ---- Thin lines (LineSegments) ----
      const vertsPerWire = 2 * segs;
      const positions = new Float32Array(total * vertsPerWire * 3);
      const tAlong = new Float32Array(total * vertsPerWire);
      const tPhase = new Float32Array(total * vertsPerWire);
      const tSpeedMul = new Float32Array(total * vertsPerWire);
      const tOpaMul = new Float32Array(total * vertsPerWire);
      for (let i = 0; i < total; i += 1) {
        const hit = active[i % active.length];
        const relX = hit.cx - cubeX;
        const relZ = hit.cz - cubeZ;
        const nx = Math.round((relX + half) / step);
        const nz = Math.round((relZ + half) / step);
        const bxRaw = cubeX + (-half + Math.max(0, Math.min(n, nx)) * step);
        const bzRaw = cubeZ + (-half + Math.max(0, Math.min(n, nz)) * step);
        // Attach radius scales the cube-end attachment outward from the
        // cube axis. 0 collapses every wire to the cube center; 100 keeps
        // the snapped grid position; >100 pushes past the cube edge.
        const bx = cubeX + (bxRaw - cubeX) * attachScale;
        const bz = cubeZ + (bzRaw - cubeZ) * attachScale;
        const dx = bx + (rand() - 0.5) * cubeSize * d;
        const dz = bz + (rand() - 0.5) * cubeSize * d;

        const phase = rand();
        const speedMul = 1 + (rand() * 2 - 1) * rnd;
        const opaMul = 1 - rand() * rnd * 0.6;

        // Pull floor endpoints toward or away from the cube axis so the
        // user can keep the fan inside the cube footprint without moving
        // the active tiles themselves.
        const floorScale = floorRadius / 100;
        const scaledHitX = cubeX + (hit.cx - cubeX) * floorScale;
        const scaledHitZ = cubeZ + (hit.cz - cubeZ) * floorScale;

        // For "down" wires, base (t=0) sits at the floor cell, tip (t=1)
        // at the snapped+drifted cube attachment. For "up" wires, base
        // (t=0) sits at the snapped grid point on the cube top, tip (t=1)
        // extends outward in XZ as the drift radius grows.
        const sx = isUp ? bx : scaledHitX;
        const sz = isUp ? bz : scaledHitZ;
        const ex = dx;
        const ez = dz;

        for (let s = 0; s < segs; s += 1) {
          const t0 = s / segs;
          const t1 = (s + 1) / segs;
          const vOff = (i * vertsPerWire + s * 2) * 3;
          positions[vOff + 0] = sx + (ex - sx) * t0;
          positions[vOff + 1] = 0; // Y supplied by shader
          positions[vOff + 2] = sz + (ez - sz) * t0;
          positions[vOff + 3] = sx + (ex - sx) * t1;
          positions[vOff + 4] = 0;
          positions[vOff + 5] = sz + (ez - sz) * t1;

          const attrIdx = i * vertsPerWire + s * 2;
          tAlong[attrIdx + 0] = t0;
          tAlong[attrIdx + 1] = t1;
          tPhase[attrIdx + 0] = phase;
          tPhase[attrIdx + 1] = phase;
          tSpeedMul[attrIdx + 0] = speedMul;
          tSpeedMul[attrIdx + 1] = speedMul;
          tOpaMul[attrIdx + 0] = opaMul;
          tOpaMul[attrIdx + 1] = opaMul;
        }
      }
      g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      g.setAttribute("tAlong", new THREE.BufferAttribute(tAlong, 1));
      g.setAttribute("tPhase", new THREE.BufferAttribute(tPhase, 1));
      g.setAttribute("tSpeedMul", new THREE.BufferAttribute(tSpeedMul, 1));
      g.setAttribute("tOpaMul", new THREE.BufferAttribute(tOpaMul, 1));
      return g;
    }

    // ---- Thick tubes ----
    const positions: number[] = [];
    const indices: number[] = [];
    const tAlongArr: number[] = [];
    const tPhaseArr: number[] = [];
    const tSpeedArr: number[] = [];
    const tOpaArr: number[] = [];
    const perRing = radialSegs + 1;
    let baseVertex = 0;

    for (let i = 0; i < total; i += 1) {
      const hit = active[i % active.length];
      const relX = hit.cx - cubeX;
      const relZ = hit.cz - cubeZ;
      const nx = Math.round((relX + half) / step);
      const nz = Math.round((relZ + half) / step);
      const bxRaw = cubeX + (-half + Math.max(0, Math.min(n, nx)) * step);
      const bzRaw = cubeZ + (-half + Math.max(0, Math.min(n, nz)) * step);
      const bx = cubeX + (bxRaw - cubeX) * attachScale;
      const bz = cubeZ + (bzRaw - cubeZ) * attachScale;
      const dx = bx + (rand() - 0.5) * cubeSize * d;
      const dz = bz + (rand() - 0.5) * cubeSize * d;

      const phase = rand();
      const speedMul = 1 + (rand() * 2 - 1) * rnd;
      const opaMul = 1 - rand() * rnd * 0.6;

      // Base/tip XZ follow the same convention as the line path above:
      // down wires start at the floor cell (scaled toward the cube axis
      // by floorRadius); up wires start at the snapped cube-grid point
      // on the top face and spread outward.
      const floorScaleT = floorRadius / 100;
      const scaledHitXT = cubeX + (hit.cx - cubeX) * floorScaleT;
      const scaledHitZT = cubeZ + (hit.cz - cubeZ) * floorScaleT;
      const sx = isUp ? bx : scaledHitXT;
      const sz = isUp ? bz : scaledHitZT;
      // Build a straight-line curve using the BAKED anchor Ys so
      // TubeGeometry computes tangent-aligned ring frames correctly.
      // Final Y is re-applied in the shader (minus the baked curve Y)
      // so the tube can still track the live anchor.
      const curve = new THREE.LineCurve3(
        new THREE.Vector3(sx, bakedBaseY, sz),
        new THREE.Vector3(dx, bakedTipY, dz),
      );

      const tube = new THREE.TubeGeometry(
        curve,
        segs,
        radius,
        radialSegs,
        false,
      );
      const posArr = tube.attributes.position.array as ArrayLike<number>;
      const idxArr = tube.index!.array as ArrayLike<number>;
      const vCount = posArr.length / 3;

      for (let v = 0; v < vCount; v += 1) {
        const ring = Math.floor(v / perRing);
        const t = ring / segs;
        const curveY = bakedBaseY + (bakedTipY - bakedBaseY) * t;
        positions.push(posArr[v * 3 + 0]);
        // Store only the ring's local Y offset relative to the curve
        // centerline; shader adds live mix(uBaseY, uTipY, t) on top.
        positions.push(posArr[v * 3 + 1] - curveY);
        positions.push(posArr[v * 3 + 2]);
        tAlongArr.push(t);
        tPhaseArr.push(phase);
        tSpeedArr.push(speedMul);
        tOpaArr.push(opaMul);
      }
      for (let k = 0; k < idxArr.length; k += 1) {
        indices.push(idxArr[k] + baseVertex);
      }
      baseVertex += vCount;
      tube.dispose();
    }

    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    g.setAttribute(
      "tAlong",
      new THREE.Float32BufferAttribute(tAlongArr, 1),
    );
    g.setAttribute(
      "tPhase",
      new THREE.Float32BufferAttribute(tPhaseArr, 1),
    );
    g.setAttribute(
      "tSpeedMul",
      new THREE.Float32BufferAttribute(tSpeedArr, 1),
    );
    g.setAttribute(
      "tOpaMul",
      new THREE.Float32BufferAttribute(tOpaArr, 1),
    );
    g.setIndex(indices);
    return g;
  }, [
    active,
    cubeSize,
    subdivisions,
    bakedBaseY,
    bakedTipY,
    cubeX,
    cubeZ,
    count,
    drift,
    seed,
    flowRandomness,
    bendSegments,
    thickness,
    floorRadius,
    attachRadius,
    isUp,
  ]);

  // Stable material instance — created once, uniforms updated via effect / frame.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: wireVertexShader,
        fragmentShader: wireFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(0xffffff) },
          uOpacity: { value: 1 },
          uTopFade: { value: 0.2 },
          uBottomFade: { value: 0.2 },
          uTime: { value: 0 },
          uSpeed: { value: 0 },
          uDensity: { value: 6 },
          uDuty: { value: 0.35 },
          uBaseY: { value: 0 },
          uTipY: { value: cubeBottomY },
          uBend: { value: 0 },
          uBendRadial: { value: 0 },
          uCubeAxis: { value: new THREE.Vector3(cubeX, 0, cubeZ) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(color);
    material.uniforms.uOpacity.value = opacity / 100;
    material.uniforms.uTopFade.value = topFade / 100;
    material.uniforms.uBottomFade.value = bottomFade / 100;
    material.uniforms.uSpeed.value = flowSpeed / 100;
    material.uniforms.uDensity.value = flowDensity;
    material.uniforms.uDuty.value = flowDuty / 100;
    // Bend is scaled by cubeSize so the slider range feels natural across
    // very small or very large cubes.
    material.uniforms.uBend.value = (bend / 100) * cubeSize;
    material.uniforms.uBendRadial.value = (bendRadial / 100) * cubeSize;
    (material.uniforms.uCubeAxis.value as THREE.Vector3).set(cubeX, 0, cubeZ);
  }, [
    material,
    color,
    opacity,
    topFade,
    bottomFade,
    flowSpeed,
    flowDensity,
    flowDuty,
    bend,
    bendRadial,
    cubeSize,
    cubeX,
    cubeZ,
  ]);

  useFrame(({ clock }) => {
    // Use absolute renderer time so export loops can return to time zero
    // without carrying an accumulated delta into the final frame.
    material.uniforms.uTime.value = clock.getElapsedTime() % 1000;
    // Track live cube face Y so wires follow the explode animation.
    const liveAnchor = liveBottomYRef.current;
    if (isUp) {
      // For up wires, liveBottomYRef is the live cube TOP Y; farEndY is
      // the upward length. Base sits at cube top; tip sits at top + length.
      material.uniforms.uBaseY.value = liveAnchor;
      material.uniforms.uTipY.value = liveAnchor + (farEndY ?? 0);
    } else {
      // For down wires, uBaseY is floor (0 or liveFarEndYRef), uTipY is
      // the live cube bottom.
      material.uniforms.uBaseY.value = liveFarEndYRef
        ? liveFarEndYRef.current
        : (farEndY ?? 0);
      material.uniforms.uTipY.value = liveAnchor;
    }
  });

  if (active.length === 0) return null;

  const useTubes = thickness > 0.01;
  if (useTubes) {
    return (
      <mesh geometry={geom}>
        <primitive object={material} attach="material" />
      </mesh>
    );
  }
  return (
    <lineSegments geometry={geom}>
      <primitive object={material} attach="material" />
    </lineSegments>
  );
}

/* ------------------------------------------------------------ *
 * SlabCube — hyper-real stacked plates with explode animation   *
 * ------------------------------------------------------------ */

type EasingKind =
  | "expoOut"
  | "quartOut"
  | "cubicOut"
  | "sineOut"
  | "springOut"
  | "springBounce";

function applyEasing(t: number, kind: EasingKind) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (kind) {
    case "expoOut":
      return 1 - Math.pow(2, -10 * t);
    case "quartOut":
      return 1 - Math.pow(1 - t, 4);
    case "cubicOut":
      return 1 - Math.pow(1 - t, 3);
    case "sineOut":
      return Math.sin((t * Math.PI) / 2);
    case "springOut": {
      // easeOutBack — mild spring overshoot (~10%)
      const c1 = 1.2;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case "springBounce": {
      // easeOutElastic — pronounced spring bounce
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
  }
}

/** Canvas-backed label texture — pure 2D rendering, no 3D font. */
function buildLabelTexture(
  text: string,
  fontPx: number,
  textColor: string,
  bgColor: string,
  paddingPct: number,
  resolution: number,
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pad = (paddingPct / 100) * fontPx;
  ctx.font = `500 ${fontPx}px -apple-system, system-ui, sans-serif`;
  const textWidth = ctx.measureText(text).width;
  const width = Math.ceil(textWidth + pad * 2);
  const height = Math.ceil(fontPx * 1.3 + pad * 1.2);
  canvas.width = Math.ceil(width * resolution);
  canvas.height = Math.ceil(height * resolution);
  ctx.scale(resolution, resolution);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = textColor;
  ctx.font = `500 ${fontPx}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { texture: tex, width, height };
}

/** Mesh-strata-3d-style sprite labels. Projects each slab's XZ corners to
 *  screen space, anchors the sprite to the rightmost projected point, and
 *  scales to pixel-perfect size using worldPerPixel. Clamps anchor to stay
 *  inside the canvas when the user pans close to an edge. */
function SlabLabels({
  labels,
  referenceHeight,
  cubeX,
  cubeZ,
  slabHalfWidth,
  slabWorldYsRef,
  N,
}: {
  labels: {
    enabled: boolean;
    texts: string[];
    textColor: string;
    bgColor: string;
    fontSize: number;
    padding: number;
    offsetX: number;
    offsetY: number;
    offsetZ: number;
    scale: number;
  };
  referenceHeight?: number;
  cubeX: number;
  cubeZ: number;
  slabHalfWidth: number;
  slabWorldYsRef: React.MutableRefObject<number[]>;
  N: number;
}) {
  const spriteRefs = useRef<Array<THREE.Sprite | null>>([]);
  const viewportHeight = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  // Labels use CSS pixels in the editor. Preserve their share of the frame
  // when rendering a larger export, including padding and edge spacing.
  const viewportScale = referenceHeight && referenceHeight > 0
    ? viewportHeight / referenceHeight
    : 1;
  const scale = (labels.scale / 100) * viewportScale;
  const textureResolution = Math.min(16, Math.max(4, Math.ceil(scale * dpr)));

  const labelDatas = useMemo(() => {
    if (!labels.enabled) return [];
    const out: Array<ReturnType<typeof buildLabelTexture>> = [];
    for (let i = 0; i < N; i += 1) {
      const text = labels.texts[i] ?? "";
      out.push(text ? buildLabelTexture(text, Math.max(8, labels.fontSize), labels.textColor, labels.bgColor, labels.padding, textureResolution) : null);
    }
    return out;
  }, [labels.enabled, labels.texts, labels.fontSize, labels.textColor, labels.bgColor, labels.padding, N, textureResolution]);

  useEffect(() => {
    return () => {
      labelDatas.forEach((d) => d?.texture.dispose());
    };
  }, [labelDatas]);

  const scratch = useMemo(
    () => ({
      point: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      pixel: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ camera, size }) => {
    if (!labels.enabled || size.width === 0 || size.height === 0) return;
    const groupOx = labels.offsetX * 0.01;
    const groupOy = labels.offsetY * 0.01;
    const groupOz = labels.offsetZ * 0.01;
    const { point, anchor, pixel } = scratch;

    for (let i = 0; i < N; i += 1) {
      const sprite = spriteRefs.current[i];
      const data = labelDatas[i];
      if (!sprite || !data) continue;

      const slabWorldY = (slabWorldYsRef.current[i] ?? 0) + groupOy;

      // Find the rightmost (highest NDC x) projected XZ-corner at this Y.
      let bestX = -Infinity;
      for (const dx of [-slabHalfWidth, slabHalfWidth]) {
        for (const dz of [-slabHalfWidth, slabHalfWidth]) {
          point
            .set(cubeX + dx + groupOx, slabWorldY, cubeZ + dz + groupOz)
            .project(camera);
          if (point.x > bestX) {
            bestX = point.x;
            anchor.copy(point);
          }
        }
      }

      sprite.visible = anchor.z >= -1 && anchor.z <= 1;

      const labelW = data.width * scale;
      const labelH = data.height * scale;
      const edge = (16 * scale) / size.width;
      anchor.x = THREE.MathUtils.clamp(
        anchor.x + edge,
        -1 + edge,
        1 - ((labelW + 8 * scale) * 2) / size.width,
      );
      anchor.y = THREE.MathUtils.clamp(
        anchor.y,
        -1 + (labelH + 8 * scale) / size.height,
        1 - (labelH + 8 * scale) / size.height,
      );

      pixel.copy(anchor);
      pixel.x += 2 / size.width;
      pixel.unproject(camera);
      anchor.unproject(camera);
      const worldPerPixel = pixel.distanceTo(anchor);
      sprite.position.copy(anchor);
      sprite.scale.set(labelW * worldPerPixel, labelH * worldPerPixel, 1);
    }
  });

  if (!labels.enabled) return null;

  return (
    <>
      {labelDatas.map((data, i) => {
        if (!data) return null;
        return (
          <sprite
            key={`slab-label-${i}`}
            ref={(s) => {
              spriteRefs.current[i] = s;
            }}
            center={[0, 0.5]}
            renderOrder={1000}
            frustumCulled={false}
          >
            <spriteMaterial
              map={data.texture}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </>
  );
}

type SlabMeshProps = {
  width: number;
  height: number;
  depth: number;
  sideColor: THREE.Color;
  sideMap: THREE.Texture | null | undefined;
  topBottomColor: THREE.Color;
  metalness: number;
  roughness: number;
  glass: {
    enabled: boolean;
    transmission: number;      // 0-1
    thickness: number;         // world units
    clearcoat: number;         // 0-1
    clearcoatRoughness: number; // 0-1
    ior: number;               // 1.0-2.5
    tint: number;              // 0-1 how much slab color tints the glass
  };
};

const SlabMesh = React.forwardRef<THREE.Mesh, SlabMeshProps>(function SlabMesh(
  { width, height, depth, sideColor, sideMap, topBottomColor, metalness, roughness, glass },
  ref,
) {
  // When glass is on, slabs use MeshPhysicalMaterial so transmission,
  // clearcoat, and IOR give the glossy / translucent read. When off, we fall
  // back to MeshStandardMaterial for solid metallic/plastic look.
  // Rebuild the material array whenever glass mode flips.
  const materials = useMemo(() => {
    if (glass.enabled) {
      // Tint the glass toward slab color by `tint`; at 0 it's near-white glass
      // showing the environment behind, at 1 it's fully color-saturated.
      const tintedSide = new THREE.Color("#ffffff").lerp(sideColor, glass.tint);
      const tintedTop = new THREE.Color("#ffffff").lerp(topBottomColor, glass.tint);
      const side = new THREE.MeshPhysicalMaterial({
        color: tintedSide,
        map: sideMap ?? null,
        metalness: 0,
        roughness: Math.max(0.02, roughness * 0.6),
        transmission: glass.transmission,
        thickness: glass.thickness,
        clearcoat: glass.clearcoat,
        clearcoatRoughness: glass.clearcoatRoughness,
        ior: glass.ior,
        transparent: true,
        envMapIntensity: 1.5,
      });
      const topBottom = new THREE.MeshPhysicalMaterial({
        color: tintedTop,
        metalness: 0,
        roughness: Math.max(0.02, roughness * 0.6),
        transmission: glass.transmission,
        thickness: glass.thickness,
        clearcoat: glass.clearcoat,
        clearcoatRoughness: glass.clearcoatRoughness,
        ior: glass.ior,
        transparent: true,
        envMapIntensity: 1.5,
      });
      return [side, side, topBottom, topBottom, side, side];
    }
    const side = new THREE.MeshStandardMaterial({
      color: sideColor,
      map: sideMap ?? null,
      metalness,
      roughness,
      envMapIntensity: 1.2,
    });
    const topBottom = new THREE.MeshStandardMaterial({
      color: topBottomColor,
      metalness,
      roughness,
      envMapIntensity: 1.2,
    });
    return [side, side, topBottom, topBottom, side, side];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glass.enabled]);

  // Keep uniforms in sync without rebuilding materials when values change
  // but glass mode is unchanged.
  useEffect(() => {
    const side = materials[0];
    const topBottom = materials[2];
    if (glass.enabled && side instanceof THREE.MeshPhysicalMaterial) {
      side.color.copy(new THREE.Color("#ffffff").lerp(sideColor, glass.tint));
      side.map = sideMap ?? null;
      side.roughness = Math.max(0.02, roughness * 0.6);
      side.transmission = glass.transmission;
      side.thickness = glass.thickness;
      side.clearcoat = glass.clearcoat;
      side.clearcoatRoughness = glass.clearcoatRoughness;
      side.ior = glass.ior;
      side.needsUpdate = true;
    } else if (!glass.enabled && side instanceof THREE.MeshStandardMaterial) {
      side.color.copy(sideColor);
      side.map = sideMap ?? null;
      side.metalness = metalness;
      side.roughness = roughness;
      side.needsUpdate = true;
    }
    if (glass.enabled && topBottom instanceof THREE.MeshPhysicalMaterial) {
      topBottom.color.copy(
        new THREE.Color("#ffffff").lerp(topBottomColor, glass.tint),
      );
      topBottom.roughness = Math.max(0.02, roughness * 0.6);
      topBottom.transmission = glass.transmission;
      topBottom.thickness = glass.thickness;
      topBottom.clearcoat = glass.clearcoat;
      topBottom.clearcoatRoughness = glass.clearcoatRoughness;
      topBottom.ior = glass.ior;
      topBottom.needsUpdate = true;
    } else if (
      !glass.enabled &&
      topBottom instanceof THREE.MeshStandardMaterial
    ) {
      topBottom.color.copy(topBottomColor);
      topBottom.metalness = metalness;
      topBottom.roughness = roughness;
      topBottom.needsUpdate = true;
    }
  }, [
    materials,
    sideColor,
    sideMap,
    topBottomColor,
    metalness,
    roughness,
    glass.enabled,
    glass.transmission,
    glass.thickness,
    glass.clearcoat,
    glass.clearcoatRoughness,
    glass.ior,
    glass.tint,
  ]);

  useEffect(() => {
    return () => {
      materials.forEach((m) => m.dispose());
    };
  }, [materials]);

  return (
    <mesh ref={ref} material={materials}>
      <boxGeometry args={[width, height, depth]} />
    </mesh>
  );
});

function SlabCube({
  size,
  subdivisions,
  slabColor,
  metalness,
  roughness,
  slabHeightPct,
  slabHeights,
  slabColors,
  slabTextures,
  slabTextureBlend,
  slabGapPct,
  glass,
  coreEnabled,
  coreColor,
  coreEmission,
  coreSizePct,
  openEnabled,
  openAmount,
  interSpacing,
  openDuration,
  openStagger,
  openEasing,
  openMode,
  openHold,
  openTrigger,
  floatEnabled,
  floatAmp,
  floatPeriod,
  liveBottomYRef,
  liveTopYRef,
  slabWorldYsRef,
  cubeOriginY,
}: {
  size: number;
  subdivisions: number;
  slabColor: string;
  metalness: number;
  roughness: number;
  slabHeightPct: number;
  slabHeights: number[];
  slabColors: string[];
  slabTextures: string[];
  slabTextureBlend: number;
  slabGapPct: number;
  glass: {
    enabled: boolean;
    transmission: number;
    thickness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    ior: number;
    tint: number;
  };
  coreEnabled: boolean;
  coreColor: string;
  coreEmission: number;
  coreSizePct: number;
  openEnabled: boolean;
  openAmount: number;
  interSpacing: number;
  openDuration: number;
  openStagger: number;
  openEasing: EasingKind;
  openMode: "once" | "loop";
  openHold: number;
  openTrigger: number;
  floatEnabled: boolean;
  floatAmp: number;
  floatPeriod: number;
  liveBottomYRef: React.MutableRefObject<number>;
  liveTopYRef: React.MutableRefObject<number>;
  slabWorldYsRef: React.MutableRefObject<number[]>;
  cubeOriginY: number;
}) {
  const N = Math.max(1, Math.round(subdivisions));

  // Compute each slab's natural (closed) center-Y from its own height.
  // Each slab band is `size / N`. Within its band the slab occupies
  // `slabHeightPct * perSlabHeightMultiplier * (1 - slabGapPct)`.
  const bandH = size / N;
  const gapScale = 1 - Math.max(0, Math.min(0.9, slabGapPct / 100));
  const slabBaseInfo = Array.from({ length: N }).map((_, i) => {
    const heightMul = (slabHeights[i] ?? 100) / 100;
    const h = bandH * (slabHeightPct / 100) * heightMul * gapScale;
    const baseY = -size / 2 + (i + 0.5) * bandH;
    return { h, baseY };
  });
  const slabSpacing = bandH;

  const slabRefs = useRef<Array<THREE.Mesh | null>>([]);
  const animationStartRef = useRef(0);
  const clock = useThree((root) => root.clock);

  // Keep slab-ref array sized to N and restart the opening animation when
  // Replay changes the trigger. The clock offset also makes time zero
  // deterministic for seamless export loops.
  useEffect(() => {
    slabRefs.current.length = N;
    animationStartRef.current = clock.getElapsedTime();
  }, [clock, openTrigger, N, openMode]);

  useFrame(({ clock }) => {
    // Absolute time keeps the opening/float animation deterministic and lets
    // the exporter's loop frame exactly match the first frame.
    const elapsed = Math.max(
      0,
      clock.getElapsedTime() - animationStartRef.current,
    );

    const cycleLen = openDuration + Math.max(0, openHold);
    const localTime =
      openMode === "loop" && cycleLen > 0 ? elapsed % cycleLen : elapsed;

    // Total stagger window: higher slabs start later. Normalized by (N-1).
    const totalStagger = (openStagger / 100) * openDuration;
    const perSlabDelay = N > 1 ? totalStagger / (N - 1) : 0;

    for (let i = 0; i < N; i += 1) {
      const mesh = slabRefs.current[i];
      if (!mesh) continue;

      const baseY = slabBaseInfo[i].baseY;

      let progress = 1;
      if (openEnabled) {
        const delay = i * perSlabDelay;
        const t = Math.max(
          0,
          Math.min(1, (localTime - delay) / Math.max(1e-4, openDuration)),
        );
        progress = applyEasing(t, openEasing);
      }

      // Explode offset — base lift lets even the bottom slab spring up,
      // then each slab above gets an extra uniform gap controlled by
      // `interSpacing` (user-facing in-between slider).
      const baseLift = slabSpacing * (openAmount / 100) * 0.4;
      const perGap = slabSpacing * (interSpacing / 100);
      const extra = (baseLift + i * perGap) * progress;

      // Idle float applied once the explode has settled. Every slab bobs,
      // with amplitude scaled by its position (top bobs most) and a per-slab
      // phase offset so the stack reads organic instead of in-sync.
      let bob = 0;
      if (floatEnabled && floatPeriod > 0.01) {
        const settled = openEnabled ? progress : 1;
        const ampScale = 0.35 + (i / Math.max(1, N - 1)) * 0.65;
        const phaseOffset = i * 0.55;
        bob =
          settled *
          Math.sin((elapsed * 2 * Math.PI) / floatPeriod + phaseOffset) *
          (floatAmp * 0.1) *
          ampScale;
      }

      mesh.position.y = baseY + extra + bob;

      // Expose world-space Y so SlabLabels (rendered at scene root) can
      // project each slab's XZ corners for pixel-perfect anchoring.
      slabWorldYsRef.current[i] = cubeOriginY + mesh.position.y;
    }

    // Expose the world-space Y of the bottom slab's bottom face so wires
    // can track it live. SlabCube is nested inside a group at cubeOriginY.
    const bottomSlab = slabRefs.current[0];
    if (bottomSlab) {
      liveBottomYRef.current =
        cubeOriginY + bottomSlab.position.y - slabBaseInfo[0].h / 2;
    }
    // Expose the world-space Y of the top slab's top face so top wires
    // can anchor there (parallel to the bottom-face tracking above).
    const topSlab = slabRefs.current[N - 1];
    if (topSlab) {
      liveTopYRef.current =
        cubeOriginY + topSlab.position.y + slabBaseInfo[N - 1].h / 2;
    }
  });

  // Load per-slab textures from data URLs. useMemo so textures only reload
  // when a slot's URL actually changes.
  const slabTexs = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return Array.from({ length: N }).map((_, i) => {
      const url = slabTextures[i] ?? "";
      if (!url) return null;
      const tex = loader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }, [N, slabTextures]);

  useEffect(() => {
    return () => {
      slabTexs.forEach((t) => t?.dispose());
    };
  }, [slabTexs]);

  const coreMeshRef = useRef<THREE.Mesh | null>(null);
  const coreMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(coreColor).multiplyScalar(
        1 + (coreEmission / 100) * 1.5,
      ),
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    coreMaterial.color
      .set(coreColor)
      .multiplyScalar(1 + (coreEmission / 100) * 1.5);
  }, [coreMaterial, coreColor, coreEmission]);

  // Core spans from the top face of the bottom slab (slab 1) to the bottom
  // face of the top slab (slab N) — so it always touches every layer.
  useFrame(() => {
    const mesh = coreMeshRef.current;
    if (!mesh) return;
    const bottomSlab = slabRefs.current[0];
    const topSlab = slabRefs.current[N - 1];
    if (!bottomSlab || !topSlab) return;
    const bottomTop = bottomSlab.position.y + slabBaseInfo[0].h / 2;
    const topBottom = topSlab.position.y - slabBaseInfo[N - 1].h / 2;
    const span = Math.max(0.01, topBottom - bottomTop);
    mesh.position.y = (bottomTop + topBottom) / 2;
    // Base geometry height = 1 unit; scale.y = span to match exact distance.
    mesh.scale.y = span;
  });

  return (
    <group>
      {Array.from({ length: N }).map((_, i) => {
        const isTop = i === N - 1;
        const isBottom = i === 0;
        const horiz = isTop || isBottom ? size * 1.02 : size;
        const perColor = slabColors[i] ?? slabColor;
        const h = slabBaseInfo[i].h;
        const tex = slabTexs[i];
        // When a texture is bound to the side faces, we tint less aggressively
        // so the image reads cleanly. Side color = white→perColor blend.
        const sideTint = tex
          ? new THREE.Color("#ffffff").lerp(
              new THREE.Color(perColor),
              1 - slabTextureBlend / 100,
            )
          : new THREE.Color(perColor);
        const topBottomColor = new THREE.Color(perColor);
        return (
          <SlabMesh
            key={`slab-${i}`}
            ref={(m) => {
              slabRefs.current[i] = m;
            }}
            width={horiz}
            height={h}
            depth={horiz}
            sideColor={sideTint}
            sideMap={tex}
            topBottomColor={topBottomColor}
            metalness={metalness / 100}
            roughness={roughness / 100}
            glass={glass}
          />
        );
      })}

      {coreEnabled && (
        <mesh ref={coreMeshRef}>
          <boxGeometry
            args={[
              size * (coreSizePct / 100) * 0.6,
              1,
              size * (coreSizePct / 100) * 0.6,
            ]}
          />
          <primitive object={coreMaterial} attach="material" />
        </mesh>
      )}

    </group>
  );
}

/* ------------------------------------------------------------ *
 * Cube                                                           *
 * ------------------------------------------------------------ */

function CubeWireframe({ size, outerColor, outerOpacity }: {
  size: number;
  outerColor: string;
  outerOpacity: number;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BoxGeometry(size, size, size);
    const edges = new THREE.EdgesGeometry(g);
    g.dispose();
    return edges;
  }, [size]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color={outerColor}
        transparent
        opacity={outerOpacity / 100}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function CubeInnerGrid({ size, subdivisions, color, opacity }: {
  size: number;
  subdivisions: number;
  color: string;
  opacity: number;
}) {
  const geom = useMemo(() => {
    const n = Math.max(1, Math.round(subdivisions));
    const h = size / 2;
    const step = size / n;
    const pts: number[] = [];
    for (let i = 1; i < n; i += 1) {
      const t = -h + i * step;
      pts.push(-h, t, -h, h, t, -h);
      pts.push(-h, t, h, h, t, h);
      pts.push(-h, t, -h, -h, t, h);
      pts.push(h, t, -h, h, t, h);
      pts.push(t, -h, -h, t, h, -h);
      pts.push(t, -h, h, t, h, h);
      pts.push(t, -h, -h, t, -h, h);
      pts.push(t, h, -h, t, h, h);
      pts.push(-h, -h, t, h, -h, t);
      pts.push(-h, h, t, h, h, t);
      pts.push(-h, -h, t, -h, h, t);
      pts.push(h, -h, t, h, h, t);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [size, subdivisions]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity / 100}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function CubeNodes({ size, subdivisions, color, nodeSize, intensity }: {
  size: number;
  subdivisions: number;
  color: string;
  nodeSize: number;
  intensity: number;
}) {
  const positions = useMemo(() => {
    const n = Math.max(1, Math.round(subdivisions));
    const h = size / 2;
    const step = size / n;
    const out: number[] = [];
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n; j += 1) {
        for (let k = 0; k <= n; k += 1) {
          const onFace =
            i === 0 || i === n || j === 0 || j === n || k === 0 || k === n;
          if (!onFace) continue;
          out.push(-h + i * step, -h + j * step, -h + k * step);
        }
      }
    }
    return new Float32Array(out);
  }, [size, subdivisions]);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [positions]);

  const col = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(1 + (intensity / 100) * 2);
    return c;
  }, [color, intensity]);

  return (
    <points geometry={geom}>
      <pointsMaterial
        color={col}
        size={nodeSize / 1000}
        sizeAttenuation
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/* ------------------------------------------------------------ *
 * Scene root                                                     *
 * ------------------------------------------------------------ */

export function SecurityGridScene({ settings, labelReferenceHeight }: {
  settings: SecurityGridSettings;
  labelReferenceHeight?: number;
}) {
  const active = useMemo(
    () =>
      pickActiveCells(
        settings.floorCells,
        settings.floorSize,
        settings.activeCount,
        settings.activeSeed,
        settings.activeRadius,
        settings.activeCenterBias,
      ),
    [
      settings.floorCells,
      settings.floorSize,
      settings.activeCount,
      settings.activeSeed,
      settings.activeRadius,
      settings.activeCenterBias,
    ],
  );

  const cellSize = settings.floorSize / Math.max(1, settings.floorCells);
  const cubeY = settings.cubeHeightAbove * 0.1;
  const cubeBottomY = cubeY - settings.cubeSize / 2;
  const cubeX = settings.cubeOffsetX * 0.1;
  const cubeZ = settings.cubeOffsetZ * 0.1;

  // Live world-space Y of the bottom slab's bottom face. SlabCube writes to
  // this each frame; Wires reads it to anchor its top endpoints.
  const liveBottomYRef = useRef(cubeBottomY);
  // Live world-space Y of the top slab's top face. SlabCube writes it; the
  // Top Wires component anchors its base there.
  const liveTopYRef = useRef(cubeY + settings.cubeSize / 2);
  // Live world-space Y of every slab center. Written by SlabCube, read by
  // the mesh-strata-style projected label anchoring.
  const slabWorldYsRef = useRef<number[]>(
    Array.from({ length: settings.cubeSubdivisions }, () => cubeY),
  );

  const stems = useMemo(
    () =>
      settings.stemsEnabled
        ? buildStems(
            active,
            settings.stemPercentage,
            settings.stemHeightMin,
            settings.stemHeightMax,
            settings.stemNodesEnabled ? settings.stemNodeMaxPerStem : 0,
            settings.activeSeed,
            settings.stemLinkToCube,
            settings.stemLinkJitter,
            settings.cubeEnabled,
            cubeBottomY,
            settings.cubeSize,
            settings.cubeSubdivisions,
            settings.stemEnterCube,
            cubeX,
            cubeZ,
          )
        : [],
    [
      active,
      settings.stemsEnabled,
      settings.stemPercentage,
      settings.stemHeightMin,
      settings.stemHeightMax,
      settings.stemNodesEnabled,
      settings.stemNodeMaxPerStem,
      settings.activeSeed,
      settings.stemLinkToCube,
      settings.stemLinkJitter,
      settings.cubeEnabled,
      cubeBottomY,
      settings.cubeSize,
      settings.cubeSubdivisions,
      settings.stemEnterCube,
      cubeX,
      cubeZ,
    ],
  );

  return (
    <>
      <ambientLight intensity={0.08} />
      {/* Lighting rig for metallic slab reads */}
      <hemisphereLight
        args={["#ffffff", "#101014", settings.lightHemiIntensity / 100]}
      />
      <directionalLight
        position={[8, 12, 6]}
        intensity={settings.lightKeyIntensity / 100}
      />
      <directionalLight
        position={[-6, 4, -4]}
        intensity={settings.lightFillIntensity / 100}
      />

      <BasePlane
        size={settings.floorSize}
        color={settings.basePlaneColor}
        opacity={settings.basePlaneOpacity}
        edgeFade={settings.floorEdgeFade}
        edgeIntensity={settings.floorEdgeIntensity}
      />
      <FloorGrid
        size={settings.floorSize}
        cells={settings.floorCells}
        color={settings.gridColor}
        opacityNear={settings.gridOpacityNear}
        opacityFar={settings.gridOpacityFar}
        edgeFade={settings.floorEdgeFade}
        edgeIntensity={settings.floorEdgeIntensity}
      />
      <ZeroRings
        size={settings.floorSize}
        cells={settings.floorCells}
        active={active}
        color={settings.zeroColor}
        opacity={settings.zeroOpacity}
        ringSize={settings.zeroRingSize}
        ringThickness={settings.zeroRingThickness}
        edgeFade={settings.floorEdgeFade}
        edgeIntensity={settings.floorEdgeIntensity}
      />
      <ActiveTiles
        active={active}
        cellSize={cellSize}
        tileColor={settings.activeTileColor}
        tileEmission={settings.activeTileEmission}
        symbolColor={settings.activeSymbolColor}
        tileScale={settings.activeTileScale}
        edgeFade={settings.floorEdgeFade}
        edgeIntensity={settings.floorEdgeIntensity}
        floorHalf={settings.floorSize / 2}
        anim={{
          enabled: settings.activeAnimEnabled,
          speed: settings.activeAnimSpeed,
          intensity: settings.activeAnimIntensity,
          dynamic: settings.activeAnimDynamic,
          mode: settings.activeAnimMode,
        }}
        seed={settings.activeSeed}
      />

      {settings.stemsEnabled && (
        <Stems
          stems={stems}
          color={settings.stemColor}
          opacity={settings.stemOpacity}
        />
      )}
      {settings.stemsEnabled && settings.stemNodesEnabled && (
        <StemNodes
          stems={stems}
          color={settings.stemNodeColor}
          size={settings.stemNodeSize}
        />
      )}

      {settings.raysEnabled && (
        <ProjectionRays
          size={settings.floorSize}
          count={settings.rayCount}
          color={settings.rayColor}
          opacityMin={settings.rayOpacityMin}
          opacityMax={settings.rayOpacityMax}
          heightMin={settings.rayHeightMin}
          heightMax={settings.rayHeightMax}
          angleJitter={settings.rayAngleJitter}
          seed={settings.activeSeed}
          linkToCube={settings.rayLinkToCube}
          linkJitter={settings.rayLinkJitter}
          fromMatrixOnly={settings.rayFromMatrixOnly}
          cubeEnabled={settings.cubeEnabled}
          cubeBottomY={cubeBottomY}
          cubeSize={settings.cubeSize}
          subdivisions={settings.cubeSubdivisions}
          active={active}
          activeRadiusPct={settings.activeRadius}
          cubeX={cubeX}
          cubeZ={cubeZ}
        />
      )}

      {settings.cubeEnabled && (
        <group position={[cubeX, cubeY, cubeZ]}>
          {!(settings.cubeSlabsEnabled && settings.cubeHideWireframeWhenSlabs) && (
            <>
              <CubeWireframe
                size={settings.cubeSize}
                outerColor={settings.cubeOuterColor}
                outerOpacity={settings.cubeOuterOpacity}
              />
              <CubeInnerGrid
                size={settings.cubeSize}
                subdivisions={settings.cubeSubdivisions}
                color={settings.cubeInnerColor}
                opacity={settings.cubeInnerOpacity}
              />
              <CubeNodes
                size={settings.cubeSize}
                subdivisions={settings.cubeSubdivisions}
                color={settings.cubeNodeColor}
                nodeSize={settings.cubeNodeSize}
                intensity={settings.cubeNodeIntensity}
              />
            </>
          )}
          {settings.cubeSlabsEnabled && (
            <SlabCube
              size={settings.cubeSize}
              subdivisions={settings.cubeSubdivisions}
              slabColor={settings.cubeSlabColor}
              metalness={settings.cubeSlabMetalness}
              roughness={settings.cubeSlabRoughness}
              slabHeightPct={settings.cubeSlabHeightPct}
              slabHeights={settings.cubeSlabHeights}
              slabColors={settings.cubeSlabColors}
              slabTextures={settings.cubeSlabTextures}
              slabTextureBlend={settings.cubeSlabTextureBlend}
              slabGapPct={settings.cubeSlabGapPct}
              glass={{
                enabled: settings.cubeSlabGlassEnabled,
                transmission: settings.cubeSlabTransmission / 100,
                thickness: (settings.cubeSlabThickness / 100) * 5,
                clearcoat: settings.cubeSlabClearcoat / 100,
                clearcoatRoughness: settings.cubeSlabClearcoatRough / 100,
                ior: settings.cubeSlabIOR / 100,
                tint: settings.cubeSlabGlassTint / 100,
              }}
              coreEnabled={settings.cubeCoreEnabled}
              coreColor={settings.cubeCoreColor}
              coreEmission={settings.cubeCoreEmission}
              coreSizePct={settings.cubeCoreSizePct}
              openEnabled={settings.cubeOpenEnabled}
              openAmount={settings.cubeOpenAmount}
              interSpacing={settings.cubeInterSpacing}
              openDuration={settings.cubeOpenDuration}
              openStagger={settings.cubeOpenStagger}
              openEasing={settings.cubeOpenEasing}
              openMode={settings.cubeOpenMode}
              openHold={settings.cubeOpenHold}
              openTrigger={settings.cubeOpenTrigger}
              floatEnabled={settings.cubeFloatEnabled}
              floatAmp={settings.cubeFloatAmp}
              floatPeriod={settings.cubeFloatPeriod}
              liveBottomYRef={liveBottomYRef}
              liveTopYRef={liveTopYRef}
              slabWorldYsRef={slabWorldYsRef}
              cubeOriginY={cubeY}
            />
          )}
        </group>
      )}

      {settings.cubeEnabled && settings.cubeSlabsEnabled && (
        <SlabLabels
          referenceHeight={labelReferenceHeight}
          labels={{
            enabled: settings.cubeSlabLabelsEnabled,
            texts: settings.cubeSlabLabels,
            textColor: settings.cubeSlabLabelTextColor,
            bgColor: settings.cubeSlabLabelBgColor,
            fontSize: settings.cubeSlabLabelFontSize,
            padding: settings.cubeSlabLabelPadding,
            offsetX: settings.cubeSlabLabelOffsetX,
            offsetY: settings.cubeSlabLabelOffsetY,
            offsetZ: settings.cubeSlabLabelOffsetZ,
            scale: settings.cubeSlabLabelScale,
          }}
          cubeX={cubeX}
          cubeZ={cubeZ}
          slabHalfWidth={settings.cubeSize * 0.5}
          slabWorldYsRef={slabWorldYsRef}
          N={settings.cubeSubdivisions}
        />
      )}

      {settings.cubeEnabled && settings.wiresEnabled && (
        <Wires
          active={active}
          cubeSize={settings.cubeSize}
          subdivisions={settings.cubeSubdivisions}
          cubeBottomY={cubeBottomY}
          cubeX={cubeX}
          cubeZ={cubeZ}
          liveBottomYRef={liveBottomYRef}
          color={settings.wireColor}
          opacity={settings.wireOpacity}
          count={settings.wireCount}
          drift={settings.wireDrift}
          topFade={settings.wireTopFade}
          bottomFade={settings.wireBottomFade}
          flowSpeed={settings.wireFlowSpeed}
          flowDensity={settings.wireFlowDensity}
          flowDuty={settings.wireFlowDuty}
          flowRandomness={settings.wireFlowRandomness}
          bend={settings.wireBend}
          bendRadial={settings.wireBendRadial}
          bendSegments={settings.wireBendSegments}
          thickness={settings.wireThickness}
          floorRadius={settings.wireFloorRadius}
          attachRadius={settings.wireAttachRadius}
          direction="down"
          farEndY={0}
          seed={settings.activeSeed}
        />
      )}

      {settings.cubeEnabled && settings.topWiresEnabled && (
        <Wires
          active={active}
          cubeSize={settings.cubeSize}
          subdivisions={settings.cubeSubdivisions}
          // For "up" direction, cubeBottomY carries the live cube TOP Y
          // baseline (initial static value — the live ref drives per-frame).
          cubeBottomY={cubeY + settings.cubeSize / 2}
          cubeX={cubeX}
          cubeZ={cubeZ}
          // Reuse liveBottomYRef slot for the live anchor: pass the top ref.
          liveBottomYRef={liveTopYRef}
          color={settings.topWireColor}
          opacity={settings.topWireOpacity}
          count={settings.topWireCount}
          drift={settings.topWireDrift}
          topFade={settings.topWireTopFade}
          bottomFade={settings.topWireBottomFade}
          flowSpeed={settings.topWireFlowSpeed}
          flowDensity={settings.topWireFlowDensity}
          flowDuty={settings.topWireFlowDuty}
          flowRandomness={settings.topWireFlowRandomness}
          bend={settings.topWireBend}
          bendRadial={settings.topWireBendRadial}
          bendSegments={settings.topWireBendSegments}
          thickness={settings.topWireThickness}
          attachRadius={settings.topWireAttachRadius}
          direction="up"
          // Up wires encode upward LENGTH in farEndY.
          farEndY={settings.topWireHeight * 0.1}
          seed={settings.activeSeed + 101}
        />
      )}

      <EffectComposer>
        <Bloom
          intensity={settings.bloomIntensity}
          luminanceThreshold={settings.bloomThreshold / 100}
          luminanceSmoothing={settings.bloomSmoothing / 100}
          mipmapBlur
        />
        <Vignette
          offset={0.3}
          darkness={settings.vignette / 100}
          eskil={false}
        />
      </EffectComposer>
    </>
  );
}
