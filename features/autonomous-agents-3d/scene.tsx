"use client";
/* eslint-disable react-hooks/immutability -- WebGL uniforms mutate .value in useFrame by design */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { FoundationBatch } from "./foundation-batch";
import { LayerNameLabel } from "./layer-name-label";
import { Environment, Lightformer, MeshTransmissionMaterial } from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import type {
  ContentType,
  FrameShape,
  GlassEnv,
  LayerConcept,
  StrataSettings,
} from "./defaults";

function seededPrng(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967295;
  };
}

function baseWaveHeightAt(
  x: number,
  z: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
) {
  const bias = Math.pow(layerT, 1.6);
  const topAmp = 0.05;
  const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
  const scale = topAmp + bias * (bottomAmp - topAmp);
  const amp = (amplitude / 100) * scale;
  const s = 0.08 + waveScale * 0.008;
  const w =
    Math.sin(x * s + seed) * Math.cos(z * s * 0.9 + seed * 1.7) * 0.55 +
    Math.sin(x * s * 1.6 + z * s * 1.2 + seed * 2.3) * 0.28 +
    Math.sin(Math.sqrt(x * x + z * z) * s * 0.85 - seed * 0.5) * 0.32;
  return w * amp;
}

type ContentPositions = {
  positions: [number, number, number][];
  edges: [number, number][]; // pair indices into positions, for network
  heightFactors?: number[]; // per-position height multiplier (data-foundation)
  /** Fraction of the box cell size to leave as gap (0..0.45). */
  boxGapFrac?: number;
};

function generateFoundationLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
  count: number,
  variance: number,
  boxGap: number,
  minThickness: number,
): ContentPositions {
  const side = Math.max(1, Math.round(count));
  const half = planeSize * 0.48;
  const totalW = half * 2;
  const totalD = half * 2;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const rng = seededPrng(Math.floor(seed * 1000) + 2003);
  const positions: [number, number, number][] = [];
  const heightFactors: number[] = [];
  const vN = Math.min(1, Math.max(0, variance / 100));
  const minT = Math.min(1, Math.max(0, minThickness / 100));

  const boxGapFrac = Math.min(0.9, Math.max(0, boxGap / 100)) * 0.5;
  const stepX = totalW / side;
  const stepZ = totalD / side;

  for (let bx = 0; bx < side; bx += 1) {
    for (let bz = 0; bz < side; bz += 1) {
      const cx = -half + (bx + 0.5) * stepX;
      const cz = -half + (bz + 0.5) * stepZ;
      positions.push([cx, wh(cx, cz), cz]);
      const factor = 1 - vN + vN * rng();
      heightFactors.push(Math.max(minT, factor));
    }
  }

  return { positions, edges: [], heightFactors, boxGapFrac };
}

function generateLatticeLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
): { positions: [number, number, number][]; edges: [number, number][] } {
  const half = planeSize * 0.4;
  const gridN = 6;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const rng = seededPrng(Math.floor(seed * 1000) + 991);

  // Generate all grid intersections, deciding which are "real" nodes.
  const gridActive: boolean[] = [];
  const gridPos: [number, number, number][] = [];
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      const x = -half + (i / (gridN - 1)) * 2 * half;
      const z = -half + (j / (gridN - 1)) * 2 * half;
      const active = rng() < 0.45;
      const baseY = wh(x, z);
      // Selected nodes rise into "coherent local peaks".
      const lift = active ? 0.18 + rng() * 0.25 : 0;
      gridPos.push([x, baseY + lift, z]);
      gridActive.push(active);
    }
  }

  // Keep only the active positions; remap indices.
  const positions: [number, number, number][] = [];
  const gridToKept: number[] = new Array(gridPos.length).fill(-1);
  for (let k = 0; k < gridPos.length; k += 1) {
    if (gridActive[k]) {
      gridToKept[k] = positions.length;
      positions.push(gridPos[k]);
    }
  }

  // Connect adjacent active grid nodes (4-neighbour + 2 diagonals).
  const edges: [number, number][] = [];
  const idxOf = (i: number, j: number) => i * gridN + j;
  const neighbours: [number, number][] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let i = 0; i < gridN; i += 1) {
    for (let j = 0; j < gridN; j += 1) {
      const a = idxOf(i, j);
      if (!gridActive[a]) continue;
      for (const [di, dj] of neighbours) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gridN || nj >= gridN) continue;
        const b = idxOf(ni, nj);
        if (!gridActive[b]) continue;
        edges.push([gridToKept[a], gridToKept[b]]);
      }
    }
  }
  return { positions, edges };
}

function generatePlatformsLayout(
  planeSize: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
): [number, number, number][] {
  const half = planeSize * 0.35;
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed * 0.1);
  const out: [number, number, number][] = [];
  // 0 = center
  out.push([0, wh(0, 0), 0]);
  // 1..4 = cardinal satellites (back / left / right / front)
  const r = half * 0.7;
  out.push([0, wh(0, -r), -r]);
  out.push([-r, wh(-r, 0), 0]);
  out.push([r, wh(r, 0), 0]);
  out.push([0, wh(0, r), r]);
  // 5..N = edge dots along front + back rows
  const dots = 6;
  const edgeR = half * 1.05;
  for (let i = 0; i < dots; i += 1) {
    const t = i / (dots - 1);
    const x = -half + t * 2 * half;
    out.push([x, wh(x, edgeR), edgeR]);
    out.push([x, wh(x, -edgeR), -edgeR]);
  }
  return out;
}

function generatePositions(args: {
  type: ContentType;
  count: number;
  planeSize: number;
  layerT: number;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  layerIndex: number;
  contentSize: number;
  foundationCount: number;
  foundationVariance: number;
  foundationBoxGap: number;
  foundationMinThickness: number;
}): ContentPositions {
  const {
    type,
    count,
    planeSize,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    seed,
    layerIndex,
    foundationCount,
    foundationVariance,
    foundationBoxGap,
    foundationMinThickness,
  } = args;
  if (type === "none") return { positions: [], edges: [] };
  if (type === "data-foundation") {
    return generateFoundationLayout(
      planeSize,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed,
      foundationCount,
      foundationVariance,
      foundationBoxGap,
      foundationMinThickness,
    );
  }
  if (type === "platforms") {
    return {
      positions: generatePlatformsLayout(
        planeSize,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      ),
      edges: [],
    };
  }
  if (type === "lattice") {
    return generateLatticeLayout(
      planeSize,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed,
    );
  }
  const rng = seededPrng(Math.floor(seed * 1000) + layerIndex * 977 + 17);
  const half = planeSize * 0.42;
  const positions: [number, number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rng() * 2 - 1) * half;
    const z = (rng() * 2 - 1) * half;
    const wy = baseWaveHeightAt(
      x,
      z,
      layerT,
      amplitude,
      waveScale,
      bottomBias,
      seed * 0.1,
    );
    positions.push([x, wy, z]);
  }

  const edges: [number, number][] = [];
  if (type === "network" && positions.length > 1) {
    // Connect each node to its two nearest neighbours.
    for (let i = 0; i < positions.length; i += 1) {
      const [ax, , az] = positions[i];
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < positions.length; j += 1) {
        if (i === j) continue;
        const [bx, , bz] = positions[j];
        const dx = ax - bx;
        const dz = az - bz;
        dists.push({ j, d: dx * dx + dz * dz });
      }
      dists.sort((a, b) => a.d - b.d);
      const k = Math.min(2, dists.length);
      for (let n = 0; n < k; n += 1) {
        const j = dists[n].j;
        const key: [number, number] = i < j ? [i, j] : [j, i];
        if (!edges.some(([a, b]) => a === key[0] && b === key[1])) {
          edges.push(key);
        }
      }
    }
  }
  return { positions, edges };
}

const flowLineVertexShader = /* glsl */ `
  attribute float aLineT;
  varying float vT;
  void main() {
    vT = aLineT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const flowLineFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpeed;
  varying float vT;
  void main() {
    float phase = fract(vT * 2.5 - uTime * uSpeed * 0.5);
    float pulse = smoothstep(0.7, 0.9, phase)
                * (1.0 - smoothstep(0.9, 1.0, phase));
    float alpha = uOpacity * (0.28 + pulse * 0.9);
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function buildNearestLines(
  positions: [number, number, number][],
  k: number,
) {
  if (positions.length < 2) {
    return {
      positions: new Float32Array(),
      lineT: new Float32Array(),
    };
  }
  const seen = new Set<string>();
  const pos: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < positions.length; i += 1) {
    const [ax, , az] = positions[i];
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < positions.length; j += 1) {
      if (i === j) continue;
      const [bx, , bz] = positions[j];
      const dx = ax - bx;
      const dz = az - bz;
      dists.push({ j, d: dx * dx + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    const kk = Math.min(k, dists.length);
    for (let n = 0; n < kk; n += 1) {
      const j = dists[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const p = positions[i];
      const q = positions[j];
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      t.push(0, 1);
    }
  }
  return {
    positions: new Float32Array(pos),
    lineT: new Float32Array(t),
  };
}

function FlowLines({
  positions,
  color,
  opacity,
  speed,
}: {
  positions: [number, number, number][];
  color: string;
  opacity: number;
  speed: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const { positions: pos, lineT } = buildNearestLines(positions, 2);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aLineT", new THREE.BufferAttribute(lineT, 1));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color() },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
          uSpeed: { value: 0 },
        },
        vertexShader: flowLineVertexShader,
        fragmentShader: flowLineFragmentShader,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uOpacity.value = opacity;
    u.uSpeed.value = speed;
    u.uColor.value.set(color);
  });

  return <lineSegments geometry={geometry} material={material} />;
}

function ContentShape({
  type,
  size,
  color,
  opacity,
}: {
  type: ContentType;
  size: number;
  color: string;
  opacity: number;
}) {
  const s = Math.max(0.02, size);

  const boxEdges = useMemo(() => {
    if (type !== "cubes") return null;
    return new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s));
  }, [type, s]);
  useEffect(
    () => () => {
      if (boxEdges) boxEdges.dispose();
    },
    [boxEdges],
  );

  const tileEdges = useMemo(() => {
    if (type !== "tiles") return null;
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(s * 1.4, s * 0.14, s * 1.4),
    );
  }, [type, s]);
  useEffect(
    () => () => {
      if (tileEdges) tileEdges.dispose();
    },
    [tileEdges],
  );

  const diskEdges = useMemo(() => {
    if (type !== "disks") return null;
    return new THREE.EdgesGeometry(
      new THREE.CylinderGeometry(s * 0.6, s * 0.6, s * 0.5, 24, 1),
    );
  }, [type, s]);
  useEffect(
    () => () => {
      if (diskEdges) diskEdges.dispose();
    },
    [diskEdges],
  );

  if (type === "dots") {
    return (
      <mesh position={[0, s * 0.4, 0]}>
        <sphereGeometry args={[s * 0.3, 10, 10]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
    );
  }

  if (type === "network") {
    return (
      <mesh position={[0, s * 0.35, 0]}>
        <sphereGeometry args={[s * 0.3, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
    );
  }

  if (type === "tiles" && tileEdges) {
    return (
      <group position={[0, s * 0.08, 0]}>
        <mesh>
          <boxGeometry args={[s * 1.4, s * 0.14, s * 1.4]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.18}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={tileEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      </group>
    );
  }

  if (type === "cubes" && boxEdges) {
    return (
      <group position={[0, s * 0.5, 0]}>
        <mesh>
          <boxGeometry args={[s, s, s]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.14}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={boxEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      </group>
    );
  }

  if (type === "disks" && diskEdges) {
    return (
      <group position={[0, s * 0.25, 0]}>
        <mesh>
          <cylinderGeometry args={[s * 0.6, s * 0.6, s * 0.5, 24, 1]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.14}
            toneMapped={false}
          />
        </mesh>
        <lineSegments geometry={diskEdges}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
        <mesh position={[0, s * 0.25 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s * 0.2, s * 0.28, 24]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity * 0.7}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    );
  }

  return null;
}

function ConcentricPlatform({
  size,
  rings,
  color,
  opacity,
  nodeScale,
}: {
  size: number;
  rings: number[];
  color: string;
  opacity: number;
  nodeScale: number;
}) {
  const ringGeoms = useMemo(
    () =>
      rings.map(
        (r) =>
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * r, size * r)),
      ),
    [size, rings],
  );
  useEffect(
    () => () => ringGeoms.forEach((g) => g.dispose()),
    [ringGeoms],
  );

  const baseEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size * 0.08, size)),
    [size],
  );
  useEffect(() => () => baseEdges.dispose(), [baseEdges]);

  return (
    <group>
      {/* Base tile — subtle fill + crisp edge outline */}
      <mesh position={[0, size * 0.04, 0]}>
        <boxGeometry args={[size, size * 0.08, size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.12}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={baseEdges} position={[0, size * 0.04, 0]}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      {/* Nested square outlines above the tile */}
      {ringGeoms.map((g, i) => (
        <lineSegments
          key={i}
          geometry={g}
          position={[0, size * 0.09 + i * size * 0.008, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <lineBasicMaterial
            color={color}
            transparent
            opacity={opacity * (0.45 + i * 0.18)}
            depthWrite={false}
            toneMapped={false}
          />
        </lineSegments>
      ))}
      {/* Central sphere node — inner solid + outer soft glow so it reads clearly */}
      <mesh position={[0, size * 0.18, 0]}>
        <sphereGeometry args={[size * 0.11 * nodeScale, 18, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, size * 0.18, 0]}>
        <sphereGeometry args={[size * 0.22 * nodeScale, 18, 18]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.22}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function SatellitePlatform({
  size,
  color,
  opacity,
  nodeScale,
}: {
  size: number;
  color: string;
  opacity: number;
  nodeScale: number;
}) {
  const baseEdges = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size * 0.08, size)),
    [size],
  );
  useEffect(() => () => baseEdges.dispose(), [baseEdges]);
  return (
    <group>
      <mesh position={[0, size * 0.04, 0]}>
        <boxGeometry args={[size, size * 0.08, size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.14}
          toneMapped={false}
        />
      </mesh>
      <lineSegments geometry={baseEdges} position={[0, size * 0.04, 0]}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <mesh position={[0, size * 0.16, 0]}>
        <sphereGeometry args={[size * 0.1 * nodeScale, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, size * 0.16, 0]}>
        <sphereGeometry args={[size * 0.2 * nodeScale, 14, 14]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity * 0.22}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function EdgeDot({
  size,
  color,
  opacity,
}: {
  size: number;
  color: string;
  opacity: number;
}) {
  return (
    <mesh position={[0, size * 0.5, 0]}>
      <sphereGeometry args={[size * 0.28, 10, 10]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity * 0.85}
        toneMapped={false}
      />
    </mesh>
  );
}

function LayerContent({
  type,
  positions,
  edges,
  heightFactors,
  boxGapFrac,
  layerY,
  color,
  size,
  opacity,
  connect,
  flowSpeed,
  bob,
  layerIndex,
  sharedUniforms,
  platformColor,
  platformScale,
  platformHeight,
  platformNodeSize,
  foundationColor,
  foundationBlockSize,
  foundationMaxHeight,
  foundationFillOpacity,
  foundationEdgeOpacity,
}: {
  type: ContentType;
  positions: [number, number, number][];
  edges: [number, number][];
  heightFactors?: number[];
  boxGapFrac?: number;
  layerY: number;
  color: string;
  size: number;
  opacity: number;
  connect: boolean;
  flowSpeed: number;
  bob: number;
  layerIndex: number;
  sharedUniforms: LayerUniforms;
  platformColor: string;
  platformScale: number;
  platformHeight: number;
  platformNodeSize: number;
  foundationColor: string;
  foundationBlockSize: number;
  foundationMaxHeight: number;
  foundationFillOpacity: number;
  foundationEdgeOpacity: number;
}) {
  const latticeEdgeGeom = useMemo(() => {
    if (type !== "lattice" || edges.length === 0 || positions.length === 0) {
      return null;
    }
    const verts: number[] = [];
    for (const [a, b] of edges) {
      const p = positions[a];
      const q = positions[b];
      if (!p || !q) continue;
      verts.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(verts), 3),
    );
    return g;
  }, [type, edges, positions]);
  useEffect(
    () => () => {
      if (latticeEdgeGeom) latticeEdgeGeom.dispose();
    },
    [latticeEdgeGeom],
  );
  const groupRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state) => {
    if (type === "data-foundation") return;
    const t = state.clock.elapsedTime;
    const bobAmp = (bob / 100) * size * 0.6;
    const rotAmp = (bob / 100) * 0.6;
    const cursor = sharedUniforms.uCursor.value;
    const active = sharedUniforms.uActive.value;
    const radius = sharedUniforms.uRadius.value;
    const vReach = sharedUniforms.uVerticalReach.value;
    const strength = sharedUniforms.uStrength.value;
    const rotates =
      type === "cubes" ||
      type === "tiles" ||
      type === "disks" ||
      type === "platforms";
    for (let i = 0; i < positions.length; i += 1) {
      const g = groupRefs.current[i];
      if (!g) continue;
      const [px, py, pz] = positions[i];
      // Same anisotropic cursor gaussian the mesh shader uses.
      const dx = px - cursor.x;
      const dz = pz - cursor.z;
      const dh2 = dx * dx + dz * dz;
      const worldY = layerY + py;
      const dv = worldY - cursor.y;
      const bump =
        Math.exp(-dh2 / (radius * radius) - (dv * dv) / (vReach * vReach)) *
        strength *
        active;
      const phase = i * 0.73 + layerIndex * 1.31;
      const bobOffset = bob > 0 ? Math.sin(t * 0.9 + phase) * bobAmp : 0;
      g.position.y = py + bump + bobOffset;
      if (rotates) {
        // Platforms rotate very gently — center more than satellites.
        const rateBase = type === "platforms" ? 0.08 : 0.15;
        g.rotation.y = t * rateBase * rotAmp + phase;
      }
    }
  });

  if (type === "none" || positions.length === 0) return null;

  if (type === "data-foundation") {
    const gapFrac = Math.min(0.45, boxGapFrac ?? 0);
    return <FoundationBatch positions={positions} heightFactors={heightFactors}
      width={(foundationBlockSize / 100) * size * 2.4 * (1 - gapFrac * 2)}
      maxHeight={(foundationMaxHeight / 100) * size * 4}
      layerY={layerY} layerIndex={layerIndex} size={size} bob={bob}
      color={foundationColor || color}
      fillOpacity={opacity * foundationFillOpacity / 100}
      edgeOpacity={opacity * foundationEdgeOpacity / 100}
      sharedUniforms={sharedUniforms} />;
  }

  if (type === "lattice") {
    return (
      <group position={[0, layerY, 0]}>
        {positions.map((p, i) => (
          <group
            key={i}
            ref={(el) => {
              groupRefs.current[i] = el;
            }}
            position={p}
          >
            {/* Ivory node — inner solid + subtle glow so junctions read clearly */}
            <mesh>
              <sphereGeometry args={[size * 0.22, 12, 12]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity}
                toneMapped={false}
              />
            </mesh>
            <mesh>
              <sphereGeometry args={[size * 0.4, 12, 12]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={opacity * 0.18}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}
        {latticeEdgeGeom && (
          <lineSegments geometry={latticeEdgeGeom}>
            <lineBasicMaterial
              color={color}
              transparent
              opacity={opacity * 0.75}
              depthWrite={false}
              toneMapped={false}
            />
          </lineSegments>
        )}
      </group>
    );
  }

  if (type === "platforms") {
    const pColor = platformColor || color;
    const pScale = platformScale / 100;
    const nodeScale = platformNodeSize / 100;
    const lift = (platformHeight / 100) * size * 3;
    // Lifted positions — platforms sit above the mesh surface by `lift`.
    const liftedPositions = positions.map(
      ([x, y, z]) => [x, y + lift, z] as [number, number, number],
    );
    return (
      <group position={[0, layerY, 0]}>
        {liftedPositions.map((p, i) => {
          const shape =
            i === 0 ? (
              <ConcentricPlatform
                size={size * 3.6 * pScale}
                rings={[1, 0.72, 0.48, 0.28]}
                color={pColor}
                opacity={opacity}
                nodeScale={nodeScale}
              />
            ) : i < 5 ? (
              <SatellitePlatform
                size={size * 1.6 * pScale}
                color={pColor}
                opacity={opacity}
                nodeScale={nodeScale}
              />
            ) : (
              <EdgeDot
                size={size * 0.55 * pScale}
                color={pColor}
                opacity={opacity}
              />
            );
          return (
            <group
              key={i}
              ref={(el) => {
                groupRefs.current[i] = el;
              }}
              position={p}
            >
              {shape}
            </group>
          );
        })}
        {connect && liftedPositions.length >= 5 && (
          <FlowLines
            positions={liftedPositions.slice(0, 5)}
            color={pColor}
            opacity={opacity * 0.55}
            speed={flowSpeed / 30}
          />
        )}
      </group>
    );
  }

  // Flow lines connect only lighter content types visually.
  const showLines =
    connect && (type === "dots" || type === "tiles" || type === "network");

  return (
    <group position={[0, layerY, 0]}>
      {positions.map((p, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el;
          }}
          position={p}
        >
          <ContentShape
            type={type}
            size={size}
            color={color}
            opacity={opacity}
          />
        </group>
      ))}
      {showLines && (
        <FlowLines
          positions={positions}
          color={color}
          opacity={opacity * 0.75}
          speed={flowSpeed / 30}
        />
      )}
    </group>
  );
}

const layerVertexShader = /* glsl */ `
  uniform vec3 uCursor;
  uniform float uActive;
  uniform float uRadius;
  uniform float uVerticalReach;
  uniform float uStrength;
  uniform float uTime;
  uniform float uSeed;
  uniform float uIdleAmp;
  uniform float uIdleScale;
  uniform float uIdleSpeed;
  uniform float uLayerT;
  uniform float uLayerY;

  attribute vec3 color;
  varying vec3 vColor;
  varying vec2 vWorldXZ;

  void main() {
    vec3 p = position;

    // Cursor bump — anisotropic 3D gaussian. Horizontal (XZ) reach controls
    // spread, vertical (Y) reach controls how many layers feel it.
    // Vertex world-Y = uLayerY (layer offset) + p.y (CPU wave contribution).
    float vertexWorldY = uLayerY + p.y;
    vec2 diffXZ = p.xz - uCursor.xz;
    float dh = length(diffXZ);
    float dv = vertexWorldY - uCursor.y;
    float sh = max(uRadius, 0.0001);
    float sv = max(uVerticalReach, 0.0001);
    float bump = exp(-(dh * dh) / (sh * sh) - (dv * dv) / (sv * sv))
               * uStrength * uActive;

    // Idle seed-driven motion. Every layer breathes; a slight per-layer
    // phase offset keeps them from moving in lock-step.
    float t = uTime * uIdleSpeed;
    float s = uIdleScale;
    float ph = uSeed + uLayerT * 2.7;
    float idle =
        sin(p.x * s * 0.9 + t + ph * 1.1)
      * cos(p.z * s * 0.75 - t * 0.7 + ph) * 0.55
      + sin(p.x * s * 1.7 + p.z * s * 1.3 + t * 1.4 + ph * 1.7) * 0.28
      + sin(length(p.xz) * s * 0.6 - t * 1.2 + ph * 0.6) * 0.32;
    idle *= uIdleAmp;

    p.y += bump + idle;
    vColor = color;
    // World XZ (before any per-vertex Y displacement) drives the sparkle
    // SDF discard in the fragment shader.
    vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const layerFragmentShader = /* glsl */ `
  uniform float uOpacity;
  uniform vec2 uSparkleCenter;
  uniform float uSparkleRadius;
  uniform float uSparklePinch;
  uniform float uSparkleCut;
  uniform float uSparkleRotation;
  varying vec3 vColor;
  varying vec2 vWorldXZ;

  void main() {
    // 4-point pinched-sparkle SDF discard — carves a real hole in this
    // layer's wave in the exact silhouette of the sparkle mesh. Uses the
    // same polar boundary curve as the sparkle geometry: at angle θ from
    // a tip, r_boundary = R · (1 - (1 - p√2) · |sin(2θ)|^k). The sample
    // point is rotated by uSparkleRotation so the hole itself spins.
    if (uSparkleCut > 0.5) {
      vec2 rel = vWorldXZ - uSparkleCenter;
      float cs = cos(uSparkleRotation);
      float sn = sin(uSparkleRotation);
      rel = mat2(cs, -sn, sn, cs) * rel;
      float r = length(rel);
      if (r < uSparkleRadius) {
        float theta = atan(rel.y, rel.x);
        float f = pow(abs(sin(2.0 * theta)), 1.15);
        float rBoundary =
          uSparkleRadius * (1.0 - (1.0 - uSparklePinch * 1.41421356) * f);
        if (r < rBoundary) discard;
      }
    }
    // Scale down before additive blend so stacked overlapping lines stay
    // within the tone-map shoulder instead of clipping to white.
    gl_FragColor = vec4(vColor * 0.55, uOpacity);
  }
`;

/** Uniforms shared by every layer material — one instance per scene. */
export type LayerUniforms = {
  uCursor: { value: THREE.Vector3 };
  uActive: { value: number };
  uRadius: { value: number };
  uVerticalReach: { value: number };
  uStrength: { value: number };
  uTime: { value: number };
  uSeed: { value: number };
  uIdleAmp: { value: number };
  uIdleScale: { value: number };
  uIdleSpeed: { value: number };
  uOpacity: { value: number };
};


function buildLayerHeight(
  size: number,
  segments: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
) {
  const bias = Math.pow(layerT, 1.6);
  const topAmp = 0.05;
  const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
  const scale = topAmp + bias * (bottomAmp - topAmp);
  const amp = (amplitude / 100) * scale;
  const s = 0.08 + waveScale * 0.008;
  const half = size / 2;
  const step = size / segments;
  const grid: number[][] = [];
  for (let j = 0; j <= segments; j += 1) {
    const z = -half + j * step;
    const row: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const x = -half + i * step;
      const w =
        Math.sin(x * s + seed) * Math.cos(z * s * 0.9 + seed * 1.7) * 0.55 +
        Math.sin(x * s * 1.6 + z * s * 1.2 + seed * 2.3) * 0.28 +
        Math.sin(Math.sqrt(x * x + z * z) * s * 0.85 - seed * 0.5) * 0.32;
      row.push(w * amp);
    }
    grid.push(row);
  }
  return grid;
}

function colorAt(
  x: number,
  z: number,
  size: number,
  layerT: number,
  gold: THREE.Color,
  core: THREE.Color,
  edge: THREE.Color,
) {
  // Layer colour (`gold`) is now dominant. Core & Edge only add subtle
  // rim/pool tinting so distinct per-layer colours read clearly.
  const halfDiag = (size / 2) * Math.SQRT2;
  const r = Math.min(1, Math.sqrt(x * x + z * z) / halfDiag);
  const bottomWeight = Math.pow(layerT, 1.6);
  const pool = Math.max(0, 1 - Math.pow(r / 0.7, 1.4)) * bottomWeight;
  const rim = Math.pow(r, 1.2);
  const base = gold.clone();
  base.lerp(edge, rim * 0.18);
  base.lerp(core, Math.min(0.45, pool * 0.5));
  return base;
}

type LayerGeom = {
  y: number;
  positions: Float32Array;
  colors: Float32Array;
};

type ConceptSegment = {
  a: [number, number, number];
  b: [number, number, number];
  /** 0.25 = quiet supporting strand, 0.7 = meaningful path, 1.0 = active accent. */
  weight: number;
};

/** Push subdivided segments along a straight XZ path so the line follows the wave. */
function pushPath(
  out: ConceptSegment[],
  a: [number, number],
  b: [number, number],
  subDivs: number,
  weight: number,
  wh: (x: number, z: number) => number,
) {
  for (let s = 0; s < subDivs; s += 1) {
    const t1 = s / subDivs;
    const t2 = (s + 1) / subDivs;
    const x1 = a[0] + (b[0] - a[0]) * t1;
    const z1 = a[1] + (b[1] - a[1]) * t1;
    const x2 = a[0] + (b[0] - a[0]) * t2;
    const z2 = a[1] + (b[1] - a[1]) * t2;
    out.push({
      a: [x1, wh(x1, z1), z1],
      b: [x2, wh(x2, z2), z2],
      weight,
    });
  }
}

/** Draw a rectangular grid patch (dense grid inside a bounded XZ region). */
function pushGridPatch(
  out: ConceptSegment[],
  cx: number,
  cz: number,
  halfSize: number,
  cells: number,
  weight: number,
  wh: (x: number, z: number) => number,
) {
  const step = (halfSize * 2) / cells;
  for (let j = 0; j <= cells; j += 1) {
    const z = cz - halfSize + j * step;
    for (let i = 0; i < cells; i += 1) {
      const x1 = cx - halfSize + i * step;
      const x2 = x1 + step;
      out.push({
        a: [x1, wh(x1, z), z],
        b: [x2, wh(x2, z), z],
        weight,
      });
    }
  }
  for (let i = 0; i <= cells; i += 1) {
    const x = cx - halfSize + i * step;
    for (let j = 0; j < cells; j += 1) {
      const z1 = cz - halfSize + j * step;
      const z2 = z1 + step;
      out.push({
        a: [x, wh(x, z1), z1],
        b: [x, wh(x, z2), z2],
        weight,
      });
    }
  }
}

function buildDataSegments(
  size: number,
  segments: number,
  wh: (x: number, z: number) => number,
): ConceptSegment[] {
  // 4 distinct source patches (2×2), separated by low-density corridors.
  const out: ConceptSegment[] = [];
  const cell = size * 0.18;
  const centers: [number, number][] = [
    [-size * 0.22, -size * 0.22],
    [size * 0.22, -size * 0.22],
    [-size * 0.22, size * 0.22],
    [size * 0.22, size * 0.22],
  ];
  const patchN = Math.max(6, Math.round(segments * 0.35));
  for (const [cx, cz] of centers) {
    pushGridPatch(out, cx, cz, cell, patchN, 0.75, wh);
  }
  // Quiet supporting strands crossing the corridors — very few, low weight.
  const outerHalf = size * 0.45;
  const nCross = 3;
  for (let k = 0; k < nCross; k += 1) {
    const frac = (k + 0.5) / nCross;
    const x = -outerHalf + frac * (outerHalf * 2);
    pushPath(out, [x, -outerHalf], [x, outerHalf], 16, 0.22, wh);
    const z = -outerHalf + frac * (outerHalf * 2);
    pushPath(out, [-outerHalf, z], [outerHalf, z], 16, 0.22, wh);
  }
  return out;
}

function buildOntologySegments(
  size: number,
  segments: number,
  wh: (x: number, z: number) => number,
): ConceptSegment[] {
  const out: ConceptSegment[] = [];
  const outerHalf = size * 0.45;
  // Quiet supporting strands — sparse background grid.
  const spacing = Math.max(3, Math.round(segments / 8));
  for (let j = 0; j <= segments; j += spacing) {
    const z = -outerHalf + (j / segments) * (outerHalf * 2);
    pushPath(out, [-outerHalf, z], [outerHalf, z], 12, 0.2, wh);
  }
  for (let i = 0; i <= segments; i += spacing) {
    const x = -outerHalf + (i / segments) * (outerHalf * 2);
    pushPath(out, [x, -outerHalf], [x, outerHalf], 12, 0.2, wh);
  }
  // 4 object clusters — small dense grid patches.
  const clusters: [number, number][] = [
    [-size * 0.28, -size * 0.22],
    [size * 0.3, -size * 0.28],
    [-size * 0.05, size * 0.28],
    [size * 0.32, size * 0.2],
  ];
  for (const [cx, cz] of clusters) {
    pushGridPatch(out, cx, cz, size * 0.06, 3, 0.9, wh);
  }
  // Explicit relationship strands between selected cluster pairs.
  const rels: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ];
  for (const [a, b] of rels) {
    pushPath(out, clusters[a], clusters[b], 20, 0.7, wh);
  }
  return out;
}

function buildLogicSegments(
  size: number,
  wh: (x: number, z: number) => number,
): ConceptSegment[] {
  const out: ConceptSegment[] = [];
  const outerHalf = size * 0.45;
  // 3 main horizontal channels, each with a Y-fork at ~55% width.
  const zLevels = [-outerHalf * 0.6, 0, outerHalf * 0.6];
  for (const z0 of zLevels) {
    const forkX = -outerHalf + outerHalf * 2 * 0.55;
    // Trunk (left → fork)
    pushPath(out, [-outerHalf, z0], [forkX, z0], 22, 0.75, wh);
    // Branches (fork → right, splitting up and down)
    const branchOff = size * 0.09;
    pushPath(out, [forkX, z0], [outerHalf, z0 + branchOff], 22, 0.7, wh);
    pushPath(out, [forkX, z0], [outerHalf, z0 - branchOff], 22, 0.7, wh);
  }
  // Faint corridor traces around the channels for continuity.
  for (const z0 of [-outerHalf * 0.85, outerHalf * 0.85]) {
    pushPath(out, [-outerHalf, z0], [outerHalf, z0], 14, 0.18, wh);
  }
  return out;
}

function buildOrchestrationSegments(
  size: number,
  wh: (x: number, z: number) => number,
): ConceptSegment[] {
  const out: ConceptSegment[] = [];
  const outerHalf = size * 0.45;
  const inputs: [number, number][] = [
    [-outerHalf, -outerHalf * 0.55],
    [-outerHalf, outerHalf * 0.55],
    [outerHalf * 0.15, -outerHalf],
    [outerHalf * 0.15, outerHalf],
  ];
  const outputs: [number, number][] = [
    [outerHalf, -outerHalf * 0.6],
    [outerHalf, 0],
    [outerHalf, outerHalf * 0.6],
  ];
  // Converge to central junction
  for (const inp of inputs) {
    pushPath(out, inp, [0, 0], 22, 0.7, wh);
  }
  // Diverge from junction to outputs
  for (const outp of outputs) {
    pushPath(out, [0, 0], outp, 22, 0.7, wh);
  }
  // Compact junction grid at the centre — recognizable coordination region.
  pushGridPatch(out, 0, 0, size * 0.05, 3, 1.0, wh);
  // Faint background strands so the junction feels seated in the mesh.
  for (const zFrac of [-0.85, 0.85]) {
    const z = zFrac * outerHalf;
    pushPath(out, [-outerHalf, z], [outerHalf, z], 14, 0.18, wh);
  }
  return out;
}

function buildOutputsSegments(
  size: number,
  wh: (x: number, z: number) => number,
): ConceptSegment[] {
  const out: ConceptSegment[] = [];
  const outerHalf = size * 0.45;
  // 4 parallel routes, each terminating in a small dense endpoint patch.
  const rows = [-outerHalf * 0.65, -outerHalf * 0.22, outerHalf * 0.22, outerHalf * 0.65];
  const endX = outerHalf * 0.62;
  for (const z of rows) {
    pushPath(out, [-outerHalf, z], [endX, z], 24, 0.65, wh);
    pushGridPatch(out, endX + size * 0.05, z, size * 0.05, 3, 1.0, wh);
  }
  // Very quiet supporting strands so endpoints are seated in the layer.
  for (const zFrac of [-0.9, 0.9]) {
    pushPath(out, [-outerHalf, zFrac * outerHalf], [outerHalf, zFrac * outerHalf], 14, 0.16, wh);
  }
  return out;
}

function buildConceptLayer(
  concept: Exclude<LayerConcept, "uniform">,
  size: number,
  segments: number,
  y: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
  color: string,
): LayerGeom {
  const wh = (x: number, z: number) =>
    baseWaveHeightAt(x, z, layerT, amplitude, waveScale, bottomBias, seed);
  const list: ConceptSegment[] =
    concept === "data"
      ? buildDataSegments(size, segments, wh)
      : concept === "ontology"
        ? buildOntologySegments(size, segments, wh)
        : concept === "logic"
          ? buildLogicSegments(size, wh)
          : concept === "orchestration"
            ? buildOrchestrationSegments(size, wh)
            : buildOutputsSegments(size, wh);
  const positions = new Float32Array(list.length * 2 * 3);
  const colors = new Float32Array(list.length * 2 * 3);
  const gold = new THREE.Color(color);
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    const off = i * 6;
    positions[off + 0] = s.a[0];
    positions[off + 1] = s.a[1];
    positions[off + 2] = s.a[2];
    positions[off + 3] = s.b[0];
    positions[off + 4] = s.b[1];
    positions[off + 5] = s.b[2];
    const w = s.weight;
    colors[off + 0] = gold.r * w;
    colors[off + 1] = gold.g * w;
    colors[off + 2] = gold.b * w;
    colors[off + 3] = gold.r * w;
    colors[off + 4] = gold.g * w;
    colors[off + 5] = gold.b * w;
  }
  return { y, positions, colors };
}

function buildLayer(
  size: number,
  segments: number,
  y: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
  meshColor: string,
  coreColor: string,
  edgeColor: string,
): LayerGeom {
  const heights = buildLayerHeight(
    size,
    segments,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    seed,
  );
  const half = size / 2;
  const step = size / segments;

  const gold = new THREE.Color(meshColor);
  const core = new THREE.Color(coreColor);
  const edge = new THREE.Color(edgeColor);

  const segCount = segments * (segments + 1) * 2;
  const positions = new Float32Array(segCount * 2 * 3);
  const colors = new Float32Array(segCount * 2 * 3);
  let p = 0;
  let c = 0;

  const pushVertex = (x: number, yy: number, z: number, col: THREE.Color) => {
    positions[p++] = x;
    positions[p++] = yy;
    positions[p++] = z;
    colors[c++] = col.r;
    colors[c++] = col.g;
    colors[c++] = col.b;
  };

  for (let j = 0; j <= segments; j += 1) {
    const z = -half + j * step;
    for (let i = 0; i < segments; i += 1) {
      const x1 = -half + i * step;
      const x2 = -half + (i + 1) * step;
      const y1 = heights[j][i];
      const y2 = heights[j][i + 1];
      pushVertex(x1, y1, z, colorAt(x1, z, size, layerT, gold, core, edge));
      pushVertex(x2, y2, z, colorAt(x2, z, size, layerT, gold, core, edge));
    }
  }
  for (let i = 0; i <= segments; i += 1) {
    const x = -half + i * step;
    for (let j = 0; j < segments; j += 1) {
      const z1 = -half + j * step;
      const z2 = -half + (j + 1) * step;
      const y1 = heights[j][i];
      const y2 = heights[j + 1][i];
      pushVertex(x, y1, z1, colorAt(x, z1, size, layerT, gold, core, edge));
      pushVertex(x, y2, z2, colorAt(x, z2, size, layerT, gold, core, edge));
    }
  }

  return { y, positions, colors };
}

function WireLayer({
  layer,
  layerT,
  sharedUniforms,
  opacityOverride,
  sparkleCut,
}: {
  layer: LayerGeom;
  layerT: number;
  sharedUniforms: LayerUniforms;
  /** 0..1; when set, this layer's material uses its own uOpacity. */
  opacityOverride?: number;
  /** When present, the shader discards fragments inside the sparkle silhouette. */
  sparkleCut?: {
    centerXZ: [number, number];
    radius: number;
    pinch: number;
    /** Radians per second — the hole rotates around its centre over time. */
    spinRate: number;
  };
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(layer.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(layer.colors, 3));
    return g;
  }, [layer]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const hasOpacityOverride = opacityOverride !== undefined;
  const material = useMemo(() => {
    // When an override is provided, give the material its OWN uOpacity so it
    // isn't overwritten by the shared frame updates.
    const uniforms: Record<string, { value: unknown }> = {
      ...sharedUniforms,
      uLayerT: { value: layerT },
      uLayerY: { value: layer.y },
      uSparkleCenter: {
        value: new THREE.Vector2(0, 0),
      },
      uSparkleRadius: { value: 0 },
      uSparklePinch: { value: 0.2 },
      uSparkleCut: { value: 0 },
      uSparkleRotation: { value: 0 },
    };
    if (hasOpacityOverride) {
      uniforms.uOpacity = { value: 1 };
    }
    return new THREE.ShaderMaterial({
      uniforms,
      vertexShader: layerVertexShader,
      fragmentShader: layerFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: true,
    });
  }, [sharedUniforms, layerT, layer.y, hasOpacityOverride]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    if (opacityOverride !== undefined) {
      (material.uniforms.uOpacity as { value: number }).value = opacityOverride;
    }
    if (sparkleCut) {
      const u = material.uniforms;
      (u.uSparkleCenter.value as THREE.Vector2).set(
        sparkleCut.centerXZ[0],
        sparkleCut.centerXZ[1],
      );
      (u.uSparkleRadius as { value: number }).value = sparkleCut.radius;
      (u.uSparklePinch as { value: number }).value = sparkleCut.pinch;
      (u.uSparkleCut as { value: number }).value = 1;
      (u.uSparkleRotation as { value: number }).value =
        state.clock.elapsedTime * sparkleCut.spinRate;
    } else {
      (material.uniforms.uSparkleCut as { value: number }).value = 0;
    }
  });

  return (
    <lineSegments
      position={[0, layer.y, 0]}
      geometry={geometry}
      material={material}
    />
  );
}

// Shared by particles and wire anchors so their motion cannot drift apart.
const cloudMotionShader = /* glsl */ `
  vec3 cloudMotion(vec3 p, float aRand, float uTime, float uSpeed,
    float uEscapeHeight, float uJitter, float uSeed, float uLayerY,
    vec3 uCursor, float uActive, float uRadius, float uVerticalReach, float uStrength) {
    float t = uTime * uSpeed;
    float ph = aRand * 6.28318 + uSeed;

    // Sample a slowly-varying "flow field" so neighbouring particles move
    // similarly, but each has its own phase — reads as fluid churn.
    float fx = p.x * 0.7 + p.z * 0.4;
    float fy = p.y * 0.8 + p.x * 0.3;
    float fz = p.z * 0.7 + p.y * 0.5;

    vec3 off;
    off.x = sin(t * 0.9  + ph * 1.7 + fy) * 0.55
          + sin(t * 2.1  - ph * 2.3 + fz) * 0.30
          + sin(t * 3.7  + ph * 0.5 + fx) * 0.15;
    off.y = sin(t * 1.1  - ph * 1.3 + fx) * 0.55
          + sin(t * 2.7  + ph * 3.1 + fz) * 0.30
          + sin(t * 4.3  - ph * 0.9 + fy) * 0.15;
    off.z = sin(t * 0.7  + ph * 2.1 + fx) * 0.55
          + sin(t * 1.9  - ph * 1.7 + fy) * 0.30
          + sin(t * 3.1  + ph * 1.3 + fz) * 0.15;

    float H = uEscapeHeight * 0.02;
    // Contain the particle to the layer's slab: Y stays in [0, H] above the
    // wave surface (no dipping below), X/Z wander a small fraction of H so
    // the churn stays visually inside the layer.
    float LATERAL = 0.28;
    off.x *= H * LATERAL;
    off.z *= H * LATERAL;
    // Map off.y from [-1..1] to [0..H] with a smooth curve so particles
    // spend more time in the middle of the slab, less time pressed against
    // its floor/ceiling.
    float yNorm = clamp(off.y * 0.5 + 0.5, 0.0, 1.0);
    float ySmooth = yNorm * yNorm * (3.0 - 2.0 * yNorm);
    off.y = ySmooth * H;

    // Peakness — how close the particle is to the top of its slab —
    // ramps rattle jitter, so it reads as pushing against the ceiling.
    float peakness = clamp(off.y / max(H, 0.0001), 0.0, 1.0);
    float rattle = sin(uTime * 22.0 + ph * 5.7) * uJitter * 0.025 * peakness * H;
    off.y += rattle;
    // Lateral rattle stays inside the slab too.
    off.x += rattle * 0.35;
    off.z += rattle * 0.25;

    vec3 finalPos = p + off;

    // Cursor bump — same anisotropic 3D gaussian the wave layers use, so
    // the cloud reacts identically to hover.
    float vertexWorldY = uLayerY + finalPos.y;
    vec2 diffXZ = finalPos.xz - uCursor.xz;
    float dh = length(diffXZ);
    float dv = vertexWorldY - uCursor.y;
    float sh = max(uRadius, 0.0001);
    float sv = max(uVerticalReach, 0.0001);
    float bump = exp(-(dh * dh) / (sh * sh) - (dv * dv) / (sv * sv))
               * uStrength * uActive;
    finalPos.y += bump;

    return finalPos;
  }
`;

const cloudVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uEscapeHeight;
  uniform float uJitter;
  uniform float uSize;
  uniform float uSeed;

  uniform vec3  uCursor;
  uniform float uActive;
  uniform float uRadius;
  uniform float uVerticalReach;
  uniform float uStrength;
  uniform float uLayerY;

  attribute float aRand;

  varying float vDepth;
  varying float vShade;
  varying float vMix;
  ${cloudMotionShader}

  void main() {
    vec3 p = position;
    vec3 finalPos = cloudMotion(p, aRand, uTime, uSpeed, uEscapeHeight,
      uJitter, uSeed, uLayerY, uCursor, uActive, uRadius, uVerticalReach, uStrength);

    vec4 mvPos = modelViewMatrix * vec4(finalPos, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = uSize * (200.0 / -mvPos.z);

    // Distance-fade for atmospheric depth.
    vDepth = clamp(1.0 - (-mvPos.z - 4.0) / 45.0, 0.35, 1.0);
    // Per-particle brightness variation.
    vShade = 0.85 + fract(aRand * 43.317) * 0.25;
    // Per-particle color-mix seed — smoothed with a curve so we get clusters
    // of each colour rather than a uniform gradient.
    float m = fract(aRand * 17.13 + p.x * 0.021 + p.z * 0.017);
    vMix = smoothstep(0.15, 0.85, m);
  }
`;

const cloudFragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  varying float vDepth;
  varying float vShade;
  varying float vMix;

  void main() {
    // Recover a fake sphere normal from the point-sprite UV: circles of
    // radius 0.5 become hemispheres when we solve for z on the unit sphere.
    vec2 c = (gl_PointCoord - 0.5) * 2.0;   // -1..1
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float z = sqrt(1.0 - r2);
    // gl_PointCoord's Y axis is flipped vs. view Y, so negate it.
    vec3 n = vec3(c.x, -c.y, z);

    // Fixed key light from the upper-left front — matches the ref frames.
    vec3 L = normalize(vec3(-0.55, 0.75, 0.8));
    float diff = max(dot(n, L), 0.0);
    // Fresnel-flavoured rim so the silhouette pops.
    float rim = pow(1.0 - z, 2.4) * 0.35;
    // Specular — sharp highlight, small.
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(n, H), 0.0), 42.0) * 0.9;
    float amb = 0.32;

    // 2-stop palette from the Cloud section only — the layer's own colour
    // is ignored so the ball look never inherits the strata gold default.
    vec3 base = mix(uColorB, uColorC, vMix);
    vec3 lit = base * (amb + diff * 0.85) * vShade
             + vec3(spec)
             + base * rim * 0.6;
    // Distance fade darkens far particles slightly (aerial perspective).
    lit *= 0.55 + 0.45 * vDepth;
    gl_FragColor = vec4(lit, 1.0);
  }
`;

type CloudUniforms = {
  uTime: { value: number };
  uSpeed: { value: number };
  uEscapeHeight: { value: number };
  uJitter: { value: number };
  uSize: { value: number };
  uSeed: { value: number };
  uColorA: { value: THREE.Color };
  uColorB: { value: THREE.Color };
  uColorC: { value: THREE.Color };
  uCursor: { value: THREE.Vector3 };
  uActive: { value: number };
  uRadius: { value: number };
  uVerticalReach: { value: number };
  uStrength: { value: number };
  uLayerY: { value: number };
};

function buildCloudGeometry(
  size: number,
  density: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(density));
  const half = size / 2;
  const step = size / n;
  const count = (n + 1) * (n + 1);
  const positions = new Float32Array(count * 3);
  const rands = new Float32Array(count);
  const rng = seededPrng(Math.floor(seed * 1000) + 5501);
  let p = 0;
  let r = 0;
  for (let j = 0; j <= n; j += 1) {
    const z = -half + j * step;
    for (let i = 0; i <= n; i += 1) {
      const x = -half + i * step;
      const y = baseWaveHeightAt(
        x,
        z,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      );
      positions[p + 0] = x;
      positions[p + 1] = y;
      positions[p + 2] = z;
      rands[r] = rng();
      p += 3;
      r += 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
  return g;
}

function CloudLayer({
  layerY,
  layerT,
  color,
  colorB,
  colorC,
  size,
  density,
  amplitude,
  waveScale,
  bottomBias,
  seed,
  dotSize,
  escapeHeight,
  escapeSpeed,
  escapeJitter,
  phaseOffset,
  sharedUniforms,
}: {
  layerY: number;
  layerT: number;
  color: string;
  colorB: string;
  colorC: string;
  size: number;
  density: number;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  dotSize: number;
  escapeHeight: number;
  escapeSpeed: number;
  escapeJitter: number;
  phaseOffset: number;
  sharedUniforms: LayerUniforms;
}) {
  const geometry = useMemo(
    () =>
      buildCloudGeometry(
        size,
        density,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      ),
    [size, density, layerT, amplitude, waveScale, bottomBias, seed],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    // Share the cursor/idle uniforms by reference so `useFrame` writes in
    // the scene root flow through — same trick WireLayer uses.
    const uniforms: CloudUniforms = {
      uTime: { value: 0 },
      uSpeed: { value: Math.max(0.01, escapeSpeed / 100) },
      uEscapeHeight: { value: escapeHeight },
      uJitter: { value: escapeJitter / 100 },
      uSize: { value: dotSize * 200 },
      uSeed: { value: phaseOffset },
      uColorA: { value: new THREE.Color(color) },
      uColorB: { value: new THREE.Color(colorB) },
      uColorC: { value: new THREE.Color(colorC) },
      uCursor: sharedUniforms.uCursor,
      uActive: sharedUniforms.uActive,
      uRadius: sharedUniforms.uRadius,
      uVerticalReach: sharedUniforms.uVerticalReach,
      uStrength: sharedUniforms.uStrength,
      uLayerY: { value: layerY },
    };
    return new THREE.ShaderMaterial({
      uniforms: uniforms as unknown as Record<string, { value: unknown }>,
      vertexShader: cloudVertexShader,
      fragmentShader: cloudFragmentShader,
      transparent: false,
      depthWrite: true,
      depthTest: true,
      toneMapped: true,
      blending: THREE.NormalBlending,
    });
  }, [
    color,
    colorB,
    colorC,
    dotSize,
    escapeSpeed,
    escapeHeight,
    escapeJitter,
    phaseOffset,
    layerY,
    sharedUniforms,
  ]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const u = material.uniforms as unknown as CloudUniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uSpeed.value = Math.max(0.01, escapeSpeed / 100);
    u.uEscapeHeight.value = escapeHeight;
    u.uJitter.value = escapeJitter / 100;
    u.uSize.value = dotSize * 200;
    u.uColorA.value.set(color);
    u.uColorB.value.set(colorB);
    u.uColorC.value.set(colorC);
  });

  return (
    <points position={[0, layerY, 0]} geometry={geometry} material={material} />
  );
}

type AgentEdge = {
  a: number;
  b: number;
  horizontal: boolean;
};

type AgentSignal = {
  edgeIdx: number;
  dir: number; // +1 (a → b) or -1 (b → a)
  /** Distance along the current edge from its start endpoint, in world units. */
  posOnEdge: number;
  /** Cached edge length so we don't recompute per-frame. */
  edgeLen: number;
  /** 0..1 — brightness, decays exponentially with distance. */
  amplitude: number;
  alive: boolean;
};

function buildAgentLattice(
  size: number,
  gridN: number,
  layerT: number,
  amplitude: number,
  waveScale: number,
  bottomBias: number,
  seed: number,
) {
  const N = Math.max(2, Math.round(gridN));
  const half = size / 2;
  const step = size / (N - 1);
  const nodes: Array<[number, number, number]> = [];
  for (let r = 0; r < N; r += 1) {
    const z = -half + r * step;
    for (let c = 0; c < N; c += 1) {
      const x = -half + c * step;
      const y = baseWaveHeightAt(
        x,
        z,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      );
      nodes.push([x, y, z]);
    }
  }
  const edges: AgentEdge[] = [];
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N - 1; c += 1) {
      edges.push({ a: r * N + c, b: r * N + c + 1, horizontal: true });
    }
  }
  for (let c = 0; c < N; c += 1) {
    for (let r = 0; r < N - 1; r += 1) {
      edges.push({ a: r * N + c, b: (r + 1) * N + c, horizontal: false });
    }
  }
  // Adjacency: at each node, list of (edgeIdx, sideAtNode). sideAtNode = 0
  // if the node is the edge's a-endpoint, 1 if it's b.
  const adj: Array<Array<{ edgeIdx: number; side: 0 | 1 }>> = nodes.map(
    () => [],
  );
  edges.forEach((e, i) => {
    adj[e.a].push({ edgeIdx: i, side: 0 });
    adj[e.b].push({ edgeIdx: i, side: 1 });
  });
  // Precompute edge lengths (world units — respects wave-warped Y).
  const edgeLen = new Float32Array(edges.length);
  for (let i = 0; i < edges.length; i += 1) {
    const a = nodes[edges[i].a];
    const b = nodes[edges[i].b];
    edgeLen[i] = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  // Classify boundary edges — those touching the outer rows/cols. Signals
  // spawn here so waves flow inward, matching the reference macro-pattern.
  const boundaryEdges: number[] = [];
  edges.forEach((e, i) => {
    const rA = Math.floor(e.a / N);
    const cA = e.a % N;
    const rB = Math.floor(e.b / N);
    const cB = e.b % N;
    const onEdgeA = rA === 0 || rA === N - 1 || cA === 0 || cA === N - 1;
    const onEdgeB = rB === 0 || rB === N - 1 || cB === 0 || cB === N - 1;
    if (onEdgeA && onEdgeB) boundaryEdges.push(i);
  });
  return { N, step, nodes, edges, adj, edgeLen, boundaryEdges };
}

function AgentLayer({
  layerY,
  layerT,
  size,
  gridN,
  amplitude,
  waveScale,
  bottomBias,
  seed,
  nodeSize,
  nodeColor,
  edgeOpacity,
  signalCount,
  signalSpeed,
  signalLength,
  signalThickness,
  signalColor,
  decayLength,
  refractory,
  junctionSplit,
  spawnRate,
  minAmplitude,
  arcCount,
  arcSpeed,
  arcBallSpeed,
  arcBallSize,
  arcLift,
  arcThickness,
  arcDashLength,
  arcGlow,
  arcColor,
  phaseOffset,
  sharedUniforms,
}: {
  layerY: number;
  layerT: number;
  size: number;
  gridN: number;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  nodeSize: number;
  nodeColor: string;
  edgeOpacity: number;
  signalCount: number;
  signalSpeed: number;
  signalLength: number;
  signalThickness: number;
  signalColor: string;
  decayLength: number;
  refractory: number;
  junctionSplit: boolean;
  spawnRate: number;
  minAmplitude: number;
  arcCount: number;
  arcSpeed: number;
  arcBallSpeed: number;
  arcBallSize: number;
  arcLift: number;
  arcThickness: number;
  arcDashLength: number;
  arcGlow: number;
  arcColor: string;
  phaseOffset: number;
  sharedUniforms: LayerUniforms;
}) {
  const lattice = useMemo(
    () =>
      buildAgentLattice(
        size,
        gridN,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      ),
    [size, gridN, layerT, amplitude, waveScale, bottomBias, seed],
  );

  // ─── Node point cloud ──────────────────────────────────────────────
  const nodeGeom = useMemo(() => {
    const positions = new Float32Array(lattice.nodes.length * 3);
    for (let i = 0; i < lattice.nodes.length; i += 1) {
      positions[i * 3 + 0] = lattice.nodes[i][0];
      positions[i * 3 + 1] = lattice.nodes[i][1];
      positions[i * 3 + 2] = lattice.nodes[i][2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [lattice.nodes]);
  useEffect(() => () => nodeGeom.dispose(), [nodeGeom]);

  const nodeMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: new THREE.Color(nodeColor),
        size: nodeSize * 0.001 * size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        toneMapped: false,
      }),
    [nodeColor, nodeSize, size],
  );
  useEffect(() => () => nodeMaterial.dispose(), [nodeMaterial]);

  // ─── Faint lattice edges ──────────────────────────────────────────
  const edgeGeom = useMemo(() => {
    const positions = new Float32Array(lattice.edges.length * 6);
    lattice.edges.forEach((e, i) => {
      const a = lattice.nodes[e.a];
      const b = lattice.nodes[e.b];
      positions[i * 6 + 0] = a[0];
      positions[i * 6 + 1] = a[1];
      positions[i * 6 + 2] = a[2];
      positions[i * 6 + 3] = b[0];
      positions[i * 6 + 4] = b[1];
      positions[i * 6 + 5] = b[2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [lattice.edges, lattice.nodes]);
  useEffect(() => () => edgeGeom.dispose(), [edgeGeom]);

  const edgeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: new THREE.Color(nodeColor),
        transparent: true,
        opacity: edgeOpacity / 100,
        depthWrite: false,
        toneMapped: false,
      }),
    [nodeColor, edgeOpacity],
  );
  useEffect(() => () => edgeMaterial.dispose(), [edgeMaterial]);

  // ─── Signal & node state (seeded, physics-based) ──────────────────
  const MAX_SIGNALS = 800;
  const signalsRef = useRef<AgentSignal[]>([]);
  const refractoryUntilRef = useRef<Float32Array>(
    new Float32Array(lattice.nodes.length),
  );
  const spawnAccumRef = useRef(0);
  const rngRef = useRef(
    seededPrng(Math.floor((seed + phaseOffset) * 1000) + 9001),
  );

  useEffect(() => {
    const rng = seededPrng(Math.floor((seed + phaseOffset) * 1000) + 9001);
    rngRef.current = rng;
    refractoryUntilRef.current = new Float32Array(lattice.nodes.length);
    // Seed the pool with `signalCount` boundary excitations so the layer
    // lights up immediately without waiting for the spawn rate to fill it.
    const initial = Math.min(
      MAX_SIGNALS,
      Math.max(0, Math.round(signalCount)),
    );
    const spawnEdges =
      lattice.boundaryEdges.length > 0
        ? lattice.boundaryEdges
        : lattice.edges.map((_, i) => i);
    signalsRef.current = Array.from({ length: initial }, () => {
      const edgeIdx = spawnEdges[Math.floor(rng() * spawnEdges.length)];
      const edgeLen = lattice.edgeLen[edgeIdx];
      return {
        edgeIdx,
        dir: rng() < 0.5 ? 1 : -1,
        posOnEdge: rng() * edgeLen,
        edgeLen,
        amplitude: 0.6 + rng() * 0.4,
        alive: true,
      };
    });
    spawnAccumRef.current = 0;
  }, [
    signalCount,
    seed,
    phaseOffset,
    lattice.nodes.length,
    lattice.edges,
    lattice.edgeLen,
    lattice.boundaryEdges,
  ]);

  // ─── Signal InstancedMesh (capsules) ──────────────────────────────
  const capsuleGeom = useMemo(() => {
    const g = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
    // Orient along +X so we can rotate cleanly by yaw for horizontal / depth
    // (default capsule is along Y).
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  useEffect(() => () => capsuleGeom.dispose(), [capsuleGeom]);

  const signalMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(signalColor),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        toneMapped: false,
      }),
    [signalColor],
  );
  useEffect(() => () => signalMaterial.dispose(), [signalMaterial]);

  const instancedRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const mesh = instancedRef.current;
    if (!mesh) return;
    // Clamp dt so a tab-switch doesn't advance signals by seconds.
    const dt = Math.min(0.05, delta);
    const now = state.clock.elapsedTime;

    // ── Physics parameters (all mapped to real world/second units) ──
    // Velocity in world units / second — scaled by lattice step so a value
    // of ~50 crosses roughly one edge interval per 20 ms at N=16.
    const v = (signalSpeed / 100) * lattice.step * 6;
    // Beer-Lambert 1/e distance. `decayLength` >= 99 means lossless
    // transmission (idealised waveguide / superconductor) — signals keep
    // full amplitude until they hit a refractory node.
    const attenPerStep =
      decayLength >= 99
        ? 1
        : Math.exp(
            -(v * dt) /
              Math.max(0.001, (decayLength / 100) * lattice.step * 8),
          );
    const refractoryDur = (refractory / 100) * 2; // 0..2 seconds
    const ampMin = minAmplitude / 100;
    const lenFrac = Math.max(0.05, signalLength / 100);
    const thickness = signalThickness * 0.001 * size;
    const rng = rngRef.current;
    const nodes = lattice.nodes;
    const edges = lattice.edges;
    const edgeLen = lattice.edgeLen;
    const adj = lattice.adj;
    const boundaryEdges = lattice.boundaryEdges;
    const refractoryUntil = refractoryUntilRef.current;
    const signals = signalsRef.current;

    // ── Propagate every alive signal ────────────────────────────────
    const spawned: AgentSignal[] = [];
    for (let i = 0; i < signals.length; i += 1) {
      const s = signals[i];
      if (!s.alive) continue;
      // Advance along edge.
      s.posOnEdge += v * dt * s.dir;
      // Exponential amplitude decay with distance travelled.
      s.amplitude *= attenPerStep;
      if (s.amplitude < ampMin) {
        s.alive = false;
        continue;
      }
      // Handle crossing a node — may recurse if edges are short + dt large.
      let guard = 0;
      while (s.alive && guard < 4) {
        guard += 1;
        const overshoot =
          s.posOnEdge > s.edgeLen
            ? s.posOnEdge - s.edgeLen
            : s.posOnEdge < 0
              ? -s.posOnEdge
              : 0;
        if (overshoot === 0) break;
        const arrivingAt =
          s.dir > 0 ? edges[s.edgeIdx].b : edges[s.edgeIdx].a;
        // Node refractory check — if it's still hot, signal is absorbed.
        if (now < refractoryUntil[arrivingAt]) {
          s.alive = false;
          break;
        }
        refractoryUntil[arrivingAt] = now + refractoryDur;
        // Outgoing edges — every neighbour except the one we came from.
        const options = adj[arrivingAt].filter(
          (o) => o.edgeIdx !== s.edgeIdx,
        );
        if (options.length === 0) {
          // Cul-de-sac — reflect.
          s.dir = -s.dir;
          s.posOnEdge = s.dir > 0 ? overshoot : s.edgeLen - overshoot;
          continue;
        }
        const n = options.length;
        // Energy-conserving split only when Junction Split is on; otherwise
        // the signal preserves full amplitude (idealised waveguide junction).
        const nextAmp = junctionSplit ? s.amplitude / Math.sqrt(n) : s.amplitude;
        if (junctionSplit && n > 1) {
          // Spawn (n-1) new signals for the other branches; the current
          // signal continues down options[0].
          for (let k = 1; k < n; k += 1) {
            const opt = options[k];
            const newLen = edgeLen[opt.edgeIdx];
            spawned.push({
              edgeIdx: opt.edgeIdx,
              dir: opt.side === 0 ? 1 : -1,
              posOnEdge: opt.side === 0 ? overshoot : newLen - overshoot,
              edgeLen: newLen,
              amplitude: nextAmp,
              alive: true,
            });
          }
        }
        const chosen = junctionSplit
          ? options[0]
          : options[Math.floor(rng() * n)];
        s.edgeIdx = chosen.edgeIdx;
        s.edgeLen = edgeLen[chosen.edgeIdx];
        s.dir = chosen.side === 0 ? 1 : -1;
        s.posOnEdge =
          chosen.side === 0 ? overshoot : s.edgeLen - overshoot;
        s.amplitude = nextAmp;
        if (s.amplitude < ampMin) {
          s.alive = false;
          break;
        }
      }
    }

    // Merge spawned signals; drop dead entries; cap by amplitude.
    const alive: AgentSignal[] = [];
    for (const s of signals) if (s.alive) alive.push(s);
    for (const s of spawned) if (s.alive) alive.push(s);

    // ── Poisson spawner at boundary edges ───────────────────────────
    // 100% of the slider maps to ~20 fresh boundary signals per second.
    const rate = (spawnRate / 100) * 20;
    spawnAccumRef.current += rate * dt;
    while (spawnAccumRef.current >= 1 && alive.length < MAX_SIGNALS) {
      spawnAccumRef.current -= 1;
      const eIdx =
        boundaryEdges.length > 0
          ? boundaryEdges[Math.floor(rng() * boundaryEdges.length)]
          : Math.floor(rng() * edges.length);
      const eLen = edgeLen[eIdx];
      alive.push({
        edgeIdx: eIdx,
        // Boundary spawn: face inward — pick direction based on which
        // endpoint sits on the outer border.
        dir: rng() < 0.5 ? 1 : -1,
        posOnEdge: rng() < 0.5 ? 0 : eLen,
        edgeLen: eLen,
        amplitude: 0.85 + rng() * 0.15,
        alive: true,
      });
    }

    // Cap population — cull lowest-amplitude first if we blew the ceiling.
    if (alive.length > MAX_SIGNALS) {
      alive.sort((a, b) => b.amplitude - a.amplitude);
      alive.length = MAX_SIGNALS;
    }
    signalsRef.current = alive;

    // ── Write per-instance matrix + colour ──────────────────────────
    const count = alive.length;
    for (let i = 0; i < count; i += 1) {
      const s = alive[i];
      const edge = edges[s.edgeIdx];
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      const eLen = s.edgeLen;
      const halfLen = (lenFrac * eLen) / 2;
      const p0 = Math.max(0, s.posOnEdge - halfLen);
      const p1 = Math.min(eLen, s.posOnEdge + halfLen);
      const pMid = (p0 + p1) / 2;
      const uMid = eLen > 0 ? pMid / eLen : 0;
      const midX = a[0] + (b[0] - a[0]) * uMid;
      const midY = a[1] + (b[1] - a[1]) * uMid;
      const midZ = a[2] + (b[2] - a[2]) * uMid;
      const segLen = p1 - p0;
      dummy.position.set(midX, midY, midZ);
      const yaw = Math.atan2(b[2] - a[2], b[0] - a[0]);
      dummy.rotation.set(0, -yaw, 0);
      dummy.scale.set(Math.max(0.001, segLen), thickness, thickness);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tmpColor.set(signalColor).multiplyScalar(Math.max(0, Math.min(1, s.amplitude)));
      mesh.setColorAt(i, tmpColor);
    }
    // Hide unused instances so old data doesn't linger.
    for (let i = count; i < mesh.count; i += 1) {
      dummy.position.set(0, 1e6, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = Math.max(count, mesh.count);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    void sharedUniforms;
  });

  return (
    <group position={[0, layerY, 0]}>
      <lineSegments geometry={edgeGeom} material={edgeMaterial} />
      <points geometry={nodeGeom} material={nodeMaterial} />
      <instancedMesh
        ref={instancedRef}
        args={[capsuleGeom, signalMaterial, MAX_SIGNALS]}
      />
      <AgentArcs
        nodes={lattice.nodes}
        size={size}
        arcCount={arcCount}
        arcSpeed={arcSpeed}
        arcBallSpeed={arcBallSpeed}
        arcBallSize={arcBallSize}
        arcLift={arcLift}
        arcThickness={arcThickness}
        arcDashLength={arcDashLength}
        arcGlow={arcGlow}
        arcColor={arcColor}
        seed={seed + phaseOffset * 0.71}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ *
 *  AgentArcs — bezier signal arcs racing between lattice nodes.       *
 *  Reuses the AgentLayer's node grid so arc endpoints land on nodes.  *
 * ------------------------------------------------------------------ */

type ArcEntry = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ctrl: THREE.Vector3;
  duration: number;
  startAt: number;
};

function makeArcBetweenNodes(
  nodes: Array<[number, number, number]>,
  liftPct: number,
  now: number,
  rand: () => number,
): ArcEntry {
  const i = Math.floor(rand() * nodes.length);
  let j = Math.floor(rand() * nodes.length);
  if (j === i) j = (j + 1 + Math.floor(rand() * (nodes.length - 1))) % nodes.length;
  const a = nodes[i];
  const b = nodes[j];
  const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lift = dist * (0.08 + (liftPct / 100) * 0.8);
  return {
    a: new THREE.Vector3(a[0], a[1], a[2]),
    b: new THREE.Vector3(b[0], b[1], b[2]),
    ctrl: new THREE.Vector3(
      (a[0] + b[0]) / 2,
      Math.max(a[1], b[1]) + lift + 0.05,
      (a[2] + b[2]) / 2,
    ),
    duration: 1.4 + rand() * 1.8,
    startAt: now + rand() * 0.5,
  };
}

function AgentArcs({
  nodes,
  size,
  arcCount,
  arcSpeed,
  arcBallSpeed,
  arcBallSize,
  arcLift,
  arcThickness,
  arcDashLength,
  arcGlow,
  arcColor,
  seed,
}: {
  nodes: Array<[number, number, number]>;
  size: number;
  arcCount: number;
  arcSpeed: number;
  arcBallSpeed: number;
  arcBallSize: number;
  arcLift: number;
  arcThickness: number;
  arcDashLength: number;
  arcGlow: number;
  arcColor: string;
  seed: number;
}) {
  const travelClock = useRef(0);
  const groupRef = useRef<THREE.Group>(null);
  const arcsRef = useRef<ArcEntry[]>([]);
  const meshesRef = useRef<
    Array<{
      geometryArc?: ArcEntry;
      line: THREE.Line;
      mat: THREE.ShaderMaterial;
      head: THREE.Mesh;
      headMat: THREE.MeshBasicMaterial;
      ringA: THREE.Mesh;
      ringB: THREE.Mesh;
      ringMatA: THREE.MeshBasicMaterial;
      ringMatB: THREE.MeshBasicMaterial;
    }>
  >([]);
  const randRef = useRef(seededPrng(Math.floor(seed * 1000) + 8117));

  const SAMPLES = 96;
  const clampedCount = Math.max(0, Math.min(120, Math.round(arcCount)));

  useEffect(() => {
    const group = groupRef.current;
    if (!group || nodes.length < 2) return;
    const disposePool = () => {
      for (const m of meshesRef.current) {
        m.line.geometry.dispose(); m.mat.dispose();
        m.head.geometry.dispose(); m.headMat.dispose();
        m.ringA.geometry.dispose(); m.ringB.geometry.dispose();
        m.ringMatA.dispose(); m.ringMatB.dispose();
        group.remove(m.line, m.head, m.ringA, m.ringB);
      }
      meshesRef.current = [];
      arcsRef.current = [];
    };
    disposePool();
    const rand = seededPrng(Math.floor(seed * 1000) + 8117);
    randRef.current = rand;
    const now = travelClock.current;

    for (let i = 0; i < clampedCount; i += 1) {
      const arc = makeArcBetweenNodes(nodes, arcLift, now - rand() * 2, rand);
      arcsRef.current.push(arc);

      const positions = new Float32Array(SAMPLES * 3);
      const distances = new Float32Array(SAMPLES);
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("aDist", new THREE.BufferAttribute(distances, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: 0 },
          uColor: { value: new THREE.Color(arcColor) },
          uGlow: { value: arcGlow / 100 },
          uDashLen: { value: arcDashLength / 100 },
          uSpeed: { value: arcSpeed / 20 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aDist;
          varying float vD;
          void main() {
            vD = aDist;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vD;
          uniform float uTime;
          uniform float uProgress;
          uniform vec3 uColor;
          uniform float uGlow;
          uniform float uDashLen;
          uniform float uSpeed;
          void main() {
            if (vD > uProgress) discard;
            float t = fract(vD * 6.0 - uTime * uSpeed);
            float dash = smoothstep(0.5, 0.5 - uDashLen, abs(t - 0.5));
            float tail = smoothstep(uProgress - 0.35, uProgress, vD);
            float head = smoothstep(0.0, 0.06, uProgress - vD);
            float base = 0.35 + 0.65 * dash;
            float intensity = base * (0.55 + 0.45 * head) * (0.6 + 0.4 * tail);
            vec3 col = uColor * (1.0 + uGlow * 1.5);
            gl_FragColor = vec4(col, intensity);
          }
        `,
      });

      const line = new THREE.Line(geom, mat);
      line.frustumCulled = false;
      group.add(line);

      const headGeom = new THREE.SphereGeometry(0.06, 10, 10);
      const headMat = new THREE.MeshBasicMaterial({
        color: arcColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const head = new THREE.Mesh(headGeom, headMat);
      head.frustumCulled = false;
      group.add(head);

      const ringGeom = new THREE.RingGeometry(0.08, 0.11, 24);
      const ringMatA = new THREE.MeshBasicMaterial({
        color: arcColor,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ringMatB = ringMatA.clone();
      const ringA = new THREE.Mesh(ringGeom, ringMatA);
      const ringB = new THREE.Mesh(ringGeom.clone(), ringMatB);
      ringA.frustumCulled = false;
      ringB.frustumCulled = false;
      group.add(ringA);
      group.add(ringB);

      meshesRef.current.push({
        line,
        mat,
        head,
        headMat,
        ringA,
        ringB,
        ringMatA,
        ringMatB,
      });
    }
    return disposePool;
  }, [clampedCount, seed, nodes, arcLift, arcColor, arcGlow, arcDashLength, arcSpeed]);

  useFrame((state, delta) => {
    // Integrate speed so changing it does not jump the ball along its arc.
    travelClock.current += delta * Math.max(0, arcBallSpeed / 100);
    const now = travelClock.current;
    const scale = (0.6 + arcThickness / 100 * 1.2) * Math.max(0.01, arcBallSize / 100);
    const meshes = meshesRef.current;
    for (let i = 0; i < meshes.length; i += 1) {
      const m = meshes[i];
      // Live uniform sync so color/glow/dash/speed are hot-editable.
      m.mat.uniforms.uColor.value.set(arcColor);
      m.mat.uniforms.uGlow.value = arcGlow / 100;
      m.mat.uniforms.uDashLen.value = arcDashLength / 100;
      m.mat.uniforms.uSpeed.value = arcSpeed / 20;
      m.mat.uniforms.uTime.value = state.clock.elapsedTime;
      m.headMat.color.set(arcColor);
      m.ringMatA.color.set(arcColor);
      m.ringMatB.color.set(arcColor);

      let arc = arcsRef.current[i];
      let prog = (now - arc.startAt) / arc.duration;
      if (prog > 1.35) {
        arcsRef.current[i] = makeArcBetweenNodes(
          nodes,
          arcLift,
          now,
          randRef.current,
        );
        arc = arcsRef.current[i];
        prog = 0;
      }

      const drawProg = Math.min(1, Math.max(0, prog / 0.55));
      m.mat.uniforms.uProgress.value = drawProg;

      // The curve is fixed for its lifetime; only progress/head motion changes.
      if (m.geometryArc !== arc) {
        const posAttr = m.line.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const distAttr = m.line.geometry.getAttribute(
          "aDist",
        ) as THREE.BufferAttribute;
        let lastX = 0;
        let lastY = 0;
        let lastZ = 0;
        let total = 0;
        for (let s = 0; s < SAMPLES; s += 1) {
          const u = s / (SAMPLES - 1);
          const omu = 1 - u;
          const x = omu * omu * arc.a.x + 2 * omu * u * arc.ctrl.x + u * u * arc.b.x;
          const y = omu * omu * arc.a.y + 2 * omu * u * arc.ctrl.y + u * u * arc.b.y;
          const z = omu * omu * arc.a.z + 2 * omu * u * arc.ctrl.z + u * u * arc.b.z;
          posAttr.setXYZ(s, x, y, z);
          if (s === 0) {
            distAttr.setX(s, 0);
          } else {
            total += Math.hypot(x - lastX, y - lastY, z - lastZ);
            distAttr.setX(s, total);
          }
          lastX = x;
          lastY = y;
          lastZ = z;
        }
        if (total > 0) {
          for (let s = 0; s < SAMPLES; s += 1) {
            distAttr.setX(s, distAttr.getX(s) / total);
          }
        }
        posAttr.needsUpdate = true;
        distAttr.needsUpdate = true;
        m.geometryArc = arc;
      }

      const uh = drawProg;
      const omuh = 1 - uh;
      const hx = omuh * omuh * arc.a.x + 2 * omuh * uh * arc.ctrl.x + uh * uh * arc.b.x;
      const hy = omuh * omuh * arc.a.y + 2 * omuh * uh * arc.ctrl.y + uh * uh * arc.b.y;
      const hz = omuh * omuh * arc.a.z + 2 * omuh * uh * arc.ctrl.z + uh * uh * arc.b.z;
      m.head.position.set(hx, hy, hz);
      m.headMat.opacity = drawProg < 1 ? 0.9 : Math.max(0, 0.4 * (1 - (prog - 0.55) / 0.35));
      m.head.scale.setScalar(scale * (drawProg < 1 ? 1 : 0.4));

      m.ringA.position.copy(arc.a);
      m.ringB.position.copy(arc.b);
      m.ringA.lookAt(state.camera.position);
      m.ringB.lookAt(state.camera.position);

      const aAge = prog;
      m.ringMatA.opacity = Math.max(0, 0.9 - aAge * 2.4);
      m.ringA.scale.setScalar(0.5 + aAge * 2.5);

      const bAge = Math.max(0, prog - 0.55);
      m.ringMatB.opacity = Math.max(0, 0.95 - bAge * 2.2);
      m.ringB.scale.setScalar(0.5 + bAge * 3.2);
    }
    void size;
  });

  return <group ref={groupRef} />;
}

/* ------------------------------------------------------------------ *
 *  TerrainLayer — dotted heightmap with elevation color ramp.        *
 * ------------------------------------------------------------------ */

function TerrainLayer({
  layerY,
  layerT,
  size,
  gridN,
  dotSize,
  opacity,
  heightScale,
  rampC0,
  rampC1,
  rampC2,
  rampC3,
  rampC4,
  rampC5,
  amplitude,
  waveScale,
  bottomBias,
  seed,
  arcCount,
  arcSpeed,
  arcBallSpeed,
  arcBallSize,
  arcLift,
  arcThickness,
  arcDashLength,
  arcGlow,
  arcColor,
}: {
  layerY: number;
  layerT: number;
  size: number;
  gridN: number;
  dotSize: number;
  opacity: number;
  heightScale: number;
  rampC0: string;
  rampC1: string;
  rampC2: string;
  rampC3: string;
  rampC4: string;
  rampC5: string;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
  arcCount: number;
  arcSpeed: number;
  arcBallSpeed: number;
  arcBallSize: number;
  arcLift: number;
  arcThickness: number;
  arcDashLength: number;
  arcGlow: number;
  arcColor: string;
}) {
  const { geometry, uniforms } = useMemo(() => {
    const N = Math.max(20, Math.floor(gridN));
    const half = size / 2;
    const step = size / (N - 1);
    const positions = new Float32Array(N * N * 3);
    const heights = new Float32Array(N * N);
    let minH = Infinity;
    let maxH = -Infinity;
    for (let iz = 0; iz < N; iz += 1) {
      for (let ix = 0; ix < N; ix += 1) {
        const x = -half + ix * step;
        const z = -half + iz * step;
        const h = baseWaveHeightAt(
          x,
          z,
          layerT,
          amplitude,
          waveScale,
          bottomBias,
          seed,
        );
        const idx = (iz * N + ix) * 3;
        positions[idx + 0] = x;
        positions[idx + 1] = h * (heightScale / 50);
        positions[idx + 2] = z;
        heights[iz * N + ix] = h;
        if (h > maxH) maxH = h;
        if (h < minH) minH = h;
      }
    }
    const norm = new Float32Array(N * N);
    const range = maxH - minH || 1;
    for (let i = 0; i < heights.length; i += 1) {
      norm[i] = (heights[i] - minH) / range;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aHeight", new THREE.BufferAttribute(norm, 1));

    const u = {
      uSize: { value: dotSize * 0.001 * size },
      uOpacity: { value: opacity / 100 },
      uC0: { value: new THREE.Color(rampC0) },
      uC1: { value: new THREE.Color(rampC1) },
      uC2: { value: new THREE.Color(rampC2) },
      uC3: { value: new THREE.Color(rampC3) },
      uC4: { value: new THREE.Color(rampC4) },
      uC5: { value: new THREE.Color(rampC5) },
    } satisfies { [k: string]: THREE.IUniform };
    return { geometry: g, uniforms: u };
  }, [
    gridN,
    size,
    dotSize,
    opacity,
    heightScale,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    seed,
    rampC0,
    rampC1,
    rampC2,
    rampC3,
    rampC4,
    rampC5,
  ]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const { gl } = useThree();
  const pixelRatio = Math.min(gl.getPixelRatio(), 2);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aHeight;
          varying float vH;
          uniform float uSize;
          void main() {
            vH = aHeight;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float depth = -mv.z;
            gl_PointSize = uSize * (320.0 / depth) * ${pixelRatio.toFixed(2)};
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vH;
          uniform float uOpacity;
          uniform vec3 uC0;
          uniform vec3 uC1;
          uniform vec3 uC2;
          uniform vec3 uC3;
          uniform vec3 uC4;
          uniform vec3 uC5;
          vec3 ramp(float t) {
            if (t < 0.2) return mix(uC0, uC1, t / 0.2);
            if (t < 0.4) return mix(uC1, uC2, (t - 0.2) / 0.2);
            if (t < 0.6) return mix(uC2, uC3, (t - 0.4) / 0.2);
            if (t < 0.8) return mix(uC3, uC4, (t - 0.6) / 0.2);
            return mix(uC4, uC5, (t - 0.8) / 0.2);
          }
          void main() {
            vec2 uv = gl_PointCoord * 2.0 - 1.0;
            float d = dot(uv, uv);
            if (d > 1.0) discard;
            float mask = smoothstep(1.0, 0.2, d);
            vec3 col = ramp(clamp(vH, 0.0, 1.0));
            gl_FragColor = vec4(col, mask * uOpacity);
          }
        `,
      }),
    [uniforms, pixelRatio],
  );

  useEffect(() => () => material.dispose(), [material]);

  // Sample a small set of anchor nodes on the terrain surface for arc endpoints.
  const arcNodes = useMemo(() => {
    const K = Math.max(2, Math.min(64, Math.round(arcCount) + 4));
    const rand = seededPrng(Math.floor(seed * 1000) + 4211);
    const half = size / 2;
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < K; i += 1) {
      const x = (rand() * 2 - 1) * half * 0.9;
      const z = (rand() * 2 - 1) * half * 0.9;
      const h = baseWaveHeightAt(
        x,
        z,
        layerT,
        amplitude,
        waveScale,
        bottomBias,
        seed,
      );
      out.push([x, h * (heightScale / 50), z]);
    }
    return out;
  }, [
    arcCount,
    seed,
    size,
    layerT,
    amplitude,
    waveScale,
    bottomBias,
    heightScale,
  ]);

  return (
    <group position={[0, layerY, 0]}>
      <points geometry={geometry} material={material} />
      <AgentArcs
        nodes={arcNodes}
        size={size}
        arcCount={arcCount}
        arcSpeed={arcSpeed}
        arcBallSpeed={arcBallSpeed}
        arcBallSize={arcBallSize}
        arcLift={arcLift}
        arcThickness={arcThickness}
        arcDashLength={arcDashLength}
        arcGlow={arcGlow}
        arcColor={arcColor}
        seed={seed + 3.17}
      />
    </group>
  );
}

/**
 * 4-point pinched sparkle shape (2D). Radius R; each waist is at distance
 * `pinch * R` from origin, sides are quadratic Béziers whose control points
 * sit at (±pinch·R, ±pinch·R) — that's what pinches the sides concave.
 */
function buildSparkleShape(radius: number, pinchFrac: number): THREE.Shape {
  const R = Math.max(0.001, radius);
  const p = Math.max(0.05, Math.min(0.6, pinchFrac));
  const shape = new THREE.Shape();
  shape.moveTo(R, 0);
  shape.quadraticCurveTo(p * R, p * R, 0, R);
  shape.quadraticCurveTo(-p * R, p * R, -R, 0);
  shape.quadraticCurveTo(-p * R, -p * R, 0, -R);
  shape.quadraticCurveTo(p * R, -p * R, R, 0);
  return shape;
}

/** Full layer slab, optionally pierced by a sparkle-shaped through-hole. */
function buildSparkleGeometry(
  size: number,
  radius: number,
  pinchFrac: number,
  depth: number,
  bevelFrac: number,
  subtract: boolean,
  holeRotation = 0,
  holeScale = 1,
): THREE.BufferGeometry {
  const half = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(-half, half);
  shape.lineTo(half, half);
  shape.lineTo(half, -half);
  shape.closePath();
  // Leave a small rim even at maximum cutout size, so the slab stays closed.
  const holeRadius = Math.min(radius * holeScale, half * 0.94);
  if (subtract) {
    const points = buildSparkleShape(holeRadius, pinchFrac).getPoints(24);
    const cs = Math.cos(holeRotation);
    const sn = Math.sin(holeRotation);
    shape.holes.push(new THREE.Path(points.map(({ x, y }) =>
      new THREE.Vector2(x * cs - y * sn, x * sn + y * cs),
    )));
  }
  if (depth <= 0.001) return new THREE.ShapeGeometry(shape, 48);
  const bevelSize = Math.min(
    Math.max(0, Math.min(0.45, bevelFrac)) * depth * 0.5,
    (half - holeRadius) * 0.25,
    size * 0.015,
  );
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevelSize > 0.001,
    bevelSegments: 4,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 32,
    steps: 1,
  });
  geom.translate(0, 0, -depth / 2);
  geom.computeVertexNormals();
  return geom;
}

/* ------------------------------------------------------------------ *
 *  InterlayerConnectors — hyperrealistic hub-and-fan cabling between  *
 *  every adjacent pair of layers. Data flows UPWARD (beads race from  *
 *  the source at the bottom plate → up through the waist → up short   *
 *  vertical stems to the terminal caps at the top plate).             *
 * ------------------------------------------------------------------ */

type InterlayerHub = {
  waist: THREE.Vector3;
  caps: Array<[number, number, number]>;
  wires: Array<{ curve: THREE.CubicBezierCurve3 }>;
  /** Top-plate vertical stem going into the waist for each cap. */
  stems: Array<THREE.CubicBezierCurve3>;
};

function buildInterlayerHubs(
  topY: number,
  bottomY: number,
  planeSize: number,
  hubsPerSide: number,
  wiresPerHub: number,
  waistDepthPct: number,
  fanRadiusPct: number,
  clusterSize: number,
  seed: number,
  style: "strings" | "fan",
): InterlayerHub[] {
  const rand = seededPrng(Math.floor(seed * 1000) + 5501);
  const half = planeSize * 0.42;
  const N = Math.max(1, Math.round(hubsPerSide));
  const step = (half * 2) / N;
  const gap = topY - bottomY;
  const waistY = topY - gap * (waistDepthPct / 100);
  const fanR = planeSize * (fanRadiusPct / 100) * 0.5;
  const clusterR = planeSize * 0.015 * Math.max(1, Math.min(12, clusterSize));

  const hubs: InterlayerHub[] = [];
  for (let gi = 0; gi < N; gi += 1) {
    for (let gj = 0; gj < N; gj += 1) {
      const hubX = -half + (gi + 0.5) * step;
      const hubZ = -half + (gj + 0.5) * step;
      const waist = new THREE.Vector3(hubX, waistY, hubZ);
      const caps: Array<[number, number, number]> = [];
      const stems: Array<THREE.CubicBezierCurve3> = [];
      const wires: Array<{ curve: THREE.CubicBezierCurve3 }> = [];
      const W = Math.max(0, Math.round(wiresPerHub));

      if (style === "strings") {
        // Straight-drop strings — each wire is a vertical bezier with all
        // control points on (roughly) the same vertical line. Endpoints have
        // a tiny XZ drift so the ends of the string cluster read as anchored
        // rather than perfectly aligned; no hub bottleneck, no caps.
        for (let w = 0; w < W; w += 1) {
          const azimuth = rand() * Math.PI * 2;
          const rTarget = fanR * Math.sqrt(rand());
          const wireX = Math.max(-half, Math.min(half, hubX + Math.cos(azimuth) * rTarget));
          const wireZ = Math.max(-half, Math.min(half, hubZ + Math.sin(azimuth) * rTarget));
          const drift = fanR * 0.03;
          const topX = wireX + (rand() - 0.5) * drift;
          const topZ = wireZ + (rand() - 0.5) * drift;
          const botX = wireX + (rand() - 0.5) * drift;
          const botZ = wireZ + (rand() - 0.5) * drift;
          const p0 = new THREE.Vector3(botX, bottomY, botZ);
          const p1 = new THREE.Vector3(
            botX + (topX - botX) * 0.33,
            bottomY + gap * 0.33,
            botZ + (topZ - botZ) * 0.33,
          );
          const p2 = new THREE.Vector3(
            botX + (topX - botX) * 0.67,
            bottomY + gap * 0.67,
            botZ + (topZ - botZ) * 0.67,
          );
          const p3 = new THREE.Vector3(topX, topY, topZ);
          wires.push({ curve: new THREE.CubicBezierCurve3(p0, p1, p2, p3) });
        }
        hubs.push({ waist, caps, wires, stems });
        continue;
      }

      // ── "fan" style — hub with cap cluster, waist bottleneck, fanning wires.
      const cs = Math.max(1, Math.round(clusterSize));
      for (let k = 0; k < cs; k += 1) {
        // Sunflower-like layout so the cluster reads dense but non-uniform.
        const t = k / cs;
        const angle = k * 2.399963229; // golden angle
        const r = k === 0 ? 0 : clusterR * Math.sqrt(t);
        const cx = hubX + Math.cos(angle) * r;
        const cz = hubZ + Math.sin(angle) * r;
        caps.push([cx, topY, cz]);
        const stemDrop = Math.abs(gap) * 0.06;
        const p0 = new THREE.Vector3(cx, topY, cz);
        const p1 = new THREE.Vector3(cx, topY - stemDrop, cz);
        const p2 = new THREE.Vector3(waist.x, waist.y + stemDrop * 0.6, waist.z);
        const p3 = waist.clone();
        stems.push(new THREE.CubicBezierCurve3(p0, p1, p2, p3));
      }

      for (let w = 0; w < W; w += 1) {
        const azimuth = (w / Math.max(1, W)) * Math.PI * 2 + rand() * 0.35;
        const rTarget = fanR * (0.4 + rand() * 0.7);
        const cx = Math.max(-half, Math.min(half, hubX + Math.cos(azimuth) * rTarget));
        const cz = Math.max(-half, Math.min(half, hubZ + Math.sin(azimuth) * rTarget));
        const bottom = new THREE.Vector3(cx, bottomY, cz);
        const dx = waist.x - cx;
        const dz = waist.z - cz;
        const horiz = Math.hypot(dx, dz);
        const nx = horiz > 0 ? dx / horiz : 0;
        const nz = horiz > 0 ? dz / horiz : 0;
        const sag = Math.min(0.55, horiz * 0.09) * (0.9 + rand() * 0.25);
        const horizonReach = horiz * (0.55 + rand() * 0.08);
        const verticalDrop = Math.abs(gap) * 0.42;
        const jitter = (rand() - 0.5) * horiz * 0.02;
        const perpX = -nz;
        const perpZ = nx;
        const p1 = new THREE.Vector3(
          bottom.x + nx * horizonReach + perpX * jitter,
          bottomY - sag,
          bottom.z + nz * horizonReach + perpZ * jitter,
        );
        const p2 = new THREE.Vector3(waist.x, waist.y - verticalDrop, waist.z);
        wires.push({ curve: new THREE.CubicBezierCurve3(bottom, p1, p2, waist.clone()) });
      }

      hubs.push({ waist, caps, wires, stems });
    }
  }
  return hubs;
}

/** Merge a list of TubeGeometry curves into one BufferGeometry, tagging
 * each vertex with:
 *   - an along-length parameter (0=start, 1=end)
 *   - a per-curve random phase offset (so beads don't lock-step)
 *   - a per-vertex color: 3-stop piecewise blend when midColors[c] is set
 *     (mix(bottom→mid) for along∈[0,0.5], mix(mid→top) for along∈[0.5,1]),
 *     otherwise a plain 2-stop blend mix(bottom, top, along).
 * All color arrays (when provided) must be parallel to curves. */
type MovingWireAnchor = {
  kind: 1 | 2; // cloud particle or foundation box
  faceOffset?: number;
  point: THREE.Vector3;
  random: number;
  height: number;
  phase: number;
  layerY: number;
};
type WireAnchors = [MovingWireAnchor | null, MovingWireAnchor | null];

function mergeCurvesToTube(
  curves: THREE.Curve<THREE.Vector3>[],
  bottomColors: THREE.Color[],
  topColors: THREE.Color[],
  midColors: THREE.Color[] | null,
  radius: number,
  radial: number,
  tubular: number,
  seed: number,
  surfaceRanges: Array<[number, number]> = [],
  anchors: WireAnchors[] = [],
) {
  const anchorAttributes = {
    aCloudStart: [] as number[], aCloudEnd: [] as number[],
    aCloudStartParams: [] as number[], aCloudEndParams: [] as number[],
    aCloudStartOffset: [] as number[], aCloudEndOffset: [] as number[],
  };
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const aAlong: number[] = [];
  const aSurfaceAlong: number[] = [];
  const tangents: number[] = [];
  const aPhase: number[] = [];
  const colors: number[] = [];
  const rand = seededPrng(Math.floor(seed * 1000) + 9013);
  let baseVertex = 0;
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  for (let c = 0; c < curves.length; c += 1) {
    const tube = new THREE.TubeGeometry(
      curves[c],
      tubular,
      radius,
      radial,
      false,
    );
    const posArr = tube.attributes.position.array as ArrayLike<number>;
    const normArr = tube.attributes.normal.array as ArrayLike<number>;
    const uvArr = tube.attributes.uv.array as ArrayLike<number>;
    const idxArr = tube.index!.array as ArrayLike<number>;
    for (let i = 0; i < posArr.length; i += 1) positions.push(posArr[i]);
    for (let i = 0; i < normArr.length; i += 1) normals.push(normArr[i]);
    for (let i = 0; i < uvArr.length; i += 1) uvs.push(uvArr[i]);
    for (let i = 0; i < idxArr.length; i += 1) indices.push(idxArr[i] + baseVertex);
    const vCount = posArr.length / 3;
    const curveLength = Math.max(0.001, curves[c].getLength());
    const ringTangents = Array.from({ length: tubular + 1 }, (_, ring) => curves[c].getTangentAt(ring / tubular));
    const phase = rand();
    const endpoints = [curves[c].getPoint(0), curves[c].getPoint(1)];
    const pair = anchors[c] ?? [null, null];
    const anchorData = pair.map((anchor, end) => {
      if (!anchor) return { point: [0, 0, 0, 0], params: [0, 0, 0, 0], offset: [0, 0, 0] };
      return {
        point: [...anchor.point.toArray(), anchor.random],
        params: [anchor.height, anchor.phase, anchor.layerY, anchor.kind],
        offset: [anchor.point.x - endpoints[end].x,
          anchor.point.y + anchor.layerY + (anchor.faceOffset ?? 0) - endpoints[end].y,
          anchor.point.z - endpoints[end].z],
      };
    });
    const cB = bottomColors[c] ?? new THREE.Color("#ffffff");
    const cT = topColors[c] ?? new THREE.Color("#ffffff");
    const cM = midColors ? (midColors[c] ?? null) : null;
    for (let i = 0; i < vCount; i += 1) {
      const along = uvArr[i * 2];
      anchorAttributes.aCloudStart.push(...anchorData[0].point);
      anchorAttributes.aCloudEnd.push(...anchorData[1].point);
      anchorAttributes.aCloudStartParams.push(...anchorData[0].params);
      anchorAttributes.aCloudEndParams.push(...anchorData[1].params);
      anchorAttributes.aCloudStartOffset.push(...anchorData[0].offset);
      anchorAttributes.aCloudEndOffset.push(...anchorData[1].offset);
      aAlong.push(along);
      const tangent = ringTangents[Math.round(along * tubular)];
      tangents.push(tangent.x, tangent.y, tangent.z, curveLength);
      const range = surfaceRanges[c];
      aSurfaceAlong.push(pair[0] || pair[1] ? along : range
        ? (posArr[i * 3 + 1] - range[0]) / Math.max(0.05, range[1] - range[0])
        : along);
      aPhase.push(phase);
      const blend = along * along * (3 - 2 * along);
      if (cM) {
        if (blend < 0.5) {
          tmp.copy(cB).lerp(cM, blend * 2);
        } else {
          tmp2.copy(cM).lerp(cT, (blend - 0.5) * 2);
          tmp.copy(tmp2);
        }
      } else {
        tmp.copy(cB).lerp(cT, blend);
      }
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    baseVertex += vCount;
    tube.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  for (const [name, values] of Object.entries(anchorAttributes)) {
    g.setAttribute(name, new THREE.Float32BufferAttribute(values, name.endsWith("Offset") ? 3 : 4));
  }
  g.setAttribute("aCurveTangent", new THREE.Float32BufferAttribute(tangents, 4));
  g.setAttribute("aSurfaceAlong", new THREE.Float32BufferAttribute(aSurfaceAlong, 1));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(aAlong, 1));
  g.setAttribute("aPhase", new THREE.Float32BufferAttribute(aPhase, 1));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}

// One instanced sphere per travelling bead. Curve samples stay on the GPU;
// endpoint tracking is shared with the cable, so balls never lose their path.
function buildExternalBeads(tubes: THREE.BufferGeometry, segments: number, radius: number, count: number, groups: { count: number; start: number; end: number }[], selectionSeed = 0) {
  const rings = segments + 1;
  const verticesPerCurve = rings * 9;
  const curveCount = Math.floor((tubes.getAttribute("position")?.count ?? 0) / verticesPerCurve);
  const rows = Math.max(1, curveCount * 3);
  const data = new Float32Array(rings * rows * 4);
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = sphere.index!.clone();
  for (const name of ["position", "normal", "uv"]) geometry.setAttribute(name, sphere.getAttribute(name).clone());
  sphere.dispose();
  const copies = Math.max(1, Math.round(count));
  geometry.instanceCount = curveCount * copies;
  const rowIds: number[] = [];
  const offsets: number[] = [];
  const travelRanges: number[] = [];
  const anchorNames = ["aCloudStart", "aCloudEnd", "aCloudStartParams", "aCloudEndParams", "aCloudStartOffset", "aCloudEndOffset"];
  const anchors = anchorNames.map(() => [] as number[]);
  for (let c = 0; c < curveCount; c++) {
    const first = c * verticesPerCurve;
    for (let ring = 0; ring < rings; ring++) {
      const vertex = first + ring * 9;
      const center = new THREE.Vector3().fromBufferAttribute(tubes.getAttribute("position"), vertex)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(tubes.getAttribute("normal"), vertex), -radius);
      const tangent = tubes.getAttribute("aCurveTangent");
      const color = tubes.getAttribute("color");
      data.set([...center.toArray(), 1], ((c * 3) * rings + ring) * 4);
      data.set([tangent.getX(vertex), tangent.getY(vertex), tangent.getZ(vertex), tangent.getW(vertex)], ((c * 3 + 1) * rings + ring) * 4);
      data.set([color.getX(vertex), color.getY(vertex), color.getZ(vertex), 1], ((c * 3 + 2) * rings + ring) * 4);
    }
    let groupStart = 0;
    const group = groups.find((entry) => {
      if (c < groupStart + entry.count) return true;
      groupStart += entry.count;
      return false;
    });
    if (!group) continue;
    const groupIndex = groups.indexOf(group);
    for (let b = 0; b < copies; b++) {
      const choose = seededPrng(Math.floor(selectionSeed * 1000) + groupIndex * 7919 + b * 104729 + 307);
      const chosen = groupStart + Math.floor(choose() * group.count);
      const phase = choose();
      if (c !== chosen) continue;
      rowIds.push(c * 3);
      offsets.push((b + phase) / copies);
      travelRanges.push(group.start, group.end);
      anchorNames.forEach((name, index) => {
        const attr = tubes.getAttribute(name);
        for (let k = 0; k < attr.itemSize; k++) anchors[index].push(attr.array[first * attr.itemSize + k]);
      });
    }
  }
  geometry.instanceCount = rowIds.length;
  const travel = rowIds.flatMap((row, i) => [row, offsets[i], travelRanges[i * 2], travelRanges[i * 2 + 1]]);
  geometry.setAttribute("aBallTravel", new THREE.InstancedBufferAttribute(new Float32Array(travel), 4));
  anchorNames.forEach((name, i) => geometry.setAttribute(name,
    new THREE.InstancedBufferAttribute(new Float32Array(anchors[i]), name.endsWith("Offset") ? 3 : 4)));
  const texture = new THREE.DataTexture(data, rings, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return { geometry, texture, rings, rows, radius };
}

function InterlayerConnectors({
  boxContents,
  layerContents,
  settings,
  sharedUniforms,
  layers,
  layerConcept,
  layerEscapeHeight,
  cloudHeight,
  planeSize,
  wiresPerHub,
  hubsPerSide,
  waistDepth,
  fanRadius,
  tubeRadius,
  opacity,
  topBlend,
  bottomBlend,
  color,
  glow,
  flowSpeed,
  beadCount,
  beadWidth,
  beadBrightness,
  clusterSize,
  capSize,
  seed,
  wiresPerHubByPair,
  enabledByPair,
  layerColors,
  cascade,
  usePalette,
  paletteBottom,
  paletteMid,
  paletteTop,
  style,
}: {
  boxContents: ContentPositions[];
  layerContents: ContentPositions[];
  settings: StrataSettings;
  sharedUniforms: LayerUniforms;
  layers: LayerGeom[];
  layerConcept: LayerConcept[];
  layerEscapeHeight: number[];
  cloudHeight: number;
  planeSize: number;
  wiresPerHub: number;
  hubsPerSide: number;
  waistDepth: number;
  fanRadius: number;
  tubeRadius: number;
  opacity: number;
  topBlend: number;
  bottomBlend: number;
  color: string;
  glow: number;
  flowSpeed: number;
  beadCount: number;
  beadWidth: number;
  beadBrightness: number;
  clusterSize: number;
  capSize: number;
  seed: number;
  wiresPerHubByPair: (number | null)[];
  enabledByPair: (boolean | null)[];
  layerColors: string[];
  cascade: number;
  usePalette: boolean;
  paletteBottom: string;
  paletteMid: string;
  paletteTop: string;
  style: "strings" | "fan";
}) {
  // Track pair index alongside hubs so we can assign per-pair colors later.
  const hubsPerPair = useMemo(() => {
    const out: Array<{ pairIdx: number; hubs: InterlayerHub[] }> = [];
    const numPairs = Math.max(0, layers.length - 1);
    for (let i = 0; i < numPairs; i += 1) {
      // Per-pair enable check — a null entry means "inherit from global".
      const enabled = enabledByPair[i];
      if (enabled === false) {
        out.push({ pairIdx: i, hubs: [] });
        continue;
      }
      // Cascade multiplier: pair index 0 = top (fewer wires), numPairs-1 = bottom (full).
      const towardBottom = numPairs > 1 ? i / (numPairs - 1) : 1;
      const cascadeFrac = Math.max(0, Math.min(1, cascade / 100));
      const cascadeMul = 1 - cascadeFrac + cascadeFrac * towardBottom;
      // Per-pair override wins; otherwise apply cascade to the global base.
      const perPairWires = wiresPerHubByPair[i];
      const wireCount = perPairWires == null
        ? Math.max(0, Math.round(wiresPerHub * cascadeMul))
        : perPairWires;
      out.push({
        pairIdx: i,
        hubs: buildInterlayerHubs(
          layers[i].y,
          layers[i + 1].y,
          planeSize,
          hubsPerSide,
          wireCount,
          waistDepth,
          fanRadius,
          clusterSize,
          seed + i * 0.71,
          style,
        ),
      });
    }
    return out;
  }, [
    layers,
    planeSize,
    hubsPerSide,
    wiresPerHub,
    waistDepth,
    fanRadius,
    clusterSize,
    seed,
    wiresPerHubByPair,
    enabledByPair,
    cascade,
    style,
  ]);

  const flatHubs = useMemo(
    () => hubsPerPair.flatMap((p) => p.hubs),
    [hubsPerPair],
  );

  const { cloudDensity, amplitude, waveScale, bottomBias, seed: cloudSeed,
    escapeSpeed, escapeJitter, contentSize, contentBob, foundationMaxHeight, layerContent } = settings;
  const cloudPoints = useMemo(() => layers.map((_, index) =>
    layerConcept[index] === "cloud" ? buildCloudGeometry(planeSize, cloudDensity,
      layers.length === 1 ? 0 : index / (layers.length - 1),
      amplitude, waveScale, bottomBias, cloudSeed * 0.1) : null),
    [layers, layerConcept, planeSize, cloudDensity, amplitude, waveScale, bottomBias, cloudSeed]);
  useEffect(() => () => cloudPoints.forEach((g) => g?.dispose()), [cloudPoints]);

  // Keep a stable object identity for each endpoint throughout its motion.
  const wireAnchors = useMemo(() => {
    const anchorAt = (index: number, endpoint: THREE.Vector3, topFace: boolean): MovingWireAnchor | null => {
      const concept = layerConcept[index] ?? "uniform";
      const boxes = concept === "box" ? boxContents[index]
        : concept === "uniform" && layerContent[index] === "data-foundation" ? layerContents[index] : null;
      if (boxes?.positions.length) {
        let nearest = 0;
        let distance = Infinity;
        boxes.positions.forEach(([x, , z], i) => {
          const d = (x - endpoint.x) ** 2 + (z - endpoint.z) ** 2;
          if (d < distance) { nearest = i; distance = d; }
        });
        const height = Math.max(0.02, foundationMaxHeight / 100 * contentSize * 0.008 * 4
          * (boxes.heightFactors?.[nearest] ?? 0.5));
        return {
          kind: 2,
          point: new THREE.Vector3(...boxes.positions[nearest]),
          random: 0, height: 0, phase: nearest * 0.73 + index * 1.31,
          layerY: layers[index].y, faceOffset: topFace ? height : 0,
        };
      }
      const geometry = cloudPoints[index];
      if (!geometry) return null;
      const n = Math.max(2, Math.round(cloudDensity));
      const col = THREE.MathUtils.clamp(Math.round((endpoint.x / planeSize + 0.5) * n), 0, n);
      const row = THREE.MathUtils.clamp(Math.round((endpoint.z / planeSize + 0.5) * n), 0, n);
      const particle = row * (n + 1) + col;
      return {
        kind: 1,
        point: new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, particle),
        random: geometry.attributes.aRand.getX(particle),
        height: (layerEscapeHeight[index] ?? 35) * cloudHeight / 100,
        phase: index * 0.37 + cloudSeed * 0.02,
        layerY: layers[index].y,
      };
    };
    const fans: WireAnchors[] = [];
    const stems: WireAnchors[] = [];
    for (const { pairIdx, hubs } of hubsPerPair) {
      for (const hub of hubs) {
        for (const { curve } of hub.wires) fans.push([
          anchorAt(pairIdx + 1, curve.v0, true), style === "strings" ? anchorAt(pairIdx, curve.v3, false) : null,
        ]);
        for (const curve of hub.stems) stems.push([null, anchorAt(pairIdx, curve.v0, false)]);
      }
    }
    return { fans, stems };
  }, [cloudPoints, cloudDensity, planeSize, layerEscapeHeight, cloudHeight, cloudSeed, layers, hubsPerPair, style,
    layerConcept, layerContent, boxContents, layerContents, foundationMaxHeight, contentSize]);

  // Sample one continuous color field through the stack. Fan and stem
  // endpoints share the same waist color, eliminating a seam at each hub.
  const connectorColors = useMemo(() => {
    const palette = [paletteBottom, paletteMid, paletteTop].map((c) => new THREE.Color(c));
    const bottomY = layers[layers.length - 1]?.y ?? 0;
    const topY = layers[0]?.y ?? 1;
    const paletteAt = (y: number) => {
      const t = THREE.MathUtils.clamp((y - bottomY) / Math.max(0.001, topY - bottomY), 0, 1);
      const segment = t < 0.5 ? 0 : 1;
      const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      return palette[segment].clone().lerp(palette[segment + 1], f * f * (3 - 2 * f));
    };
    const fanBottoms: THREE.Color[] = [];
    const fanTops: THREE.Color[] = [];
    const stemBottoms: THREE.Color[] = [];
    const stemTops: THREE.Color[] = [];
    const capColors: THREE.Color[] = [];
    const waistColors: THREE.Color[] = [];
    for (const { pairIdx, hubs } of hubsPerPair) {
      const low = layers[pairIdx + 1].y;
      const high = layers[pairIdx].y;
      const lowColor = new THREE.Color(layerColors[pairIdx + 1] ?? color);
      const highColor = new THREE.Color(layerColors[pairIdx] ?? color);
      const at = (y: number) => usePalette ? paletteAt(y) : lowColor.clone().lerp(
        highColor, THREE.MathUtils.clamp((y - low) / Math.max(0.001, high - low), 0, 1),
      );
      for (const h of hubs) {
        for (const { curve } of h.wires) {
          fanBottoms.push(at(curve.v0.y));
          fanTops.push(at(curve.v3.y));
        }
        for (const curve of h.stems) {
          stemBottoms.push(at(curve.v3.y));
          stemTops.push(at(curve.v0.y));
        }
        for (const cap of h.caps) capColors.push(at(cap[1]));
        waistColors.push(at(h.waist.y));
      }
    }
    return { fanBottoms, fanTops, stemBottoms, stemTops, capColors, waistColors };
  }, [layers, hubsPerPair, layerColors, color, usePalette, paletteBottom, paletteMid, paletteTop]);

  // Blend against the visible layer envelope rather than its nominal Y plane.
  // Particle layers occupy a volume above the wave and must hide connections
  // at both their underside and their ceiling.
  const surfaceRanges = useMemo(() => {
    const bounds = layers.map((layer, index) => {
      let low = 0;
      let high = 0;
      for (let j = 1; j < layer.positions.length; j += 3) {
        low = Math.min(low, layer.positions[j]);
        high = Math.max(high, layer.positions[j]);
      }
      const cloud = layerConcept[index] === "cloud";
      const cloudDepth = cloud ? (layerEscapeHeight[index] ?? 35) * cloudHeight / 100 * 0.02 : 0;
      const softMargin = planeSize * (cloud ? 0.025 : 0.008);
      return [layer.y + low - softMargin, layer.y + high + cloudDepth + softMargin];
    });
    const fans: Array<[number, number]> = [];
    const stems: Array<[number, number]> = [];
    for (const { pairIdx, hubs } of hubsPerPair) {
      const range: [number, number] = [bounds[pairIdx + 1][1], bounds[pairIdx][0]];
      for (const hub of hubs) {
        for (const wire of hub.wires) { void wire; fans.push(range); }
        for (const stem of hub.stems) { void stem; stems.push(range); }
      }
    }
    return { fans, stems };
  }, [layers, layerConcept, layerEscapeHeight, cloudHeight, planeSize, hubsPerPair]);

  // ─── Fan-wire tube geometry (radial fibers below waist) ────────────
  const fanGeom = useMemo(() => {
    const curves = flatHubs.flatMap((h) => h.wires.map((w) => w.curve));
    if (curves.length === 0) return new THREE.BufferGeometry();
    return mergeCurvesToTube(
      curves,
      connectorColors.fanBottoms,
      connectorColors.fanTops,
      null,
      tubeRadius * 0.00045 * planeSize,
      8,
      44,
      seed + 1.3,
      surfaceRanges.fans,
      wireAnchors.fans,
    );
  }, [flatHubs, connectorColors, tubeRadius, planeSize, seed, surfaceRanges, wireAnchors]);
  useEffect(() => () => fanGeom.dispose(), [fanGeom]);

  // ─── Stem tube geometry (vertical bundle from caps to waist) ──────
  const stemGeom = useMemo(() => {
    const curves = flatHubs.flatMap((h) => h.stems.map((c) =>
      new THREE.CubicBezierCurve3(c.v3, c.v2, c.v1, c.v0),
    ));
    if (curves.length === 0) return new THREE.BufferGeometry();
    return mergeCurvesToTube(
      curves,
      connectorColors.stemBottoms,
      connectorColors.stemTops,
      null,
      tubeRadius * 0.00055 * planeSize,
      8,
      18,
      seed + 5.7,
      surfaceRanges.stems,
      wireAnchors.stems,
    );
  }, [flatHubs, connectorColors, tubeRadius, planeSize, seed, surfaceRanges, wireAnchors]);
  useEffect(() => () => stemGeom.dispose(), [stemGeom]);

  // ─── Physical tube material — self-contained ShaderMaterial ────────
  const tubeMaterial = useMemo(() => {
    // Pure ShaderMaterial we own end-to-end. Draws physical-feeling PBR-ish
    // cable body with rim + Lambert wrap + traveling bead, using the merged
    // geometry's per-vertex color for both diffuse tint and bead hue.
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uBoxBobAmplitude: { value: 0 },
        uCloudSpeed: { value: 0 },
        uCloudJitter: { value: 0 },
        uCursor: sharedUniforms.uCursor,
        uActive: sharedUniforms.uActive,
        uRadius: sharedUniforms.uRadius,
        uVerticalReach: sharedUniforms.uVerticalReach,
        uStrength: sharedUniforms.uStrength,
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uBeadCount: { value: 1 },
        uBeadWidth: { value: 0.2 },
        uBeadBrightness: { value: 1 },
        uBaseIntensity: { value: 0.2 },
        uOpacity: { value: 0.35 },
        uTopBlend: { value: 0.4 },
        uBottomBlend: { value: 0.4 },
      },
      // vertexColors is intentionally omitted — three.js would auto-inject
      // `attribute vec3 color;` and collide with our explicit declaration
      // below, killing the shader compile.
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
      vertexShader: /* glsl */ `
        uniform float uTime, uCloudSpeed, uCloudJitter, uBoxBobAmplitude;
        uniform vec3 uCursor;
        uniform float uActive, uRadius, uVerticalReach, uStrength;
        attribute vec4 aCloudStart, aCloudEnd;
        attribute vec4 aCloudStartParams, aCloudEndParams;
        attribute vec3 aCloudStartOffset, aCloudEndOffset;
        attribute vec4 aCurveTangent;
        ${cloudMotionShader}
        vec3 anchorDelta(vec4 point, vec4 params, vec3 offset) {
          if (params.w < 0.5) return vec3(0.0);
          if (params.w > 1.5) {
            // Exactly the translation applied by LayerContent to this box.
            vec2 d = point.xz - uCursor.xz;
            float dy = point.y + params.z - uCursor.y;
            float bump = exp(-dot(d, d) / (uRadius * uRadius)
              - dy * dy / (uVerticalReach * uVerticalReach)) * uStrength * uActive;
            float bob = sin(uTime * 0.9 + params.y) * uBoxBobAmplitude;
            return offset + vec3(0.0, bump + bob, 0.0);
          }
          return cloudMotion(point.xyz, point.w, uTime, uCloudSpeed, params.x,
            uCloudJitter, params.y, params.z, uCursor, uActive, uRadius,
            uVerticalReach, uStrength) - point.xyz + offset;
        }
        attribute vec3 color;
        attribute float aAlong;
        attribute float aSurfaceAlong;
        attribute float aPhase;
        varying float vAlong;
        varying float vSurfaceAlong;
        varying float vPhase;
        varying vec3 vNormalV;
        varying vec3 vViewDirV;
        varying vec3 vColor;
        void main() {
          vAlong = aAlong;
          vSurfaceAlong = aSurfaceAlong;
          vPhase = aPhase;
          vColor = color;
          float blend = smoothstep(0.0, 1.0, aAlong);
          vec3 startDelta = anchorDelta(aCloudStart, aCloudStartParams, aCloudStartOffset);
          vec3 endDelta = anchorDelta(aCloudEnd, aCloudEndParams, aCloudEndOffset);
          vec3 tracked = position + mix(startDelta, endDelta, blend);
          // Inverse-transpose of the endpoint deformation: highlights follow
          // the bent cable instead of staying aligned with its original tube.
          vec3 slope = (endDelta - startDelta) * (6.0 * aAlong * (1.0 - aAlong) / aCurveTangent.w);
          vec3 bentNormal = normal - aCurveTangent.xyz * dot(slope, normal)
            / max(0.1, 1.0 + dot(slope, aCurveTangent.xyz));
          vec4 mv = modelViewMatrix * vec4(tracked, 1.0);
          vNormalV = normalize(normalMatrix * bentNormal);
          vViewDirV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlong;
        varying float vSurfaceAlong;
        varying float vPhase;
        varying vec3 vNormalV;
        varying vec3 vViewDirV;
        varying vec3 vColor;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uBeadCount;
        uniform float uBeadWidth;
        uniform float uBeadBrightness;
        uniform float uBaseIntensity;
        uniform float uOpacity;
        uniform float uTopBlend;
        uniform float uBottomBlend;
        float opacityFade(float distanceToContact, float width) {
          if (width <= 0.0) return 1.0;
          float t = clamp(distanceToContact / width, 0.0, 1.0);
          // Quintic easing has zero slope and curvature at both ends.
          return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        }
        void main() {
          vec3 n = normalize(vNormalV);
          vec3 viewDir = normalize(vViewDirV);
          vec3 lightDir = normalize(vec3(-0.4, 0.8, 0.6));
          float diffuse = 0.25 + 0.55 * max(dot(n, lightDir), 0.0);
          float specular = pow(max(dot(n, normalize(lightDir + viewDir)), 0.0), 64.0);
          vec3 base = vColor * (diffuse + uBaseIntensity) + vec3(specular * 0.22);
          // Fade coverage only: the material and highlights retain their hue.
          float contact = opacityFade(vSurfaceAlong, uBottomBlend)
            * opacityFade(1.0 - vSurfaceAlong, uTopBlend);

          // Let multisample coverage define a crisp silhouette. Opacity
          // fades only along the cable at contacts, not across its width.
          float alpha = uOpacity * contact;
          gl_FragColor = vec4(base, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    return mat;
  }, [sharedUniforms]);
  useEffect(() => () => tubeMaterial.dispose(), [tubeMaterial]);

  const externalBeads = useMemo(() => {
    // Every layer gap owns its count. Fan and stem share one trip through
    // that gap so a hub does not double the number of visible balls.
    const fanGroups = hubsPerPair.map(({ hubs }) => ({
      count: hubs.reduce((n, h) => n + h.wires.length, 0), start: 0,
      end: style === "strings" ? 1 : 1 - waistDepth / 100,
    }));
    const stemGroups = hubsPerPair.map(({ hubs }, index) => ({
      count: hubs.reduce((n, h) => n + h.stems.length, 0),
      start: fanGroups[index].end, end: 1,
    }));
    const pools = [
      buildExternalBeads(fanGeom, 44, tubeRadius * 0.00045 * planeSize, beadCount, fanGroups, seed),
      buildExternalBeads(stemGeom, 18, tubeRadius * 0.00055 * planeSize, beadCount, stemGroups, seed),
    ];
    return pools.map((pool) => {
      const material = tubeMaterial.clone();
      // Share live controls and time with the strings.
      material.uniforms = { ...tubeMaterial.uniforms,
        // Ball appearance is independent of the wire opacity and gradient.
        uOpacity: { value: 0.85 },
        uBallColor: { value: new THREE.Color("#ffffff") },
        uCurveData: { value: pool.texture },
        uCurveDimensions: { value: new THREE.Vector2(pool.rings, pool.rows) },
        uTubeRadius: { value: pool.radius },
        uBallRadius: { value: pool.radius + planeSize * 0.00008 * Math.max(1, beadWidth) },
      };
      const preamble = tubeMaterial.vertexShader.slice(0, tubeMaterial.vertexShader.indexOf("void main()"))
        // These tube-only inputs are not used by the sphere shader. Leaving
        // them declared can exhaust WebGL's vertex attribute slots.
        .replace(/attribute (?:vec3 color|float aAlong|float aSurfaceAlong|float aPhase|vec4 aCurveTangent);/g, "");
      material.vertexShader = preamble + /* glsl */ `
        uniform vec3 uBallColor;
        uniform sampler2D uCurveData;
        uniform vec2 uCurveDimensions;
        uniform float uTubeRadius, uBallRadius, uSpeed, uBeadCount;
        attribute vec4 aBallTravel;
        vec4 curveSample(float along, float row) {
          float x = along * (uCurveDimensions.x - 1.0);
          vec2 a = vec2((floor(x) + 0.5) / uCurveDimensions.x, (row + 0.5) / uCurveDimensions.y);
          vec2 b = vec2((min(floor(x) + 1.0, uCurveDimensions.x - 1.0) + 0.5) / uCurveDimensions.x, a.y);
          return mix(texture2D(uCurveData, a), texture2D(uCurveData, b), fract(x));
        }
        void main() {
          float progress = fract(uTime * uSpeed * 0.08 + aBallTravel.y);
          if (progress < aBallTravel.z || progress >= aBallTravel.w) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          float along = (progress - aBallTravel.z) / max(0.0001, aBallTravel.w - aBallTravel.z);
          vec3 startDelta = anchorDelta(aCloudStart, aCloudStartParams, aCloudStartOffset);
          vec3 endDelta = anchorDelta(aCloudEnd, aCloudEndParams, aCloudEndOffset);
          vec3 center = curveSample(along, aBallTravel.x).xyz
            + mix(startDelta, endDelta, smoothstep(0.0, 1.0, along));
          // Center the sphere on the exact tracked wire path.
          vec4 mv = modelViewMatrix * vec4(center + position * uBallRadius, 1.0);
          vAlong = along;
          vSurfaceAlong = along;
          vPhase = 0.0;
          vColor = uBallColor;
          vNormalV = normalize(normalMatrix * normal);
          vViewDirV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `;
      material.fragmentShader = tubeMaterial.fragmentShader
        // Wire contact fades must not hide independently controlled balls.
        .replace("float alpha = uOpacity * contact;", "float alpha = uOpacity;")
        .replace("vec4(base, alpha)", "vec4(base + vColor * uBeadBrightness * 0.06, alpha)");
      return { ...pool, material };
    });
  }, [fanGeom, stemGeom, tubeRadius, planeSize, beadCount, beadWidth, tubeMaterial, hubsPerPair, style, waistDepth, seed]);
  useEffect(() => () => externalBeads.forEach(({ geometry, texture, material }) => {
    geometry.dispose(); texture.dispose(); material.dispose();
  }), [externalBeads]);

  // ─── Cap + waist instanced meshes ─────────────────────────────────
  // In "strings" mode we suppress the waist orbs and the cluster caps —
  // strings connect the two plates directly with no visible hub fitting.
  const capCount = flatHubs.reduce((s, h) => s + h.caps.length, 0);
  const waistCount = style === "strings" ? 0 : flatHubs.length;

  const capGeom = useMemo(() => {
    const r = (capSize / 100) * 0.05 * planeSize;
    const g = new THREE.CylinderGeometry(r * 0.5, r * 0.7, r * 1.2, 12);
    return g;
  }, [capSize, planeSize]);
  useEffect(() => () => capGeom.dispose(), [capGeom]);

  const capMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#ffffff"),
        emissive: new THREE.Color(color),
        emissiveIntensity: glow / 500,
        roughness: 0.28,
        metalness: 0.55,
        toneMapped: true,
      }),
    [color, glow],
  );
  useEffect(() => () => capMat.dispose(), [capMat]);

  const waistGeom = useMemo(() => {
    const r = (capSize / 100) * 0.04 * planeSize;
    return new THREE.SphereGeometry(Math.max(0.008, r), 20, 14);
  }, [capSize, planeSize]);
  useEffect(() => () => waistGeom.dispose(), [waistGeom]);

  const waistMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#ffffff"),
        emissive: new THREE.Color(color),
        emissiveIntensity: glow / 600,
        roughness: 0.35,
        metalness: 0.2,
        toneMapped: true,
      }),
    [color, glow],
  );
  useEffect(() => () => waistMat.dispose(), [waistMat]);

  const capsMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const waistMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const caps = capsMeshRef.current;
    const waists = waistMeshRef.current;
    if (caps) {
      let i = 0;
      for (const h of flatHubs) {
        for (const c of h.caps) {
          dummy.position.set(c[0], c[1] - (capGeom.parameters.height * 0.5), c[2]);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          caps.setMatrixAt(i, dummy.matrix);
          caps.setColorAt(i, connectorColors.capColors[i]);
          i += 1;
        }
      }
      caps.count = capCount;
      caps.instanceMatrix.needsUpdate = true;
      if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    }
    if (waists) {
      let i = 0;
      for (const h of flatHubs) {
        dummy.position.copy(h.waist);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1.15);
        dummy.updateMatrix();
        waists.setMatrixAt(i, dummy.matrix);
        waists.setColorAt(i, connectorColors.waistColors[i]);
        i += 1;
      }
      waists.count = waistCount;
      waists.instanceMatrix.needsUpdate = true;
      if (waists.instanceColor) waists.instanceColor.needsUpdate = true;
    }
  }, [flatHubs, capCount, waistCount, capGeom, dummy, connectorColors]);

  // ─── Live uniform sync + animation ────────────────────────────────
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const u = tubeMaterial.uniforms;
    u.uTime.value = now;
    u.uBoxBobAmplitude.value = Math.max(0, contentBob) / 100 * contentSize * 0.008 * 0.6;
    u.uCloudSpeed.value = Math.max(0.01, escapeSpeed / 100);
    u.uCloudJitter.value = escapeJitter / 100;
    u.uOpacity.value = THREE.MathUtils.clamp(opacity / 100, 0, 1);
    u.uTopBlend.value = THREE.MathUtils.clamp(topBlend / 100, 0, 0.5);
    u.uBottomBlend.value = THREE.MathUtils.clamp(bottomBlend / 100, 0, 0.5);
    u.uSpeed.value = flowSpeed / 40;
    u.uBeadCount.value = Math.max(1, Math.round(beadCount));
    u.uBeadWidth.value = (beadWidth / 100) * 0.5;
    u.uBeadBrightness.value = beadBrightness / 100;
    u.uBaseIntensity.value = 0.08 + glow / 250;
    for (const { material } of externalBeads) {
      material.uniforms.uOpacity.value = THREE.MathUtils.clamp(settings.interlayerBallOpacity / 100, 0, 1);
      material.uniforms.uBallColor.value.set(settings.interlayerBallColor);
    }
  });

  if (flatHubs.length === 0) return null;

  return (
    <group>
      <mesh geometry={fanGeom} material={tubeMaterial} frustumCulled={false} />
      <mesh geometry={stemGeom} material={tubeMaterial} frustumCulled={false} />
      {externalBeads.map((pool, index) => (
        <mesh key={index} geometry={pool.geometry} material={pool.material} frustumCulled={false} />
      ))}
      {capCount > 0 && (
        <instancedMesh
          ref={capsMeshRef}
          args={[capGeom, capMat, Math.max(1, capCount)]}
          frustumCulled={false}
        />
      )}
      {waistCount > 0 && (
        <instancedMesh
          ref={waistMeshRef}
          args={[waistGeom, waistMat, Math.max(1, waistCount)]}
          frustumCulled={false}
        />
      )}
    </group>
  );
}

function SparkleLayer({
  layerY,
  layerT,
  size,
  sparkleSize,
  sparklePinch,
  color,
  pulse,
  pulseSpeed,
  spin,
  billboard,
  height,
  glass,
  glassTint,
  glassRoughness,
  glassIOR,
  glassReflection,
  bevel,
  subtract,
  wave,
  waveSpeedProp,
  amplitude,
  waveScale,
  bottomBias,
  seed,
}: {
  layerY: number;
  layerT: number;
  size: number;
  sparkleSize: number;
  sparklePinch: number;
  color: string;
  pulse: number;
  pulseSpeed: number;
  spin: number;
  billboard: boolean;
  height: number;
  glass: boolean;
  glassTint: string;
  glassRoughness: number;
  glassIOR: number;
  glassReflection: number;
  bevel: number;
  subtract: boolean;
  wave: number;
  waveSpeedProp: number;
  amplitude: number;
  waveScale: number;
  bottomBias: number;
  seed: number;
}) {
  const depth = (height / 100) * size * 0.4;
  const isFlat = depth <= 0.001;

  const geometry = useMemo(() => {
    const R = (sparkleSize / 100) * size * 0.5;
    return buildSparkleGeometry(size, R, sparklePinch / 100, depth, bevel / 100, subtract);
  }, [sparkleSize, sparklePinch, size, depth, bevel, subtract]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const cutoutMotion = useMemo(() => ({
    geometry,
    angle: 0,
    elapsed: 0,
    scale: 1,
  }), [geometry]);
  useEffect(() => () => {
    if (cutoutMotion.geometry !== geometry) cutoutMotion.geometry.dispose();
  }, [cutoutMotion, geometry]);


  // The material has a per-instance shader-uniform ref so useFrame can push
  // time / wave params without rebuilding the material every frame.
  const waveUniformsRef = useRef({
    uTime: { value: 0 },
    uWaveAmp: { value: 0 },
    uWaveScale: { value: 0 },
    uWaveSpeed: { value: 0 },
    uWaveSeed: { value: 0 },
  });

  const material = useMemo(() => {
    const mat = isFlat
      ? new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          side: THREE.DoubleSide,
          toneMapped: false,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          metalness: 0.15,
          roughness: 0.55,
          side: THREE.DoubleSide,
        });
    // Inject wave displacement into the vertex shader. World XZ drives the
    // sample so the surface ripples in the same "space" as the mesh layers.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waveUniformsRef.current.uTime;
      shader.uniforms.uWaveAmp = waveUniformsRef.current.uWaveAmp;
      shader.uniforms.uWaveScale = waveUniformsRef.current.uWaveScale;
      shader.uniforms.uWaveSpeed = waveUniformsRef.current.uWaveSpeed;
      shader.uniforms.uWaveSeed = waveUniformsRef.current.uWaveSeed;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `
        #include <common>
        uniform float uTime;
        uniform float uWaveAmp;
        uniform float uWaveScale;
        uniform float uWaveSpeed;
        uniform float uWaveSeed;
        `,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        {
          vec3 worldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          float t = uTime * uWaveSpeed;
          float s = uWaveScale;
          float ph = uWaveSeed;
          float w =
              sin(worldPos.x * s * 0.9 + t + ph * 1.1)
            * cos(worldPos.z * s * 0.75 - t * 0.7 + ph) * 0.55
            + sin(worldPos.x * s * 1.7 + worldPos.z * s * 1.3 + t * 1.4 + ph * 1.7) * 0.28
            + sin(length(worldPos.xz) * s * 0.6 - t * 1.2 + ph * 0.6) * 0.32;
          // The sparkle mesh is rotated -PI/2 around X when extruded, so
          // "up" in local coordinates is +Z. Displace along local +Y for
          // the billboard/flat case, +Z for the extruded case.
          transformed.z += w * uWaveAmp;
        }
        `,
      );
    };
    return mat;
  }, [color, isFlat]);
  useEffect(() => () => material.dispose(), [material]);

  const groupRef = useRef<THREE.Group | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  // Y position at the layer center follows the wave surface so the sparkle
  // sits on the layer instead of floating.
  const centerY = useMemo(
    () =>
      baseWaveHeightAt(0, 0, layerT, amplitude, waveScale, bottomBias, seed),
    [layerT, amplitude, waveScale, bottomBias, seed],
  );

  useFrame((state, delta) => {
    const g = groupRef.current;
    const m = meshRef.current;
    if (!g || !m) return;
    const t = state.clock.elapsedTime;
    const pulseAmp = (pulse / 100) * 0.35;
    const scale = 1 + pulseAmp * Math.sin(t * (pulseSpeed / 100) * 6);
    // Animate only the inner contour; the outer slab stays fixed. Retriangulate
    // the caps with the hole so rotation cannot create crossing triangles.
    m.scale.setScalar(1);
    m.rotation.z = 0;
    cutoutMotion.elapsed += delta;
    const angleStep = (spin / 100) * (Math.PI * 2) / 6 * delta;
    cutoutMotion.angle += angleStep;
    if (subtract && cutoutMotion.elapsed >= 1 / 30 &&
        (angleStep !== 0 || Math.abs(scale - cutoutMotion.scale) > 0.001)) {
      const next = buildSparkleGeometry(
        size, (sparkleSize / 100) * size * 0.5, sparklePinch / 100,
        depth, bevel / 100, true, cutoutMotion.angle, scale,
      );
      m.geometry = next;
      if (cutoutMotion.geometry !== geometry) cutoutMotion.geometry.dispose();
      cutoutMotion.geometry = next;
      cutoutMotion.scale = scale;
      cutoutMotion.elapsed = 0;
    }
    if (billboard && isFlat && !subtract) {
      const cam = state.camera;
      g.lookAt(cam.position);
    } else {
      g.rotation.set(-Math.PI / 2, 0, 0);
    }
    // Push wave uniforms. The math mirrors the layer idle-motion shader
    // so the sparkle "breathes" in the same rhythm as the strata.
    const wu = waveUniformsRef.current;
    wu.uTime.value = t;
    // World-scale amplitude — mirrors baseWaveHeightAt's amp scaling.
    const bias = Math.pow(layerT, 1.6);
    const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
    const scaleMul = 0.05 + bias * (bottomAmp - 0.05);
    const layerAmp = (amplitude / 100) * scaleMul;
    wu.uWaveAmp.value = (wave / 100) * layerAmp * 1.4;
    wu.uWaveScale.value = 0.08 + waveScale * 0.008;
    wu.uWaveSpeed.value = (waveSpeedProp / 100) * 1.6;
    wu.uWaveSeed.value = seed;
  });

  // The entire slab extends downward from its layer surface. The sparkle
  // is an empty through-hole, never a filled object inside the slab.
  const yOffset = isFlat ? 0 : -depth / 2;

  return (
    <group ref={groupRef} position={[0, layerY + centerY + yOffset, 0]}>
      <mesh
        key={glass ? "glass" : "solid"}
        ref={meshRef}
        geometry={geometry}
        material={glass ? undefined : material}
        castShadow={false}
        receiveShadow={false}
      >
        {glass && (
          <MeshTransmissionMaterial
            resolution={512}
            samples={6}
            backside={!isFlat}
            backsideThickness={Math.max(0.01, depth)}
            thickness={Math.max(0.01, depth)}
            transmission={1}
            roughness={glassRoughness / 100}
            ior={glassIOR / 100}
            color="#ffffff"
            attenuationColor={glassTint}
            attenuationDistance={Math.max(0.5, size * 0.5)}
            envMapIntensity={glassReflection / 100}
            clearcoat={1}
            clearcoatRoughness={0.03}
            chromaticAberration={0.015}
            anisotropicBlur={0.03}
            distortion={0}
            temporalDistortion={0}
          />
        )}
      </mesh>
    </group>
  );
}

function buildFrameGeometry(
  shape: FrameShape,
  size: number,
  height: number,
): THREE.BufferGeometry | null {
  const r = size / 2;
  const h = height / 2;
  switch (shape) {
    case "none":
      return null;
    case "cube":
      return new THREE.EdgesGeometry(
        new THREE.BoxGeometry(size, height, size),
      );
    case "hex":
    case "oct": {
      const sides = shape === "hex" ? 6 : 8;
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (let i = 0; i < sides; i += 1) {
        const a1 = (i / sides) * Math.PI * 2;
        const a2 = ((i + 1) / sides) * Math.PI * 2;
        const x1 = Math.cos(a1) * r;
        const z1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const z2 = Math.sin(a2) * r;
        // top ring segment
        verts.push(x1, h, z1, x2, h, z2);
        // bottom ring segment
        verts.push(x1, -h, z1, x2, -h, z2);
        // vertical edge
        verts.push(x1, -h, z1, x1, h, z1);
      }
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
    case "cylinder": {
      const sides = 48;
      const uprights = 12;
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      for (let i = 0; i < sides; i += 1) {
        const a1 = (i / sides) * Math.PI * 2;
        const a2 = ((i + 1) / sides) * Math.PI * 2;
        const x1 = Math.cos(a1) * r;
        const z1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const z2 = Math.sin(a2) * r;
        verts.push(x1, h, z1, x2, h, z2);
        verts.push(x1, -h, z1, x2, -h, z2);
      }
      for (let i = 0; i < uprights; i += 1) {
        const a = (i / uprights) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        verts.push(x, -h, z, x, h, z);
      }
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
    case "pillars": {
      const g = new THREE.BufferGeometry();
      const verts = new Float32Array([
        -r, -h, -r, -r, h, -r,
        r, -h, -r, r, h, -r,
        -r, -h, r, -r, h, r,
        r, -h, r, r, h, r,
      ]);
      g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
      return g;
    }
    case "rings": {
      const g = new THREE.BufferGeometry();
      const verts: number[] = [];
      const ring = (y: number) => {
        verts.push(-r, y, -r, r, y, -r);
        verts.push(r, y, -r, r, y, r);
        verts.push(r, y, r, -r, y, r);
        verts.push(-r, y, r, -r, y, -r);
      };
      ring(-h);
      ring(h);
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(verts), 3),
      );
      return g;
    }
  }
}

function buildFrameSideGrid(
  size: number,
  height: number,
  resolution: number,
): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const verts: number[] = [];
  const n = Math.max(1, Math.round(resolution));
  const w = size / 2;
  const h = height / 2;
  const stepXZ = size / n;
  const stepY = height / n;

  // Two faces perpendicular to Z (front/back at z = ±w)
  for (const z of [-w, w]) {
    for (let i = 1; i < n; i += 1) {
      const x = -w + i * stepXZ;
      verts.push(x, -h, z, x, h, z);
    }
    for (let j = 1; j < n; j += 1) {
      const y = -h + j * stepY;
      verts.push(-w, y, z, w, y, z);
    }
  }
  // Two faces perpendicular to X (left/right at x = ±w)
  for (const x of [-w, w]) {
    for (let i = 1; i < n; i += 1) {
      const z = -w + i * stepXZ;
      verts.push(x, -h, z, x, h, z);
    }
    for (let j = 1; j < n; j += 1) {
      const y = -h + j * stepY;
      verts.push(x, y, -w, x, y, w);
    }
  }
  // Two faces perpendicular to Y (top/bottom at y = ±h)
  for (const y of [-h, h]) {
    for (let i = 1; i < n; i += 1) {
      const x = -w + i * stepXZ;
      verts.push(x, y, -w, x, y, w);
    }
    for (let j = 1; j < n; j += 1) {
      const z = -w + j * stepXZ;
      verts.push(-w, y, z, w, y, z);
    }
  }

  g.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(verts), 3),
  );
  return g;
}

function FrameSideGrid({
  size,
  height,
  resolution,
  color,
  opacity,
}: {
  size: number;
  height: number;
  resolution: number;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(
    () => buildFrameSideGrid(size, height, resolution),
    [size, height, resolution],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

function buildFrameSolidGeometry(
  shape: FrameShape,
  size: number,
  height: number,
): THREE.BufferGeometry | null {
  const r = size / 2;
  switch (shape) {
    case "none":
    case "pillars":
    case "rings":
      return null;
    case "cube":
      return new THREE.BoxGeometry(size, height, size, 1, 1, 1);
    case "hex":
      return new THREE.CylinderGeometry(r, r, height, 6, 1, false);
    case "oct":
      return new THREE.CylinderGeometry(r, r, height, 8, 1, false);
    case "cylinder":
      return new THREE.CylinderGeometry(r, r, height, 64, 1, false);
  }
}

function FrameGlass({
  shape,
  size,
  height,
  tint,
  roughness,
  ior,
  thickness,
  chromatic,
  anisotropy,
  distortion,
  attenuation,
  backside,
}: {
  shape: FrameShape;
  size: number;
  height: number;
  tint: string;
  roughness: number;
  ior: number;
  thickness: number;
  chromatic: number;
  anisotropy: number;
  distortion: number;
  attenuation: number;
  backside: boolean;
}) {
  const geometry = useMemo(
    () => buildFrameSolidGeometry(shape, size, height),
    [shape, size, height],
  );
  useEffect(
    () => () => {
      if (geometry) geometry.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  const attenuationDistance = 0.4 + (attenuation / 100) * 10;
  const physicalThickness = (thickness / 100) * Math.max(size, height);
  return (
    <mesh geometry={geometry} renderOrder={-1}>
      <MeshTransmissionMaterial
        transmission={1}
        roughness={roughness / 100}
        thickness={physicalThickness}
        ior={ior / 100}
        chromaticAberration={chromatic / 400}
        anisotropicBlur={anisotropy / 100}
        distortion={distortion / 200}
        distortionScale={0.3}
        temporalDistortion={0}
        attenuationColor={tint}
        attenuationDistance={attenuationDistance}
        color={tint}
        backside={backside}
        backsideThickness={physicalThickness * 0.5}
        samples={6}
        resolution={512}
        clearcoat={1}
        clearcoatRoughness={0.05}
        toneMapped={false}
      />
    </mesh>
  );
}

function FrameEdges({
  shape,
  size,
  height,
  color,
  opacity,
}: {
  shape: FrameShape;
  size: number;
  height: number;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(
    () => buildFrameGeometry(shape, size, height),
    [shape, size, height],
  );
  useEffect(
    () => () => {
      if (geometry) geometry.dispose();
    },
    [geometry],
  );
  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </lineSegments>
  );
}

export function MeshStrataScene({ settings, labelReferenceHeight }: { settings: StrataSettings; labelReferenceHeight?: number }) {
  const {
    layerCount,
    layerGaps,
    layerColors,
    layerContent,
    layerConcept,
    layerBaseOpacity,
    contentDensity,
    contentSize,
    contentOpacity,
    contentConnect,
    contentFlowSpeed,
    contentBob,
    platformColor,
    platformScale,
    platformHeight,
    platformNodeSize,
    foundationColor,
    foundationBlockSize,
    foundationMaxHeight,
    foundationMinThickness,
    foundationVariance,
    foundationCount,
    foundationBoxGap,
    foundationFillOpacity,
    foundationEdgeOpacity,
    planeSize,
    segments,
    amplitude,
    waveScale,
    randomAmplitude,
    bottomBias,
    seed,
    meshColor,
    coreColor,
    edgeColor,
    frameColor,
    frameShape,
    framePadding,
    frameOpacity,
    frameGridEnabled,
    frameGridResolution,
    frameGridColor,
    frameGridOpacity,
    layerEscapeHeight,
    cloudDotSize,
    cloudColorB,
    cloudColorC,
    cloudDensity,
    cloudHeight,
    escapeSpeed,
    escapeJitter,
    agentGridN,
    agentNodeSize,
    agentEdgeOpacity,
    agentSignalCount,
    agentSignalSpeed,
    agentSignalLength,
    agentSignalThickness,
    agentSignalColor,
    agentNodeColor,
    agentDecayLength,
    agentRefractory,
    agentJunctionSplit,
    agentSpawnRate,
    agentMinAmplitude,
    agentArcCount,
    agentArcSpeed,
    agentArcBallSpeed,
    agentArcBallSize,
    agentArcLift,
    agentArcThickness,
    agentArcDashLength,
    agentArcGlow,
    agentArcColor,
    terrainGridN,
    terrainDotSize,
    terrainHeightScale,
    terrainOpacity,
    terrainRampC0,
    terrainRampC1,
    terrainRampC2,
    terrainRampC3,
    terrainRampC4,
    terrainRampC5,
    interlayerEnabled,
    interlayerWiresPerHub,
    interlayerHubsPerSide,
    interlayerWaistDepth,
    interlayerFanRadius,
    interlayerTubeRadius,
    interlayerColor,
    interlayerGlow,
    interlayerFlowSpeed,
    interlayerBeadCount,
    interlayerBeadWidth,
    interlayerBeadBrightness,
    interlayerClusterSize,
    interlayerCapSize,
    interlayerSeed,
    interlayerWiresPerHubByPair,
    interlayerEnabledByPair,
    interlayerCascade,
    interlayerUsePalette,
    interlayerPaletteBottom,
    interlayerPaletteMid,
    interlayerPaletteTop,
    interlayerStyle,
    interlayerOpacity,
    interlayerTopBlend,
    interlayerBottomBlend,
    sparkleSize,
    sparklePinch,
    sparkleColor,
    sparklePulse,
    sparklePulseSpeed,
    sparkleSpin,
    sparkleBillboard,
    sparkleHeight,
    sparkleGlass,
    sparkleGlassTint,
    sparkleGlassRoughness,
    sparkleGlassIOR,
    sparkleGlassReflection,
    layerSparkleHeight,
    sparkleBevel,
    sparkleSubtract,
    sparkleWave,
    sparkleWaveSpeed,
    sparkleWaveHeight,
    frameGlass,
    frameGlassEnv,
    frameGlassRoughness,
    frameGlassIOR,
    frameGlassThickness,
    frameGlassChromatic,
    frameGlassAnisotropy,
    frameGlassDistortion,
    frameGlassAttenuation,
    frameGlassTint,
    frameGlassBackside,
    layerBlur,
    blurFocus,
    blurRange,
    lineOpacity,
    bloomIntensity,
    bloomThreshold,
    bloomSmoothing,
    vignette,
    cursorRadius,
    cursorStrength,
    cursorFluidity,
    cursorReturnSpeed,
    cursorVerticalReach,
    idleAmplitude,
    idleScale,
    idleSpeed,
  } = settings;

  // Cumulative Y positions from per-gap spacing, centered at 0.
  const { yPositions, totalHeight } = useMemo(() => {
    const gaps = layerGaps.slice(0, Math.max(0, layerCount - 1)).map(
      (g) => g * 0.03,
    );
    const ys: number[] = [0];
    for (let i = 1; i < layerCount; i += 1) {
      ys.push(ys[i - 1] - gaps[i - 1]);
    }
    const top = ys[0] ?? 0;
    const bottom = ys[layerCount - 1] ?? 0;
    const height = top - bottom;
    const shift = -(top + bottom) / 2;
    return {
      yPositions: ys.map((y) => y + shift),
      totalHeight: height,
    };
  }, [layerCount, layerGaps]);

  const layers = useMemo<LayerGeom[]>(() => {
    const out: LayerGeom[] = [];
    const rand = (i: number) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    for (let i = 0; i < layerCount; i += 1) {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const base = layerColors[i] || meshColor;
      const amp = randomAmplitude
        ? amplitude * (0.4 + rand(i) * 0.7)
        : amplitude;
      const concept = (layerConcept[i] ?? "uniform") as LayerConcept;
      const layerSegs = Math.max(4, Math.round(segments));
      // "uniform", "box", and "sparkle" all need the wave base geometry
      // available: uniform renders it, box uses it as a placement plane, and
      // sparkle uses it as the surface the sparkle carves a hole through.
      if (concept === "uniform" || concept === "box" || concept === "sparkle") {
        // Sparkle layers get an extra amplitude multiplier so the wave that
        // carries the hole can be dialed independently.
        const conceptAmp =
          concept === "sparkle" ? amp * (sparkleWaveHeight / 100) : amp;
        out.push(
          buildLayer(
            planeSize,
            layerSegs,
            yPositions[i],
            t,
            conceptAmp,
            waveScale,
            bottomBias,
            seed * 0.1,
            base,
            coreColor,
            edgeColor,
          ),
        );
      } else {
        out.push(
          buildConceptLayer(
            concept,
            planeSize,
            layerSegs,
            yPositions[i],
            t,
            amp,
            waveScale,
            bottomBias,
            seed * 0.1,
            base,
          ),
        );
      }
    }
    return out;
  }, [
    layerCount,
    yPositions,
    planeSize,
    segments,
    amplitude,
    waveScale,
    randomAmplitude,
    bottomBias,
    seed,
    meshColor,
    layerColors,
    layerConcept,
    coreColor,
    edgeColor,
    sparkleWaveHeight,
  ]);

  const boxContentByLayer = useMemo(() => {
    const rand = (i: number) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: layerCount }, (_, i) => {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const perLayerAmp = randomAmplitude
        ? amplitude * (0.4 + rand(i) * 0.7)
        : amplitude;
      return generatePositions({
        type: "data-foundation",
        count: 0,
        planeSize,
        layerT: t,
        amplitude: perLayerAmp,
        waveScale,
        bottomBias,
        seed,
        layerIndex: i,
        contentSize,
        foundationCount,
        foundationVariance,
        foundationBoxGap,
        foundationMinThickness,
      });
    });
  }, [
    layerCount,
    planeSize,
    contentSize,
    amplitude,
    randomAmplitude,
    waveScale,
    bottomBias,
    seed,
    foundationCount,
    foundationVariance,
    foundationBoxGap,
    foundationMinThickness,
  ]);

  const contentByLayer = useMemo(() => {
    const rand = (i: number) => {
      const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: layerCount }, (_, i) => {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const perLayerAmp = randomAmplitude
        ? amplitude * (0.4 + rand(i) * 0.7)
        : amplitude;
      return generatePositions({
        type: (layerContent[i] ?? "none") as ContentType,
        count: Math.max(0, Math.round(contentDensity)),
        planeSize,
        layerT: t,
        amplitude: perLayerAmp,
        waveScale,
        bottomBias,
        seed,
        layerIndex: i,
        contentSize,
        foundationCount,
        foundationVariance,
        foundationBoxGap,
        foundationMinThickness,
      });
    });
  }, [
    layerCount,
    layerContent,
    contentDensity,
    contentSize,
    planeSize,
    amplitude,
    randomAmplitude,
    waveScale,
    bottomBias,
    seed,
    foundationCount,
    foundationVariance,
    foundationBoxGap,
    foundationMinThickness,
  ]);

  // Auto-fit the frame's vertical padding to the realistic static wave peak
  // AND to any per-layer content (foundation blocks, platform lift) that
  // extends upward from a layer's Y position. Cursor bump is transient AND
  // vertically-localized, so it doesn't inflate the frame; idle motion
  // contributes a small fraction.
  const dynamicPad = useMemo(() => {
    let peakAbove = 0;
    let peakBelow = 0;
    const halfTotal = totalHeight / 2;
    const maxLayerAmp = randomAmplitude ? amplitude * 1.1 : amplitude;
    for (let i = 0; i < layerCount; i += 1) {
      const t = layerCount === 1 ? 0 : i / (layerCount - 1);
      const bias = Math.pow(t, 1.6);
      const bottomAmp = 0.15 + (bottomBias / 100) * 1.45;
      const scale = 0.05 + bias * (bottomAmp - 0.05);
      const baseAmp = (maxLayerAmp / 100) * scale;
      // 0.85 = realistic peak factor (sinusoids rarely all align).
      const baseDisp = baseAmp * 0.85;
      const idleDisp = (idleAmplitude / 100) * 0.9 * 0.6;
      const wavePeak = baseDisp + idleDisp;

      const concept = (layerConcept[i] ?? "uniform") as LayerConcept;
      const rawCt = (layerContent[i] ?? "none") as ContentType;
      // A "box" concept layer always renders as data-foundation regardless
      // of the per-layer content type.
      const ct: ContentType = concept === "box" ? "data-foundation" : rawCt;
      // LayerContent receives `size = contentSize * 0.008`; foundation blocks
      // scale their max height by that value, not by planeSize.
      const contentUnitSize = contentSize * 0.008;
      let contentAbove = 0;
      if (ct === "data-foundation") {
        contentAbove = (foundationMaxHeight / 100) * contentUnitSize * 4;
      } else if (ct === "platforms") {
        contentAbove = (platformHeight / 100) * contentUnitSize * 3;
      }
      if (concept === "cloud") {
        // Cloud rises up to escapeHeight * 0.05 world units above layerY.
        // Global cloudHeight multiplier scales the per-layer value.
        contentAbove = Math.max(
          contentAbove,
          (layerEscapeHeight[i] ?? 0) * 0.05 * (cloudHeight / 100),
        );
      }

      const yShifted = yPositions[i] ?? 0;
      peakAbove = Math.max(
        peakAbove,
        yShifted + wavePeak + contentAbove - halfTotal,
      );
      peakBelow = Math.max(peakBelow, -yShifted + wavePeak - halfTotal);
    }
    return Math.max(0, peakAbove, peakBelow);
  }, [
    layerCount,
    amplitude,
    randomAmplitude,
    bottomBias,
    idleAmplitude,
    layerContent,
    layerConcept,
    layerEscapeHeight,
    cloudHeight,
    foundationMaxHeight,
    platformHeight,
    contentSize,
    yPositions,
    totalHeight,
  ]);

  const framePad = framePadding * 0.03;
  const frameSize = planeSize + framePad * 2;
  const frameHeight = totalHeight + framePad * 2 + dynamicPad * 2;

  // Shared shader uniforms driven by useFrame; all layer materials share
  // the same Vector2/number wrappers by reference.
  const sharedUniforms = useMemo<LayerUniforms>(
    () => ({
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
      uActive: { value: 0 },
      uRadius: { value: cursorRadius },
      uVerticalReach: { value: cursorVerticalReach * 0.03 },
      uStrength: { value: cursorStrength },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uIdleAmp: { value: 0 },
      uIdleScale: { value: 0.6 },
      uIdleSpeed: { value: 0.4 },
      uOpacity: { value: lineOpacity / 100 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const cursorTarget = useRef(new THREE.Vector3(0, 0, 0));
  const cursorSmoothed = useRef(new THREE.Vector3(0, 0, 0));
  const activeTarget = useRef(0);
  const activeSmoothed = useRef(0);
  const pointerPlaneRef = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);

  useFrame((state, delta) => {
    // Orient the invisible pointer-capture plane to always face the camera,
    // so hovering "at a layer" in screen space actually lands cursor.y at
    // that visual height in world space.
    const plane = pointerPlaneRef.current;
    if (plane) plane.lookAt(camera.position);

    const fluid = Math.min(0.999, Math.max(0, cursorFluidity / 100));
    const followTau = 0.05 + fluid * 0.9;
    const followK = 1 - Math.exp(-delta / followTau);
    cursorSmoothed.current.lerp(cursorTarget.current, followK);

    const activeTau = 0.05 + Math.max(0, 1 - cursorReturnSpeed / 100) * 1.2;
    const activeK = 1 - Math.exp(-delta / activeTau);
    activeSmoothed.current +=
      (activeTarget.current - activeSmoothed.current) * activeK;

    sharedUniforms.uCursor.value.copy(cursorSmoothed.current);
    sharedUniforms.uActive.value = activeSmoothed.current;
    sharedUniforms.uTime.value = state.clock.elapsedTime;
    sharedUniforms.uRadius.value = cursorRadius;
    sharedUniforms.uVerticalReach.value = Math.max(
      0.05,
      cursorVerticalReach * 0.03,
    );
    sharedUniforms.uStrength.value = cursorStrength;
    sharedUniforms.uSeed.value = seed * 0.13;
    sharedUniforms.uIdleAmp.value = (idleAmplitude / 100) * 0.9;
    sharedUniforms.uIdleScale.value = 0.15 + (idleScale / 100) * 1.4;
    sharedUniforms.uIdleSpeed.value = (idleSpeed / 100) * 1.6;
    sharedUniforms.uOpacity.value = lineOpacity / 100;
  });

  const onCursorMove = (e: ThreeEvent<PointerEvent>) => {
    cursorTarget.current.set(e.point.x, e.point.y, e.point.z);
    activeTarget.current = 1;
  };
  const onCursorLeave = () => {
    activeTarget.current = 0;
  };

  // Connect to the rendered material, not a base swatch that a concept may
  // ignore (the cloud, for example, uses its own two-color palette).
  const connectorLayerColors = useMemo(() => {
    const midpoint = (a: string, b: string) =>
      `#${new THREE.Color(a).lerp(new THREE.Color(b), 0.5).getHexString()}`;
    return Array.from({ length: layerCount }, (_, index) => {
      const base = layerColors[index] || meshColor;
      switch (layerConcept[index] ?? "uniform") {
        case "cloud": return midpoint(cloudColorB, cloudColorC);
        case "sparkle": return sparkleGlass ? sparkleGlassTint : sparkleColor;
        case "agent": return midpoint(agentNodeColor, agentSignalColor);
        case "terrain": return midpoint(terrainRampC2, terrainRampC3);
        case "box": return foundationColor || base;
        case "uniform":
          if (layerContent[index] === "data-foundation") return foundationColor || base;
          if (layerContent[index] === "platforms") return platformColor || base;
          return base;
        default: return base;
      }
    });
  }, [layerCount, layerColors, meshColor, layerConcept, layerContent,
    cloudColorB, cloudColorC, sparkleGlass, sparkleGlassTint, sparkleColor,
    agentNodeColor, agentSignalColor, terrainRampC2, terrainRampC3,
    foundationColor, platformColor]);

  // Camera-facing invisible plane covering the stack visually.
  const pointerPlaneSize = Math.max(planeSize, frameSize) * 3;

  return (
    <>
      <group>
        {layers.map((layer, idx) => {
          const t = layerCount === 1 ? 0 : idx / (layerCount - 1);
          const concept = (layerConcept[idx] ?? "uniform") as LayerConcept;
          const isBox = concept === "box";
          const isCloud = concept === "cloud";
          const isAgent = concept === "agent";
          const isSparkle = concept === "sparkle";
          const isTerrain = concept === "terrain";
          const isConceptMesh =
            concept !== "uniform" &&
            concept !== "box" &&
            concept !== "cloud" &&
            concept !== "agent" &&
            concept !== "sparkle" &&
            concept !== "terrain";
          const contentColor = layerColors[idx] || meshColor;
          const rawContentType = (layerContent[idx] ?? "none") as ContentType;
          const effectiveContentType: ContentType = isBox
            ? "data-foundation"
            : rawContentType;
          const content = isBox
            ? boxContentByLayer[idx]
            : contentByLayer[idx];
          // Sparkle owns its complete slab and cutout geometry.
          const showBaseMesh =
            concept === "uniform" || isBox;
          const hasContentOnTop =
            isBox || (concept === "uniform" && rawContentType !== "none");
          const baseOpacityOverride = hasContentOnTop
            ? ((layerBaseOpacity[idx] ?? 35) / 100) * (lineOpacity / 100)
            : undefined;
          return (
            <group key={idx}>
              <LayerNameLabel
                referenceHeight={labelReferenceHeight}
                fontSize={settings.layerLabelFontSize}
                name={settings.layerNames[idx]?.trim() || `Layer ${idx + 1}`}
                layerY={layer.y}
                planeSize={planeSize}
              />
              {showBaseMesh && (
                <WireLayer
                  layer={layer}
                  layerT={t}
                  sharedUniforms={sharedUniforms}
                  opacityOverride={baseOpacityOverride}
                />
              )}
              {isSparkle && (
                <SparkleLayer
                  layerY={layer.y}
                  layerT={t}
                  size={planeSize}
                  sparkleSize={sparkleSize}
                  sparklePinch={sparklePinch}
                  color={sparkleColor}
                  pulse={sparklePulse}
                  pulseSpeed={sparklePulseSpeed}
                  spin={sparkleSpin}
                  billboard={sparkleBillboard}
                  height={layerSparkleHeight[idx] ?? sparkleHeight}
                  glass={sparkleGlass}
                  glassTint={sparkleGlassTint}
                  glassRoughness={sparkleGlassRoughness}
                  glassIOR={sparkleGlassIOR}
                  glassReflection={sparkleGlassReflection}
                  bevel={sparkleBevel}
                  subtract={sparkleSubtract}
                  wave={sparkleWave}
                  waveSpeedProp={sparkleWaveSpeed}
                  amplitude={amplitude}
                  waveScale={waveScale}
                  bottomBias={bottomBias}
                  seed={seed * 0.1}
                />
              )}
              {isAgent && (
                <AgentLayer
                  layerY={layer.y}
                  layerT={t}
                  size={planeSize}
                  gridN={agentGridN}
                  amplitude={amplitude}
                  waveScale={waveScale}
                  bottomBias={bottomBias}
                  seed={seed * 0.1}
                  nodeSize={agentNodeSize}
                  nodeColor={agentNodeColor}
                  edgeOpacity={agentEdgeOpacity}
                  signalCount={agentSignalCount}
                  signalSpeed={agentSignalSpeed}
                  signalLength={agentSignalLength}
                  signalThickness={agentSignalThickness}
                  signalColor={agentSignalColor}
                  decayLength={agentDecayLength}
                  refractory={agentRefractory}
                  junctionSplit={agentJunctionSplit}
                  spawnRate={agentSpawnRate}
                  minAmplitude={agentMinAmplitude}
                  arcCount={agentArcCount}
                  arcSpeed={agentArcSpeed}
                  arcBallSpeed={agentArcBallSpeed}
                  arcBallSize={agentArcBallSize}
                  arcLift={agentArcLift}
                  arcThickness={agentArcThickness}
                  arcDashLength={agentArcDashLength}
                  arcGlow={agentArcGlow}
                  arcColor={agentArcColor}
                  phaseOffset={idx * 0.53}
                  sharedUniforms={sharedUniforms}
                />
              )}
              {isTerrain && (
                <TerrainLayer
                  layerY={layer.y}
                  layerT={t}
                  size={planeSize}
                  gridN={terrainGridN}
                  dotSize={terrainDotSize}
                  opacity={terrainOpacity}
                  heightScale={terrainHeightScale}
                  rampC0={terrainRampC0}
                  rampC1={terrainRampC1}
                  rampC2={terrainRampC2}
                  rampC3={terrainRampC3}
                  rampC4={terrainRampC4}
                  rampC5={terrainRampC5}
                  amplitude={amplitude}
                  waveScale={waveScale}
                  bottomBias={bottomBias}
                  seed={seed * 0.1 + idx * 0.19}
                  arcCount={agentArcCount}
                  arcSpeed={agentArcSpeed}
                  arcBallSpeed={agentArcBallSpeed}
                  arcBallSize={agentArcBallSize}
                  arcLift={agentArcLift}
                  arcThickness={agentArcThickness}
                  arcDashLength={agentArcDashLength}
                  arcGlow={agentArcGlow}
                  arcColor={agentArcColor}
                />
              )}
              {isCloud && (
                <CloudLayer
                  layerY={layer.y}
                  layerT={t}
                  color={contentColor}
                  colorB={cloudColorB}
                  colorC={cloudColorC}
                  size={planeSize}
                  density={cloudDensity}
                  amplitude={amplitude}
                  waveScale={waveScale}
                  bottomBias={bottomBias}
                  seed={seed * 0.1}
                  dotSize={cloudDotSize * 0.001 * planeSize}
                  escapeHeight={
                    (layerEscapeHeight[idx] ?? 35) * (cloudHeight / 100)
                  }
                  escapeSpeed={escapeSpeed}
                  escapeJitter={escapeJitter}
                  phaseOffset={idx * 0.37 + seed * 0.02}
                  sharedUniforms={sharedUniforms}
                />
              )}
              {!isConceptMesh && content && content.positions.length > 0 && (
                <LayerContent
                  type={effectiveContentType}
                  positions={content.positions}
                  edges={content.edges}
                  heightFactors={content.heightFactors}
                  boxGapFrac={content.boxGapFrac}
                  layerY={layer.y}
                  color={contentColor}
                  size={contentSize * 0.008}
                  opacity={contentOpacity / 100}
                  connect={contentConnect}
                  flowSpeed={contentFlowSpeed}
                  bob={contentBob}
                  layerIndex={idx}
                  sharedUniforms={sharedUniforms}
                  platformColor={platformColor}
                  platformScale={platformScale}
                  platformHeight={platformHeight}
                  platformNodeSize={platformNodeSize}
                  foundationColor={foundationColor}
                  foundationBlockSize={foundationBlockSize}
                  foundationMaxHeight={foundationMaxHeight}
                  foundationFillOpacity={foundationFillOpacity}
                  foundationEdgeOpacity={foundationEdgeOpacity}
                />
              )}
            </group>
          );
        })}
        {interlayerEnabled && layers.length >= 2 && (
          <InterlayerConnectors
            boxContents={boxContentByLayer}
            layerContents={contentByLayer}
            settings={settings}
            sharedUniforms={sharedUniforms}
            layers={layers}
            layerConcept={layerConcept}
            layerEscapeHeight={layerEscapeHeight}
            cloudHeight={cloudHeight}
            planeSize={planeSize}
            wiresPerHub={interlayerWiresPerHub}
            hubsPerSide={interlayerHubsPerSide}
            waistDepth={interlayerWaistDepth}
            fanRadius={interlayerFanRadius}
            tubeRadius={interlayerTubeRadius}
            opacity={interlayerOpacity}
            topBlend={interlayerTopBlend}
            bottomBlend={interlayerBottomBlend}
            color={interlayerColor}
            glow={interlayerGlow}
            flowSpeed={interlayerFlowSpeed}
            beadCount={interlayerBeadCount}
            beadWidth={interlayerBeadWidth}
            beadBrightness={interlayerBeadBrightness}
            clusterSize={interlayerClusterSize}
            capSize={interlayerCapSize}
            seed={interlayerSeed}
            wiresPerHubByPair={interlayerWiresPerHubByPair}
            enabledByPair={interlayerEnabledByPair}
            layerColors={connectorLayerColors}
            cascade={interlayerCascade}
            usePalette={interlayerUsePalette}
            paletteBottom={interlayerPaletteBottom}
            paletteMid={interlayerPaletteMid}
            paletteTop={interlayerPaletteTop}
            style={interlayerStyle}
          />
        )}
        <FrameEdges
          shape={frameShape}
          size={frameSize}
          height={frameHeight}
          color={frameColor}
          opacity={frameOpacity / 100}
        />
        {frameGridEnabled && (
          <FrameSideGrid
            size={frameSize}
            height={frameHeight}
            resolution={frameGridResolution}
            color={frameGridColor}
            opacity={frameGridOpacity / 100}
          />
        )}
        {layerConcept
          .slice(0, layerCount)
          .some((c, idx) => c === "sparkle" && (layerSparkleHeight[idx] ?? sparkleHeight) > 0) && (
            <>
              <hemisphereLight args={["#ffffff", "#404060", 0.9]} />
              <directionalLight
                position={[6, 12, 4]}
                intensity={0.7}
                castShadow={false}
              />
            </>
          )}
        {sparkleGlass && !frameGlass && layerConcept.slice(0, layerCount).includes("sparkle") && (
          <Environment resolution={256} frames={1}>
            <Lightformer position={[0, 8, 0]} scale={[12, 5]} intensity={4} />
            <Lightformer position={[-8, 3, 5]} scale={[3, 10]} intensity={5} />
            <Lightformer position={[7, 2, -5]} scale={[2, 10]} intensity={6} color="#dce8ff" />
            <Lightformer position={[0, -5, 4]} scale={[10, 3]} intensity={2} color="#fff0da" />
          </Environment>
        )}
        {frameGlass && (
          <>
            <Environment preset={frameGlassEnv as GlassEnv} />
            <FrameGlass
              shape={frameShape}
              size={frameSize}
              height={frameHeight}
              tint={frameGlassTint}
              roughness={frameGlassRoughness}
              ior={frameGlassIOR}
              thickness={frameGlassThickness}
              chromatic={frameGlassChromatic}
              anisotropy={frameGlassAnisotropy}
              distortion={frameGlassDistortion}
              attenuation={frameGlassAttenuation}
              backside={frameGlassBackside}
            />
          </>
        )}

        <mesh
          ref={pointerPlaneRef}
          onPointerMove={onCursorMove}
          onPointerLeave={onCursorLeave}
        >
          <planeGeometry args={[pointerPlaneSize, pointerPlaneSize]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {(layerBlur > 0 || bloomIntensity > 0 || vignette > 0) && (
        <EffectComposer multisampling={8}>
          {layerBlur > 0 ? (
            <DepthOfField
              focusDistance={blurFocus / 100}
              focalLength={blurRange / 200}
              bokehScale={(layerBlur / 100) * 6}
            />
          ) : (
            <></>
          )}
          {bloomIntensity > 0 ? (
            <Bloom
              intensity={bloomIntensity / 80}
              luminanceThreshold={bloomThreshold / 100}
              luminanceSmoothing={bloomSmoothing / 100}
              mipmapBlur
            />
          ) : (
            <></>
          )}
          {vignette > 0 ? (
            <Vignette eskil={false} offset={0.2} darkness={vignette / 100} />
          ) : (
            <></>
          )}
        </EffectComposer>
      )}
    </>
  );
}
